let express = require("express")
let router = express.Router()
let db = require("../database")
const { appendEvent } = require("../services/events")
const {
	runMagnetLookup,
	createReadyJob,
	enqueueSubtitleAcquireJob,
	createSubtitleRemediaRequest,
	enqueueTvSeasonsJob,
	enqueueTvSeasonUpdate,
	approveTvSeasons,
	mergeMagnetUrls,
} = require("../services/requestPipeline")
const jobs = require("../services/jobs")
const { isTvMedia, isTvSeasonFetch } = require("../services/tvSeasons")
const { isSubtitleRemediaMessage } = require("../services/subtitleRemedia")
const { extractInfoHash } = require("../services/magnetLookup")
const { displayStatus, ADMIN_LABELS } = require("../services/status")
const { canViewMagnet, isAdminRequest } = require("../services/auth")
const { loadPipelinePlanView } = require("../services/pipelinePlanView")
const { loadPipelineTrace } = require("../services/pipelineTrace")
const { runDryRun, loadDryRunReport, listDryRuns } = require("../services/pipelineDryRun")
const { normalizeRequestId, isNamespacedRequestId } = require("../utils/requestId")
const { isSubtitleAcquireJob } = require("../services/jobKind")

const getDbConnectionStatus = async () => {
	try {
		await db.sequelize.authenticate()
		console.log("Connection has been established successfully.")
	} catch (error) {
		console.error("Unable to connect to the database:", error)
	}
}
getDbConnectionStatus()

const UPDATE_ISSUE_LABELS = ["Request Update", "Report Issue"]

// Public list payload: never includes magnet/subtitle URLs.
function toPublicJSON(request) {
	const row = request.toJSON ? request.toJSON() : request
	const {
		magnetUrl,
		magnetUrls,
		magnetHash,
		subtitleUrl,
		queueEvents,
		pipelineArtifacts,
		...safe
	} = row
	return { ...safe, displayStatus: displayStatus(row) }
}

// Detail payload: includes magnet/subtitle only for the owner or an admin.
function toDetailJSON(request, req) {
	const row = request.toJSON ? request.toJSON() : request
	const base = { ...row, displayStatus: displayStatus(row) }
	delete base.queueEvents
	if (!canViewMagnet(req, request)) {
		delete base.magnetUrl
		delete base.magnetUrls
		delete base.magnetHash
		delete base.subtitleUrl
		delete base.pipelineArtifacts
	}
	return base
}

// Reconcile a request's attached sources against a new list of URLs.
// Creates ready jobs for added URLs and cancels still-`ready` jobs whose URL
// was removed (in-progress/claimed jobs are left alone). Returns the cleaned
// list actually stored.
async function syncRequestSources(request, urls, actor = "admin") {
	const clean = []
	for (const raw of Array.isArray(urls) ? urls : []) {
		const url = typeof raw === "string" ? raw.trim() : ""
		if (url && !clean.includes(url)) clean.push(url)
	}

	const previous = Array.isArray(request.magnetUrls)
		? request.magnetUrls.filter(Boolean)
		: request.magnetUrl
		? [request.magnetUrl]
		: []

	const added = clean.filter((u) => !previous.includes(u))
	const removed = previous.filter((u) => !clean.includes(u))

	const updates = {
		magnetUrls: clean,
		magnetUrl: clean[0] || null,
	}
	if (clean.length) {
		updates.magnetFoundAt = request.magnetFoundAt || new Date()
		updates.magnetLookupStatus = "found"
		if (request.pipelineStage == null || request.pipelineStage === "requested" || request.pipelineStage === "not_yet_available" || request.pipelineStage === "needs_manual_check" || request.pipelineStage === "looking_up_magnet" || request.pipelineStage === "failed") {
			updates.pipelineStage = "magnet_ready"
		}
	}
	await request.update(updates)

	for (const url of added) {
		await appendEvent({
			requestId: request.id,
			actor,
			type: "source_attached",
			payload: { mediaType: request.mediaType },
		})
		await createReadyJob(request, {
			sourceUrl: url,
			mediaType: request.mediaType,
			actor,
		})
	}

	if (removed.length) {
		const jobs = await db.PipelineJob.findAll({
			where: { requestId: request.id, claimStatus: "ready" },
		})
		for (const job of jobs) {
			if (isSubtitleAcquireJob(job)) continue
			const match = removed.some((u) =>
				job.infoHash
					? job.infoHash === extractInfoHash(u)
					: job.sourceUrl === u
			)
			if (!match) continue
			await job.update({ claimStatus: "cancelled" })
			await appendEvent({
				requestId: request.id,
				jobId: job.id,
				actor,
				type: "cancelled",
				payload: { reason: "source removed" },
			})
		}
	}

	return clean
}

