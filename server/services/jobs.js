const { Op } = require("sequelize")
const db = require("../database")
const { appendEvent, appendEventIfChanged } = require("./events")
const status = require("./status")
const { normalizeRequestId } = require("../utils/requestId")
const { subtitleEventFromDetail } = require("./subtitleEvents")
const { noTorrentsDetail } = require("./status")
const { classifySourceMiss } = require("./availability")
const {
	mergePipelineArtifacts,
	artifactsHaveContent,
} = require("./pipelineArtifacts")

const DEFAULT_LEASE_MS = 5 * 60 * 1000 // 5 minutes

// Stages at/after which a torrent may already be downloading in uTorrent.
// Reclaiming these to "ready" risks a double `rentify add`, so we keep them
// in_progress and only log that the lease lapsed.
const PAST_DOWNLOAD = new Set([
	"downloading",
	"encoding",
	"ready_to_sync",
	"syncing",
	"uploaded",
	"sorting",
	"registering",
	"pending_approval",
])

/**
 * Atomically claim a ready job. Returns the claimed job or null if it was
 * already taken (lost race).
 */
async function claimJob(jobId, claimedBy, leaseMs = DEFAULT_LEASE_MS) {
	const leaseUntil = new Date(Date.now() + leaseMs)
	// Conditional update guarantees only one claimer wins.
	const [count] = await db.PipelineJob.update(
		{
			claimStatus: "claimed",
			claimedBy: claimedBy || "pipeline",
			claimedAt: new Date(),
			leaseUntil,
			stage: "claimed",
		},
		{
			where: { id: jobId, claimStatus: "ready" },
		}
	)
	if (count === 0) return null
	const job = await db.PipelineJob.findByPk(jobId)
	await appendEvent({
		requestId: job.requestId,
		jobId: job.id,
		actor: "pipeline",
		type: "claimed",
		payload: { claimedBy: job.claimedBy },
	})
	await applyStageToRequest(job.requestId, "claimed", null)
	return job
}

async function heartbeat(jobId, leaseMs = DEFAULT_LEASE_MS) {
	const job = await db.PipelineJob.findByPk(jobId)
	if (!job) return null
	if (["completed", "cancelled", "failed"].includes(job.claimStatus)) return job
	await job.update({ leaseUntil: new Date(Date.now() + leaseMs) })
	return job
}

/**
 * Record progress for a job and propagate the derived stage to the request row.
 */
async function recordProgress(jobId, progress) {
	const job = await db.PipelineJob.findByPk(jobId)
	if (!job) return null
	const { stage, progressPct, etaSeconds, detail, infoHash, folderName, artifacts } =
		progress

	const updates = {
		leaseUntil: new Date(Date.now() + DEFAULT_LEASE_MS),
	}
	if (stage) updates.stage = stage
	if (progressPct != null) updates.progressPct = progressPct
	if (etaSeconds != null) updates.etaSeconds = etaSeconds
	if (detail != null) {
		const prev =
			job.detail && typeof job.detail === "object" && !Array.isArray(job.detail)
				? job.detail
				: {}
		const incoming =
			typeof detail === "object" && detail && !Array.isArray(detail)
				? detail
				: { value: detail }
		updates.detail = { ...prev, ...incoming }
	}
	if (infoHash) updates.infoHash = infoHash
	if (folderName) updates.folderName = folderName

	// Reflect claim lifecycle from stages.
	if (stage === "failed") {
		updates.claimStatus = "failed"
	} else if (stage === "not_yet_available" && noTorrentsDetail(detail)) {
		updates.claimStatus = "failed"
	} else if (stage === "uploaded" || stage === "available") {
		// Worker posts uploaded only when local media is gone. Leaving the job
		// in_progress makes the lease reaper log "Lease expired" forever.
		updates.claimStatus = "completed"
		updates.claimedBy = null
		updates.leaseUntil = null
	} else if (stage && stage !== "magnet_ready") {
		updates.claimStatus = "in_progress"
	}

	await job.update(updates)

	let requestStage = stage
	if (
		(stage === "failed" || stage === "not_yet_available") &&
		noTorrentsDetail(detail)
	) {
		const request = await db.Request.findByPk(normalizeRequestId(job.requestId))
		requestStage = await classifySourceMiss(request)
	}

	// Only record a timeline entry when the stage actually changes; repeated
	// heartbeats for the same stage update the job row but not history.
	await appendEventIfChanged({
		requestId: job.requestId,
		jobId: job.id,
		actor: "pipeline",
		type: requestStage || "progress",
		payload: { progressPct, etaSeconds, detail },
	})
	const subtitleEvent = subtitleEventFromDetail(detail)
	if (subtitleEvent) {
		await appendEvent({
			requestId: job.requestId,
			jobId: job.id,
			actor: "pipeline",
			type: subtitleEvent.type,
			payload: subtitleEvent.payload,
		})
	}
	if (stage) {
		await applyStageToRequest(job.requestId, requestStage, {
			progressPct: progressPct != null ? progressPct : undefined,
			etaSeconds: etaSeconds != null ? etaSeconds : undefined,
			detail,
		})
	}
	await applyArtifactsToRequest(job.requestId, artifacts)
	return job
}

