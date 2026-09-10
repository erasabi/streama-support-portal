let express = require("express")
let router = express.Router()
let db = require("../database")
const { agentAuth } = require("../services/auth")
const { appendEvent, appendEventIfChanged } = require("../services/events")
const jobs = require("../services/jobs")
const { resolveRequest } = require("../services/requestPipeline")
const { subtitleEventsFromDetail } = require("../services/subtitleEvents")
const { jobKind, kindSql, jobDetail } = require("../services/jobKind")
const { literal, Op } = require("sequelize")
const { displayStatus, ADMIN_LABELS } = require("../services/status")
const { normalizeRequestId } = require("../utils/requestId")

function jobLibraryFields(job) {
	const detail = jobDetail(job)
	return {
		kind: jobKind(job),
		presentSeasons: Array.isArray(detail.presentSeasons) ? detail.presentSeasons : null,
		allowPresentSeasons: !!detail.allowPresentSeasons,
		missing: Array.isArray(detail.missing) ? detail.missing : null,
		tmdbId: detail.tmdbId || null,
		streamaMediaId: detail.streamaMediaId || null,
		languages: Array.isArray(detail.languages) ? detail.languages : null,
	}
}

router.use(agentAuth)

// Claimable jobs, with just enough request context for `rentify add`.
router.get("/v1/jobs", async function (req, res) {
	try {
		const status = req.query.status || "ready"
		const kind = req.query.kind || "download"
		const jobRows = await db.PipelineJob.findAll({
			where: {
				[Op.and]: [
					{
						claimStatus: status,
						...(req.query.claimedBy ? { claimedBy: req.query.claimedBy } : {}),
					},
					literal(kindSql(kind)),
				],
			},
			order: [["createdAt", "ASC"]],
			limit: 50,
		})
		const out = []
		for (const job of jobRows) {
			const request = job.requestId
				? await db.Request.findByPk(normalizeRequestId(job.requestId))
				: null
			if (request && request.archivedAt) continue
			out.push({
				jobId: job.id,
				requestId: job.requestId,
				mediaType: job.mediaType,
				folderName: job.folderName,
				sourceUrl: job.sourceUrl,
				subtitleUrl: request ? request.subtitleUrl : null,
				title: request ? request.title : null,
				requestUser: request ? request.requestUser : null,
				seasons: Array.isArray(job.seasons) ? job.seasons : null,
				stage: job.stage || null,
				infoHash: job.infoHash || null,
				claimStatus: job.claimStatus,
				claimedBy: job.claimedBy || null,
				ledger: job.ledger || null,
				...jobLibraryFields(job),
			})
		}
		res.status(200).json(out)
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

router.post("/v1/jobs/:id/claim", async function (req, res) {
	try {
		const claimedBy = (req.body && req.body.claimedBy) || req.agent
		const leaseMs = req.body && req.body.leaseMs
		const job = await jobs.claimJob(req.params.id, claimedBy, leaseMs || undefined)
		if (!job) return res.status(409).json({ error: "already claimed or not ready" })
		const request = job.requestId
			? await db.Request.findByPk(normalizeRequestId(job.requestId))
			: null
		res.status(200).json({
			jobId: job.id,
			requestId: job.requestId,
			folderName: job.folderName,
			sourceUrl: job.sourceUrl,
			subtitleUrl: request ? request.subtitleUrl : null,
			mediaType: job.mediaType,
			seasons: Array.isArray(job.seasons) ? job.seasons : null,
			leaseUntil: job.leaseUntil,
			ledger: job.ledger || null,
			...jobLibraryFields(job),
		})
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

router.post("/v1/jobs/:id/heartbeat", async function (req, res) {
	try {
		const leaseMs = req.body && req.body.leaseMs
		const job = await jobs.heartbeat(req.params.id, leaseMs || undefined)
		if (!job) return res.status(404).json({ error: "not found" })
		res.status(200).json({ jobId: job.id, leaseUntil: job.leaseUntil })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

router.post("/v1/jobs/:id/progress", async function (req, res) {
	try {
		const job = await jobs.recordProgress(req.params.id, req.body || {})
		if (!job) return res.status(404).json({ error: "not found" })
		res.status(200).json({ jobId: job.id, stage: job.stage })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

router.post("/v1/jobs/:id/release", async function (req, res) {
	try {
		const job = await jobs.releaseJob(req.params.id, req.body && req.body.reason)
		if (!job) return res.status(404).json({ error: "not found" })
		res.status(200).json({ jobId: job.id, claimStatus: job.claimStatus })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

// Sortify lookup: everything sortify needs to register + highlight, including
// the requester's name for the Dashboard Highlights description.
router.get("/v1/requests/by-tmdb/:id", async function (req, res) {
	try {
		const request = await db.Request.findByPk(normalizeRequestId(req.params.id))
		if (!request) return res.status(404).json({ error: "not found" })
		res.status(200).json({
			requestId: request.id,
			title: request.title,
			mediaType: request.mediaType,
			requestUser: request.requestUser,
			displayStatus: displayStatus(request),
			adminOverride:
				request.queueStatusSource === "admin" &&
				ADMIN_LABELS.includes(request.queueStatus)
					? request.queueStatus
					: null,
		})
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

// Generic event sink for CLI/sortify/unlinked pipeline activity. Resolves a
// request from whatever identity is provided; if none matches, the event is
// stored unlinked for the admin inbox instead of guessing.
router.post("/v1/events", async function (req, res) {
	try {
		const {
			requestId,
			folderName,
			infoHash,
			tmdbId,
			title,
			year,
			stage,
			progressPct,
			etaSeconds,
			detail,
			artifacts,
			streamaMediaId,
			streamaVideoId,
		} = req.body || {}

		const request = await resolveRequest({ requestId, folderName, tmdbId, title, year })

		if (!request) {
			await appendEvent({
				requestId: null,
				actor: req.agent === "sortify" ? "sortify" : "pipeline",
				type: "unlinked_activity",
				payload: { folderName, infoHash, tmdbId, title, year, stage, detail },
			})
			return res.status(202).json({ linked: false })
		}

		// Sortify highlight / streama id side-effects.
		const requestUpdates = {}
		if (streamaMediaId != null) requestUpdates.streamaMediaId = streamaMediaId
		if (streamaVideoId != null) requestUpdates.streamaVideoId = streamaVideoId
		if (stage === "highlighted" || stage === "available") {
			requestUpdates.highlightedAt = new Date()
		}
		if (Object.keys(requestUpdates).length) {
			await request.update(requestUpdates)
		}

		await appendEventIfChanged({
			requestId: request.id,
			actor: req.agent === "sortify" ? "sortify" : "pipeline",
			type: stage || "event",
			payload: { progressPct, etaSeconds, detail, folderName, infoHash },
		})

		// Surface subtitle upload results as their own timeline entries when an
		// agent reports them in `detail` (best-effort; contract is loose).
		for (const subtitleEvent of subtitleEventsFromDetail(detail)) {
			await appendEvent({
				requestId: request.id,
				actor: req.agent === "sortify" ? "sortify" : "pipeline",
				type: subtitleEvent.type,
				payload: subtitleEvent.payload,
			})
		}

		// "highlighted" maps to the "available" derived stage for display.
		const derivedStage = stage === "highlighted" ? "available" : stage
		if (derivedStage) {
			await jobs.applyStageToRequest(request.id, derivedStage, {
				progressPct: progressPct != null ? progressPct : undefined,
				etaSeconds: etaSeconds != null ? etaSeconds : undefined,
				detail,
			})
		}
		await jobs.applyArtifactsToRequest(request.id, artifacts)

		res.status(200).json({ linked: true, requestId: request.id })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

// Admin dry-run tickets for Prelanflix. Worker runs piratify --dry-run only.
router.get("/v1/dry-runs", async function (req, res) {
	try {
		const status = req.query.status || "ready"
		const rows = await db.PipelineDryRun.findAll({
			where: { status },
			order: [["createdAt", "ASC"]],
			limit: 20,
		})
		res.status(200).json(
			rows.map((row) => ({
				id: row.id,
				status: row.status,
				payload: row.payload || {},
			}))
		)
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

router.post("/v1/dry-runs/:id/claim", async function (req, res) {
	try {
		const claimedBy = (req.body && req.body.claimedBy) || req.agent || "pipeline"
		const [count] = await db.PipelineDryRun.update(
			{ status: "claimed", claimedBy, claimedAt: new Date() },
			{ where: { id: req.params.id, status: "ready" } }
		)
		if (!count) return res.status(409).json({ error: "already claimed or not ready" })
		const row = await db.PipelineDryRun.findByPk(req.params.id)
		res.status(200).json({ id: row.id, payload: row.payload || {} })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

router.post("/v1/dry-runs/:id/result", async function (req, res) {
	try {
		const row = await db.PipelineDryRun.findByPk(req.params.id)
		if (!row) return res.status(404).json({ error: "not found" })
		const ok = !(req.body && req.body.ok === false)
		await row.update({
			status: ok ? "done" : "failed",
			result: req.body && req.body.result != null ? req.body.result : req.body || {},
			error: ok ? null : (req.body && (req.body.error || req.body.message)) || "failed",
		})
		res.status(200).json({ id: row.id, status: ok ? "done" : "failed" })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

module.exports = router