router.get("/all", function (req, res) {
	db.Request.findAll({ where: { archivedAt: null } })
		.then((requests) => {
			res.status(200).json(requests.map(toPublicJSON))
		})
		.catch((err) => {
			res.status(500).send(JSON.stringify(err))
		})
})

// Admin: rehearse a request without creating anything. Runs the real source
// lookup plus Streama match/highlight checks, then reports what would happen.
// Registered before "/:id" routes so "dry-run" is never read as an id.
router.post("/dry-run", async function (req, res) {
	if (!isAdminRequest(req)) return res.status(403).json({ error: "admin only" })
	try {
		const report = await runDryRun(req.body || {})
		if (!report.ok) return res.status(400).json(report)
		res.status(200).json(report)
	} catch (err) {
		console.error("dry-run error:", err.message)
		res.status(500).json({ error: err.message })
	}
})

router.get("/dry-runs", async function (req, res) {
	if (!isAdminRequest(req)) return res.status(403).json({ error: "admin only" })
	try {
		const dryRuns = await listDryRuns({
			tmdbId: req.query.tmdbId,
			requestId: req.query.requestId,
		})
		res.status(200).json({ ok: true, dryRuns })
	} catch (err) {
		console.error("dry-run list error:", err.message)
		res.status(500).json({ error: err.message })
	}
})

router.get("/dry-run/:id", async function (req, res) {
	if (!isAdminRequest(req)) return res.status(403).json({ error: "admin only" })
	try {
		const report = await loadDryRunReport(req.params.id)
		if (!report.ok && report.error === "not found") {
			return res.status(404).json(report)
		}
		res.status(200).json(report)
	} catch (err) {
		console.error("dry-run poll error:", err.message)
		res.status(500).json({ error: err.message })
	}
})

router.get("/:id", async function (req, res) {
	try {
		const request = await db.Request.findByPk(normalizeRequestId(req.params.id))
		if (!request) return res.status(404).json({ error: "not found" })
		const detail = toDetailJSON(request, req)
		if (isAdminRequest(req)) {
			detail.pipelinePlan = await loadPipelinePlanView(request)
			const jobRows = await db.PipelineJob.findAll({
				where: { requestId: request.id },
				order: [["createdAt", "DESC"]],
			})
			const subJob = jobRows.find((j) => isSubtitleAcquireJob(j))
			detail.subtitleAcquire = subJob
				? {
						jobId: subJob.id,
						claimStatus: subJob.claimStatus,
						stage: subJob.stage || null,
				  }
				: null
		}
		res.status(200).json(detail)
	} catch (err) {
		res.status(500).send(JSON.stringify(err))
	}
})

router.get("/:id/events", async function (req, res) {
	if (!isAdminRequest(req)) return res.status(403).json({ error: "admin only" })
	try {
		const events = await db.RequestEvent.findAll({
			where: { requestId: normalizeRequestId(req.params.id) },
			order: [["createdAt", "DESC"]],
		})
		res.status(200).json(events)
	} catch (err) {
		res.status(500).send(JSON.stringify(err))
	}
})

// Admin: the full cross-hop trace for one request. Read-only. Self-contained by
// design -- the whole response is meant to be pasted into a debug agent.
// `?remote=0` skips the optional Prelanflix/Sortify calls.
router.get("/:id/trace", async function (req, res) {
	if (!isAdminRequest(req)) return res.status(403).json({ error: "admin only" })
	try {
		const request = await db.Request.findByPk(normalizeRequestId(req.params.id))
		if (!request) return res.status(404).json({ error: "not found" })
		const trace = await loadPipelineTrace(request, {
			includeRemote: req.query.remote !== "0" && req.query.remote !== "false",
		})
		res.status(200).json(trace)
	} catch (err) {
		console.error("trace error:", err.message)
		res.status(500).json({ error: err.message })
	}
})