/** Return a claimed/in_progress job to ready after a failed `rentify add`. */
async function releaseJob(jobId, reason) {
	const job = await db.PipelineJob.findByPk(jobId)
	if (!job) return null
	await job.update({
		claimStatus: "ready",
		claimedBy: null,
		claimedAt: null,
		leaseUntil: null,
		stage: "magnet_ready",
	})
	await appendEvent({
		requestId: job.requestId,
		jobId: job.id,
		actor: "pipeline",
		type: "released",
		payload: { reason: reason || null },
	})
	return job
}

/**
 * Propagate a job stage onto the parent request's denormalized fields, honoring
 * stage ordering (no regressions) and admin overrides.
 */
async function applyStageToRequest(requestId, stage, stageDetail) {
	if (!requestId) return
	const request = await db.Request.findByPk(normalizeRequestId(requestId))
	if (!request) return
	// Never override an explicit admin status label with derived progress,
	// except to surface a failure.
	const isAdminOverride =
		request.queueStatusSource === "admin" &&
		status.ADMIN_LABELS.includes(request.queueStatus)

	const updates = {}
	if (status.SORTIFY_COMPLETION_STAGES.has(stage)) {
		const inflight = await db.PipelineJob.findOne({
			where: {
				requestId: normalizeRequestId(requestId),
				claimStatus: { [Op.in]: ["claimed", "in_progress"] },
				stage: { [Op.in]: [...status.RENTIFY_IN_FLIGHT_STAGES] },
			},
		})
		// One episode in PRE-SORT / Streama must not mark the whole TV request
		// Available while rentify is still downloading or encoding the rest.
		if (inflight) return
	}
	if (status.shouldApplyDerivedStage(request.pipelineStage, stage)) {
		updates.pipelineStage = stage
	}
	if (stageDetail !== undefined) {
		updates.pipelineStageDetail = stageDetail || null
	}
	if (stage === "available" && !isAdminOverride) {
		// available media leaves the default Coming Soon grid (kept in history).
	}
	if (Object.keys(updates).length) {
		await request.update(updates)
	}
}

/**
 * Merge agent-reported file inventories onto the request. Empty ticks are ignored
 * so later {error,stat} progress cannot wipe a captured list.
 */
async function applyArtifactsToRequest(requestId, artifacts) {
	if (!requestId || !artifactsHaveContent(artifacts)) return
	const request = await db.Request.findByPk(normalizeRequestId(requestId))
	if (!request) return
	const merged = mergePipelineArtifacts(request.pipelineArtifacts, artifacts)
	await request.update({ pipelineArtifacts: merged })
}

/** Move expired-lease jobs back to ready (only if not yet downloading). */
async function reapExpiredLeases() {
	const now = new Date()
	const stuck = await db.PipelineJob.findAll({
		where: {
			claimStatus: { [Op.in]: ["claimed", "in_progress"] },
			leaseUntil: { [Op.lt]: now },
		},
	})
	for (const job of stuck) {
		if (job.stage === "uploaded" || job.stage === "available") {
			await job.update({
				claimStatus: "completed",
				claimedBy: null,
				claimedAt: job.claimedAt,
				leaseUntil: null,
			})
			continue
		}
		if (PAST_DOWNLOAD.has(job.stage)) {
			await appendEventIfChanged({
				requestId: job.requestId,
				jobId: job.id,
				actor: "portal",
				type: "lease_expired",
				payload: { stage: job.stage, kept: true },
			})
			// Extend lease slightly so we don't spam events every reap tick.
			await job.update({ leaseUntil: new Date(now.getTime() + DEFAULT_LEASE_MS) })
		} else {
			await job.update({
				claimStatus: "ready",
				claimedBy: null,
				claimedAt: null,
				leaseUntil: null,
				stage: "magnet_ready",
			})
			await appendEvent({
				requestId: job.requestId,
				jobId: job.id,
				actor: "portal",
				type: "lease_expired",
				payload: { stage: job.stage, requeued: true },
			})
		}
	}
	return stuck.length
}

module.exports = {
	claimJob,
	heartbeat,
	recordProgress,
	releaseJob,
	reapExpiredLeases,
	applyStageToRequest,
	applyArtifactsToRequest,
	DEFAULT_LEASE_MS,
}
