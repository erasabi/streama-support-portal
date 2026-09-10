const { Op } = require("sequelize")
const db = require("../database")
const { appendEvent, appendEventIfChanged } = require("./events")
const status = require("./status")
const { normalizeRequestId } = require("../utils/requestId")
const { subtitleEventsFromDetail } = require("./subtitleEvents")
const { isSubtitleAcquireJob } = require("./jobKind")
const { noTorrentsDetail } = require("./status")
const { classifySourceMiss } = require("./availability")
const {
	mergePipelineArtifacts,
	artifactsHaveContent,
} = require("./pipelineArtifacts")
const { mergePipelineLedger } = require("./pipelineLedger")
const {
	DEFAULT_LEASE_MS,
	PAST_DOWNLOAD,
	shouldFailStalledLease,
	stuckTtlMs,
} = require("./jobs.lease")

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
	let job = await db.PipelineJob.findByPk(jobId)
	if (isSubtitleAcquireJob(job) && job.stage === "claimed") {
		await job.update({ stage: "acquiring_subtitles" })
		job = await db.PipelineJob.findByPk(jobId)
	}
	await appendEvent({
		requestId: job.requestId,
		jobId: job.id,
		actor: isSubtitleAcquireJob(job) ? "sortify" : "pipeline",
		type: "claimed",
		payload: {
			claimedBy: job.claimedBy,
			...(isSubtitleAcquireJob(job) ? { kind: "subtitle_acquire" } : {}),
		},
	})
	if (!isSubtitleAcquireJob(job)) {
		await applyStageToRequest(job.requestId, "claimed", null)
	}
	return job
}