router.put("/", async function (req, res) {
	try {
		const incomingStatus = req.body.queueStatus || null
		const mediaType = req.body.mediaType || req.body.media_type || null
		const isUpdateIssue = UPDATE_ISSUE_LABELS.includes(incomingStatus)

		// TV "Fetch New Seasons" is a pipeline request on the TMDB id, not an
		// inbox ticket. Namespacing it left cards stuck at Requested forever.
		if (isTvSeasonFetch(mediaType, req.body.queueMessage)) {
			const request = await enqueueTvSeasonUpdate(req.body)
			if (!request) return res.status(400).json({ error: "missing tmdb id" })
			return res.status(200).json(toPublicJSON(request))
		}

		if (
			isUpdateIssue &&
			isSubtitleRemediaMessage(req.body.queueMessage)
		) {
			const result = await createSubtitleRemediaRequest(
				req.body,
				req.body.requestUser || "user"
			)
			if (result.error && !result.request) {
				return res.status(result.status || 400).json({ error: result.error })
			}
			return res.status(200).json(toPublicJSON(result.request))
		}

		// Namespace update/issue rows so they never collide with the pipeline
		// request PK (the plain TMDB id).
		let id = normalizeRequestId(req.body.id)
		if (isUpdateIssue) {
			const prefix = incomingStatus === "Report Issue" ? "issue" : "update"
			id = `${prefix}:${normalizeRequestId(req.body.id)}:${Date.now()}`
		} else {
			// Idempotent create: if an active request already exists, don't
			// insert a duplicate row.
			const existing = await db.Request.findByPk(id)
			if (existing && !existing.archivedAt) {
				return res.status(200).json(toPublicJSON(existing))
			}
			if (existing && existing.archivedAt) {
				// Re-requesting an archived title: revive it.
				await existing.update({
					archivedAt: null,
					queueStatus: incomingStatus,
					queueStatusSource: "derived",
					pipelineStage: "requested",
					magnetLookupStatus: "pending",
					requestUser: req.body.requestUser || existing.requestUser,
				})
				await appendEvent({
					requestId: existing.id,
					actor: "user",
					type: "re_requested",
					payload: { requestUser: existing.requestUser },
				})
				if (existing.mediaType === "movie") {
					runMagnetLookup(existing).catch((e) =>
						console.error("lookup error:", e.message)
					)
				} else if (isTvMedia(existing.mediaType)) {
					existing
						.update({ magnetLookupStatus: "not_applicable" })
						.catch(() => {})
					enqueueTvSeasonsJob(existing, { forceSeasonPlan: true }).catch(
						(e) => console.error("tv enqueue error:", e.message)
					)
				} else {
					existing.update({ magnetLookupStatus: "not_applicable" }).catch(() => {})
				}
				return res.status(200).json(toPublicJSON(existing))
			}
		}

		const request = await db.Request.create({
			id,
			title: req.body.title || "",
			posterPath: req.body.posterPath || "",
			createdAt: req.body.createdAt || new Date(),
			originalTitle: req.body.originalTitle || null,
			releaseDate: req.body.releaseDate || null,
			adult: req.body.adult || false,
			mediaType,
			queueStatus: incomingStatus,
			queueMessage: req.body.queueMessage || null,
			requestUser: req.body.requestUser || null,
			queueStatusSource: isUpdateIssue ? "admin" : "derived",
			pipelineStage: isUpdateIssue ? null : "requested",
			magnetLookupStatus:
				mediaType === "movie" && !isUpdateIssue ? "pending" : "not_applicable",
		})

		await appendEvent({
			requestId: request.id,
			actor: "user",
			type: isUpdateIssue ? "update_requested" : "requested",
			payload: {
				requestUser: request.requestUser,
				queueStatus: incomingStatus,
				queueMessage: request.queueMessage,
			},
		})

		// Kick off the movie magnet lookup asynchronously (don't block the UI).
		if (mediaType === "movie" && !isUpdateIssue) {
			runMagnetLookup(request).catch((e) =>
				console.error("lookup error:", e.message)
			)
		} else if (isTvMedia(mediaType) && !isUpdateIssue) {
			enqueueTvSeasonsJob(request).catch((e) =>
				console.error("tv enqueue error:", e.message)
			)
		}

		res.status(200).json(toPublicJSON(request))
	} catch (err) {
		console.error("create request error:", err.message)
		res.status(500).send(JSON.stringify(err.message))
	}
})

router.put("/:id", async function (req, res) {
	try {
		const request = await db.Request.findByPk(normalizeRequestId(req.params.id))
		if (!request) return res.status(404).json({ error: "not found" })

		const newStatus = req.body.queueStatus || null
		const nextMessage =
			req.body.queueMessage !== undefined ? req.body.queueMessage : request.queueMessage
		const nextType = req.body.mediaType || request.mediaType
		if (isTvSeasonFetch(nextType, nextMessage)) {
			const promoted = await enqueueTvSeasonUpdate({
				...(request.toJSON ? request.toJSON() : request),
				...req.body,
				id: request.id,
				mediaType: nextType,
				queueMessage: nextMessage,
			})
			if (isNamespacedRequestId(request.id) && promoted && promoted.id !== request.id) {
				await request.update({ archivedAt: new Date() })
			}
			return res.status(200).json(toPublicJSON(promoted || request))
		}

		const isAdminLabel = ADMIN_LABELS.includes(newStatus)

		const updates = {
			title: req.body.title || request.title,
			posterPath: req.body.posterPath || request.posterPath,
			originalTitle: req.body.originalTitle || request.originalTitle,
			releaseDate: req.body.releaseDate || request.releaseDate,
			adult: req.body.adult != null ? req.body.adult : request.adult,
			mediaType: req.body.mediaType || request.mediaType,
			queueStatus: newStatus,
			queueMessage: req.body.queueMessage || null,
			requestUser: req.body.requestUser || request.requestUser,
			// Any explicit status set through this admin route is an override.
			queueStatusSource: isAdminLabel ? "admin" : "derived",
		}

		// "Unavailable" stops magnet retries and cancels queued work.
		if (newStatus === "Unavailable") {
			updates.magnetLookupStatus = "stopped"
		}

		await request.update(updates)

		await appendEvent({
			requestId: request.id,
			actor: "admin",
			type: "admin_status_change",
			payload: { queueStatus: newStatus, queueMessage: updates.queueMessage },
		})

		if (newStatus === "Unavailable") {
			const jobs = await db.PipelineJob.findAll({
				where: { requestId: request.id, claimStatus: "ready" },
			})
			for (const job of jobs) {
				await job.update({ claimStatus: "cancelled" })
				await appendEvent({
					requestId: request.id,
					jobId: job.id,
					actor: "admin",
					type: "cancelled",
					payload: { reason: "marked Unavailable" },
				})
			}
		}

		// Multi-source sync (admin only). Accepts `magnetUrls` (array) or a
		// single `magnetUrl`; reconciles pipeline jobs accordingly.
		if (
			isAdminRequest(req) &&
			(req.body.magnetUrls !== undefined || req.body.magnetUrl !== undefined)
		) {
			const urls =
				req.body.magnetUrls !== undefined
					? req.body.magnetUrls
					: req.body.magnetUrl
					? [req.body.magnetUrl]
					: []
			await syncRequestSources(request, urls, "admin")
		}

		res.status(200).json(toPublicJSON(request))
	} catch (err) {
		console.error("update request error:", err.message)
		res.status(500).send(JSON.stringify(err.message))
	}
})

// Admin attaches one or more magnet/URL sources (TV, or movie fallback).
// Accepts `sourceUrls` (array), `magnetUrls` (array), `sourceUrl`, or
// `magnetUrl`. Additive: merges with any sources already attached.
router.post("/:id/source", async function (req, res) {
	if (!isAdminRequest(req)) return res.status(403).json({ error: "admin only" })
	try {
		const request = await db.Request.findByPk(normalizeRequestId(req.params.id))
		if (!request) return res.status(404).json({ error: "not found" })

		const incoming = []
		if (Array.isArray(req.body.sourceUrls)) incoming.push(...req.body.sourceUrls)
		if (Array.isArray(req.body.magnetUrls)) incoming.push(...req.body.magnetUrls)
		if (req.body.sourceUrl) incoming.push(req.body.sourceUrl)
		if (req.body.magnetUrl) incoming.push(req.body.magnetUrl)
		if (!incoming.length) {
			return res.status(400).json({ error: "sourceUrl(s) required" })
		}

		if (req.body.subtitleUrl) {
			await request.update({ subtitleUrl: req.body.subtitleUrl })
		}

		const merged = mergeMagnetUrls(
			Array.isArray(request.magnetUrls)
				? request.magnetUrls
				: request.magnetUrl
				? [request.magnetUrl]
				: [],
			null
		)
		for (const u of incoming) {
			const url = typeof u === "string" ? u.trim() : ""
			if (url && !merged.includes(url)) merged.push(url)
		}

		await syncRequestSources(request, merged, "admin")
		res.status(200).json({ request: toPublicJSON(request), magnetUrls: merged })
	} catch (err) {
		console.error("attach source error:", err.message)
		res.status(500).send(JSON.stringify(err.message))
	}
})