async function heartbeat(jobId, leaseMs = DEFAULT_LEASE_MS) {
	const job = await db.PipelineJob.findByPk(jobId)
	if (!job) return null
	if (["completed", "cancelled", "failed"].includes(job.claimStatus)) return job
	// paused+ready is waiting on disk, not an in_progress lease.
	if (job.claimStatus === "ready" || job.stage === "paused") return job
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

	const updates = {}
	if (stage !== "paused") {
		updates.leaseUntil = new Date(Date.now() + DEFAULT_LEASE_MS)
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

	const subtitleJob = isSubtitleAcquireJob({
		detail: updates.detail || job.detail,
	})
	const incomingDetail =
		detail != null && typeof detail === "object" && !Array.isArray(detail)
			? detail
			: {}

	// Reflect claim lifecycle from stages.
	if (subtitleJob) {
		if (stage === "failed") {
			updates.claimStatus = "failed"
		} else if (incomingDetail.subtitleAcquire && incomingDetail.finish) {
			updates.claimStatus = "completed"
			updates.claimedBy = null
			updates.leaseUntil = null
		} else if (stage && stage !== "magnet_ready") {
			updates.claimStatus = "in_progress"
		}
	} else if (stage === "failed") {
		updates.claimStatus = "failed"
	} else if (stage === "paused") {
		// Prelanflix owns disk; do not claim or fail. Stay ready until watermark recovers.
		updates.claimStatus = "ready"
		updates.claimedBy = null
		updates.claimedAt = null
		updates.leaseUntil = null
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

	const mergedDetail =
		updates.detail ||
		(job.detail && typeof job.detail === "object" && !Array.isArray(job.detail)
			? job.detail
			: {})
	updates.ledger = mergePipelineLedger(job.ledger, {
		infoHash: infoHash || job.infoHash,
		detail:
			detail != null && typeof detail === "object" && !Array.isArray(detail)
				? detail
				: {},
		artifacts,
	})

	if (stage && stage !== "failed") {
		if (mergedDetail && mergedDetail.stalledSince) {
			updates.detail = { ...mergedDetail, stalledSince: null }
		}
	}

	const previousStage = job.stage
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
	for (const subtitleEvent of subtitleEventsFromDetail(detail)) {
		await appendEvent({
			requestId: job.requestId,
			jobId: job.id,
			actor: subtitleJob ? "sortify" : "pipeline",
			type: subtitleEvent.type,
			payload: subtitleEvent.payload,
		})
	}
	if (stage && !(subtitleJob && requestStage === "failed")) {
		await applyStageToRequest(job.requestId, requestStage, {
			progressPct: progressPct != null ? progressPct : undefined,
			etaSeconds: etaSeconds != null ? etaSeconds : undefined,
			detail,
		})
	}
	if (subtitleJob && incomingDetail.subtitleAcquire && incomingDetail.finish) {
		const { archiveSubtitleRemediaIfDone } = require("./requestPipeline")
		await archiveSubtitleRemediaIfDone(job.requestId)
	} else if (subtitleJob && stage === "failed") {
		const { markSubtitleRemediaFailed } = require("./requestPipeline")
		await markSubtitleRemediaFailed(job.requestId)
	}
	await applyArtifactsToRequest(job.requestId, artifacts)
	if (stage === "failed") {
		await maybeRelookupMovieMagnet(job, previousStage)
	}
	return job
}

const MAX_MAGNET_RELOOKUPS = 2

async function maybeRelookupMovieMagnet(job, failedFromStage) {
	try {
		if (job.mediaType !== "movie") return
		if (!["downloading", "claimed", "magnet_ready"].includes(failedFromStage)) {
			return
		}
		if (!job.requestId) return
		const request = await db.Request.findByPk(normalizeRequestId(job.requestId))
		if (!request || request.magnetLookupStatus === "stopped") return
		const prevDetail =
			request.pipelineStageDetail &&
			typeof request.pipelineStageDetail === "object" &&
			!Array.isArray(request.pipelineStageDetail)
				? request.pipelineStageDetail
				: {}
		const n = Number(prevDetail.magnetRelookups) || 0
		if (n >= MAX_MAGNET_RELOOKUPS) return
		await request.update({
			magnetLookupStatus: "pending",
			pipelineStageDetail: { ...prevDetail, magnetRelookups: n + 1 },
		})
		await request.reload()
		const { runMagnetLookup } = require("./requestPipeline")
		await runMagnetLookup(request, { force: true })
	} catch (err) {
		console.error("magnet re-lookup after download fail:", err.message)
	}
}

/** Return a claimed/in_progress job to ready after a failed `rentify add`. */
async function releaseJob(jobId, reason) {
	const job = await db.PipelineJob.findByPk(jobId)
	if (!job) return null
	const subtitleJob = isSubtitleAcquireJob(job)
	await job.update({
		claimStatus: "ready",
		claimedBy: null,
		claimedAt: null,
		leaseUntil: null,
		stage: subtitleJob ? "acquiring_subtitles" : "magnet_ready",
	})
	await appendEvent({
		requestId: job.requestId,
		jobId: job.id,
		actor: "pipeline",
		type: "released",
		payload: { reason: reason || null, ...(subtitleJob ? { kind: "subtitle_acquire" } : {}) },
	})
	if (!subtitleJob) {
		await applyStageToRequest(job.requestId, "magnet_ready", {
			reason: reason || "released",
		})
	}
	return job
}

/** Admin: put failed/cancelled jobs back on the ready queue. */
async function requeueJobsForRequest(requestId, reason) {
	const rows = await db.PipelineJob.findAll({
		where: {
			requestId: normalizeRequestId(requestId),
			claimStatus: { [Op.in]: ["failed", "cancelled"] },
		},
	})
	let downloadRequeued = 0
	for (const job of rows) {
		const prev =
			job.detail && typeof job.detail === "object" && !Array.isArray(job.detail)
				? job.detail
				: {}
		const subtitleJob = isSubtitleAcquireJob(job)
		await job.update({
			claimStatus: "ready",
			claimedBy: null,
			claimedAt: null,
			leaseUntil: null,
			stage: subtitleJob ? "acquiring_subtitles" : "magnet_ready",
			detail: { ...prev, stalledSince: null },
		})
		await appendEvent({
			requestId: job.requestId,
			jobId: job.id,
			actor: "admin",
			type: "requeued",
			payload: {
				reason: reason || null,
				...(subtitleJob ? { kind: "subtitle_acquire" } : {}),
			},
		})
		if (!subtitleJob) downloadRequeued += 1
	}
	if (downloadRequeued) {
		await applyStageToRequest(requestId, "magnet_ready", {
			reason: reason || "requeued",
		})
	}
	return rows.length
}

/** Admin: mark claimed/in_progress jobs failed. */
async function failJobsForRequest(requestId, reason) {
	const rows = await db.PipelineJob.findAll({
		where: {
			requestId: normalizeRequestId(requestId),
			claimStatus: { [Op.in]: ["claimed", "in_progress"] },
		},
	})
	for (const job of rows) {
		await recordProgress(job.id, {
			stage: "failed",
			detail: { error: reason || "admin failed" },
		})
	}
	return rows.length
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
			const prev =
				job.detail && typeof job.detail === "object" && !Array.isArray(job.detail)
					? job.detail
					: {}
			const stalledSince = prev.stalledSince || now.toISOString()
			if (shouldFailStalledLease(job.stage, stalledSince, now.getTime())) {
				const hours = Math.round(stuckTtlMs(job.stage) / 3600000)
				await recordProgress(job.id, {
					stage: "failed",
					detail: {
						error: `stalled: no worker heartbeat for ${hours}h at ${job.stage}`,
						stalledSince,
					},
				})
				continue
			}
			await appendEventIfChanged({
				requestId: job.requestId,
				jobId: job.id,
				actor: "portal",
				type: "lease_expired",
				payload: { stage: job.stage, kept: true, stalledSince },
			})
			await job.update({
				leaseUntil: new Date(now.getTime() + DEFAULT_LEASE_MS),
				detail: { ...prev, stalledSince },
			})
		} else {
			const subtitleJob = isSubtitleAcquireJob(job)
			await job.update({
				claimStatus: "ready",
				claimedBy: null,
				claimedAt: null,
				leaseUntil: null,
				stage: subtitleJob ? "acquiring_subtitles" : "magnet_ready",
			})
			await appendEvent({
				requestId: job.requestId,
				jobId: job.id,
				actor: "portal",
				type: "lease_expired",
				payload: {
					stage: job.stage,
					requeued: true,
					...(subtitleJob ? { kind: "subtitle_acquire" } : {}),
				},
			})
			if (!subtitleJob) {
				await applyStageToRequest(job.requestId, "magnet_ready", {
					reason: "lease_expired",
				})
			}
		}
	}
	return stuck.length
}

module.exports = {
	claimJob,
	heartbeat,
	recordProgress,
	releaseJob,
	requeueJobsForRequest,
	failJobsForRequest,
	reapExpiredLeases,
	applyStageToRequest,
	applyArtifactsToRequest,
	DEFAULT_LEASE_MS,
}