// Admin replaces the full source list for a request (add + remove in one call).
// Used by the details modal to persist edits on Update or on dismiss.
router.put("/:id/sources", async function (req, res) {
	if (!isAdminRequest(req)) return res.status(403).json({ error: "admin only" })
	try {
		const request = await db.Request.findByPk(normalizeRequestId(req.params.id))
		if (!request) return res.status(404).json({ error: "not found" })
		const urls = Array.isArray(req.body.magnetUrls) ? req.body.magnetUrls : []
		const stored = await syncRequestSources(request, urls, "admin")
		res.status(200).json({ magnetUrls: stored })
	} catch (err) {
		console.error("save sources error:", err.message)
		res.status(500).send(JSON.stringify(err.message))
	}
})

// Admin queues some or all gap seasons that were held for approval.
router.post("/:id/subtitles", async function (req, res) {
	if (!isAdminRequest(req)) return res.status(403).json({ error: "admin only" })
	try {
		const request = await db.Request.findByPk(normalizeRequestId(req.params.id))
		if (!request) return res.status(404).json({ error: "not found" })
		const result = await enqueueSubtitleAcquireJob(request, "admin")
		if (result.error) {
			return res.status(result.status || 400).json({
				error: result.error,
				jobId: result.job && result.job.id,
			})
		}
		res.status(200).json({
			jobId: result.job.id,
			claimStatus: result.job.claimStatus,
			stage: result.job.stage,
			request: toPublicJSON(request),
		})
	} catch (err) {
		console.error("add subtitles error:", err.message)
		res.status(500).json({ error: err.message })
	}
})

router.post("/:id/seasons", async function (req, res) {
	if (!isAdminRequest(req)) return res.status(403).json({ error: "admin only" })
	try {
		const request = await db.Request.findByPk(normalizeRequestId(req.params.id))
		if (!request) return res.status(404).json({ error: "not found" })
		const result = await approveTvSeasons(request, req.body.seasons, "admin")
		if (!result) {
			return res.status(400).json({ error: "select at least one pending season" })
		}
		res.status(200).json({
			request: toPublicJSON(result.request),
			seasons: result.seasons,
			remaining: result.remaining,
			jobId: result.job && result.job.id,
		})
	} catch (err) {
		console.error("approve seasons error:", err.message)
		res.status(500).send(JSON.stringify(err.message))
	}
})

// Admin: put failed/cancelled jobs back on the ready queue (same source).
router.post("/:id/requeue", async function (req, res) {
	if (!isAdminRequest(req)) return res.status(403).json({ error: "admin only" })
	try {
		const request = await db.Request.findByPk(normalizeRequestId(req.params.id))
		if (!request) return res.status(404).json({ error: "not found" })
		const count = await jobs.requeueJobsForRequest(
			request.id,
			req.body && req.body.reason
		)
		await request.reload()
		res.status(200).json({ requeued: count, request: toPublicJSON(request) })
	} catch (err) {
		console.error("requeue error:", err.message)
		res.status(500).json({ error: err.message })
	}
})

// Admin: fail in-flight jobs so the UI is not stuck Downloading/Encoding.
router.post("/:id/fail-pipeline", async function (req, res) {
	if (!isAdminRequest(req)) return res.status(403).json({ error: "admin only" })
	try {
		const request = await db.Request.findByPk(normalizeRequestId(req.params.id))
		if (!request) return res.status(404).json({ error: "not found" })
		const count = await jobs.failJobsForRequest(
			request.id,
			req.body && req.body.reason
		)
		await request.reload()
		res.status(200).json({ failed: count, request: toPublicJSON(request) })
	} catch (err) {
		console.error("fail-pipeline error:", err.message)
		res.status(500).json({ error: err.message })
	}
})

router.delete("/:id", async function (req, res) {
	try {
		const request = await db.Request.findByPk(normalizeRequestId(req.params.id))
		if (!request) return res.status(404).json({ error: "not found" })

		await request.update({ archivedAt: new Date() })
		await appendEvent({
			requestId: request.id,
			actor: "admin",
			type: "archived",
			payload: null,
		})

		// Cancel any active jobs so the pipeline can `rentify remove`.
		const jobs = await db.PipelineJob.findAll({
			where: {
				requestId: request.id,
				claimStatus: ["ready", "claimed", "in_progress"],
			},
		})
		for (const job of jobs) {
			await job.update({ claimStatus: "cancelled" })
			await appendEvent({
				requestId: request.id,
				jobId: job.id,
				actor: "admin",
				type: "cancelled",
				payload: { reason: "request archived" },
			})
		}

		res.status(200).send()
	} catch (err) {
		res.status(500).send(JSON.stringify(err.message))
	}
})

module.exports = router
