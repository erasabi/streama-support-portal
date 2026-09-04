const { Op } = require("sequelize")
const db = require("../database")
const { appendEvent, appendEventIfChanged } = require("./events")
const {
	lookupMovieMagnet,
	getYifySubtitleUrl,
	extractInfoHash,
} = require("./magnetLookup")
const {
	normalizeRequestId,
	canonicalTmdbId,
	isNamespacedRequestId,
} = require("../utils/requestId")
const status = require("./status")
const { classifySourceMiss } = require("./availability")
const {
	isTvMedia,
	isTvSeasonFetch,
	normalizeSeasons,
	seasonsKey,
	normalizeMissing,
	missingKey,
	planTvSeasons,
	pendingSeasonsOf,
	missingCodesForSeasons,
} = require("./tvSeasons")
const { lookupLibraryMovie, mediaHasVideo } = require("./streamaLibrary")

// Recover the portal request id embedded in a pipeline folder name
// ("...-tmdb603" -> "603").
function tmdbFromFolder(folderName) {
	if (!folderName) return null
	const m = folderName.match(/tmdb(\d+)/i)
	return m ? m[1] : null
}

/**
 * Resolve a request from whatever identity a pipeline/sortify event carries.
 * Order: explicit requestId -> tmdb in folder name -> explicit tmdbId ->
 * unique fuzzy title(+year) match. Returns null if nothing matches uniquely.
 */
async function resolveRequest({ requestId, folderName, tmdbId, title, year }) {
	if (requestId) {
		const byId = await db.Request.findByPk(normalizeRequestId(requestId))
		if (byId) return byId
	}
	const folderTmdb = tmdbFromFolder(folderName)
	if (folderTmdb) {
		const byFolder = await db.Request.findByPk(normalizeRequestId(folderTmdb))
		if (byFolder) return byFolder
	}
	if (tmdbId) {
		const byTmdb = await db.Request.findByPk(normalizeRequestId(tmdbId))
		if (byTmdb) return byTmdb
	}
	if (title) {
		const where = {
			archivedAt: { [Op.is]: null },
			title: { [Op.iLike]: title.trim() },
		}
		if (year) where.releaseDate = { [Op.like]: `${year}%` }
		const matches = await db.Request.findAll({ where, limit: 2 })
		if (matches.length === 1) return matches[0]
	}
	return null
}

// Merge a new source URL into an existing magnetUrls array, de-duplicating
// while preserving order (first entry stays canonical for agent GET /jobs).
function mergeMagnetUrls(existing, url) {
	const list = Array.isArray(existing) ? existing.filter(Boolean) : []
	if (url && !list.includes(url)) list.push(url)
	return list
}

// Build the folder-name contract the pipeline carries end-to-end so later
// stages can recover the portal request id: "{title}-{year}-tmdb{id}". When a
// request has multiple sources, a short info-hash suffix keeps each job's
// `rentify add -f` folder distinct.
function buildFolderName(request, infoHash) {
	const rawTitle = (request.title || "media").toString()
	const slug = rawTitle
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
	const year = (request.releaseDate || "").slice(0, 4)
	const parts = [slug]
	if (/^\d{4}$/.test(year)) parts.push(year)
	parts.push(`tmdb${request.id}`)
	if (infoHash) parts.push(infoHash.slice(0, 8).toLowerCase())
	return parts.filter(Boolean).join("-")
}

function jobMissingList(job) {
	const detail = job && job.detail && typeof job.detail === "object" ? job.detail : {}
	return Array.isArray(detail.missing) ? detail.missing : null
}

function missingIsSubset(inner, outer) {
	const a = normalizeMissing(inner)
	const b = new Set(normalizeMissing(outer) || [])
	if (!a) return false
	return a.every((c) => b.has(c))
}

function isSameSource(job, sourceUrl, infoHash, seasons, missing) {
	if (!job) return false
	if (sourceUrl) {
		return infoHash ? job.infoHash === infoHash : job.sourceUrl === sourceUrl
	}
	if (!job.sourceUrl) {
		const existingMissing = jobMissingList(job)
		const incoming = Array.isArray(missing) ? missing : null
		if (existingMissing && incoming) {
			if (missingKey(existingMissing) === missingKey(incoming)) return true
			return missingIsSubset(incoming, existingMissing)
		}
		return seasonsKey(job.seasons) === seasonsKey(seasons)
	}
	return false
}

async function emitSubtitleLookup(requestId, { found, url, error }) {
	await appendEvent({
		requestId,
		actor: "portal",
		type: "subtitle_lookup",
		payload: {
			language: "en",
			found: !!found,
			url: url || undefined,
			error: error || undefined,
		},
	})
}

/**
 * Create a claimable pipeline job for a request. A request may have multiple
 * sources (e.g. several magnets); we avoid duplicating an active job for the
 * SAME source (matched by infoHash when available, else the raw URL) but do
 * allow distinct sources to run in parallel.
 *
 * TV jobs with no sourceUrl carry `seasons` (legacy) and episode-grain
 * `missing` (`SxxEyy`) so piratify fetches only absent episodes.
 */
async function createReadyJob(
	request,
	{ sourceUrl, mediaType, actor = "portal", seasons, presentSeasons, allowPresentSeasons, missing } = {},
) {
	const url = sourceUrl || null
	const seasonList = normalizeSeasons(seasons)
	const explicitMissing = Array.isArray(missing)
	const missingList = explicitMissing ? normalizeMissing(missing) : null
	if (!url && explicitMissing && !missingList) {
		console.error("planner bug: TV job with empty missing[]", {
			requestId: request && request.id,
			seasons: seasonList,
		})
		return null
	}
	if (!url && !seasonList) return null
	const infoHash = url ? extractInfoHash(url) : null

	const active = await db.PipelineJob.findAll({
		where: {
			requestId: request.id,
			claimStatus: ["ready", "claimed", "in_progress"],
		},
	})
	const duplicate = active.find((j) =>
		isSameSource(j, url, infoHash, seasonList, explicitMissing ? missing : undefined),
	)
	if (duplicate) {
		if (status.shouldApplyDerivedStage(request.pipelineStage, "magnet_ready")) {
			await request.update({ pipelineStage: "magnet_ready" })
		}
		return duplicate
	}

	const presentList = normalizeSeasons(presentSeasons)
	const detail = {
		...(presentList ? { presentSeasons: presentList } : {}),
		...(allowPresentSeasons ? { allowPresentSeasons: true } : {}),
		...(missingList ? { missing: missingList } : {}),
	}

	const job = await db.PipelineJob.create({
		requestId: request.id,
		mediaType: mediaType || request.mediaType || null,
		sourceUrl: url,
		infoHash,
		folderName: buildFolderName(request, infoHash),
		claimStatus: "ready",
		stage: "magnet_ready",
		seasons: seasonList,
		detail: Object.keys(detail).length ? detail : null,
	})

	if (status.shouldApplyDerivedStage(request.pipelineStage, "magnet_ready")) {
		await request.update({ pipelineStage: "magnet_ready" })
	}

	await appendEvent({
		requestId: request.id,
		jobId: job.id,
		actor,
		type: "job_created",
		payload: {
			folderName: job.folderName,
			mediaType: job.mediaType,
			seasons: seasonList || undefined,
			presentSeasons: presentList || undefined,
			missing: missingList || undefined,
		},
	})
	return job
}

function fieldsFromBody(body = {}) {
	return {
		title: body.title || "",
		posterPath: body.posterPath || body.poster_path || "",
		originalTitle:
			body.originalTitle || body.original_name || body.original_title || null,
		releaseDate:
			body.releaseDate || body.release_date || body.first_air_date || null,
		adult: !!body.adult,
		mediaType: body.mediaType || body.media_type || "tv",
		queueMessage: body.queueMessage || null,
		requestUser: body.requestUser || null,
	}
}

/**
 * Find or create the pipeline request for a TMDB id, then enqueue missing
 * seasons. Used for "Fetch New Seasons" so we never attach a job to a
 * namespaced `update:{tmdb}:{ts}` row (folder names must contain tmdb{digits}).
 */
async function enqueueTvSeasonUpdate(body, deps) {
	const tmdbId = canonicalTmdbId(body && body.id)
	if (!tmdbId || isNamespacedRequestId(tmdbId)) return null
	const fields = fieldsFromBody(body)

	let request = await db.Request.findByPk(tmdbId)
	if (!request) {
		request = await db.Request.create({
			id: tmdbId,
			title: fields.title,
			posterPath: fields.posterPath,
			originalTitle: fields.originalTitle,
			releaseDate: fields.releaseDate,
			adult: fields.adult,
			mediaType: fields.mediaType,
			queueStatus: null,
			queueMessage: fields.queueMessage,
			requestUser: fields.requestUser,
			queueStatusSource: "derived",
			pipelineStage: "requested",
			magnetLookupStatus: "not_applicable",
		})
	} else {
		await request.update({
			archivedAt: null,
			title: fields.title || request.title,
			posterPath: fields.posterPath || request.posterPath,
			originalTitle: fields.originalTitle || request.originalTitle,
			releaseDate: fields.releaseDate || request.releaseDate,
			mediaType: fields.mediaType || request.mediaType,
			queueStatus: null,
			queueMessage: fields.queueMessage || request.queueMessage,
			requestUser: fields.requestUser || request.requestUser,
			queueStatusSource: "derived",
			magnetLookupStatus: "not_applicable",
			// Force visible on Coming Soon immediately. Available is hidden;
			// waiting on Streama made Submit hang and still return Available.
			pipelineStage: "requested",
		})
		await request.reload()
	}

	await appendEvent({
		requestId: request.id,
		actor: "user",
		type: "update_requested",
		payload: {
			requestUser: request.requestUser,
			queueMessage: request.queueMessage,
		},
	})

	enqueueTvSeasonsJob(request, {
		...deps,
		forceSeasonPlan: true,
		fetchMissing: true,
	}).catch((err) => console.error("tv seasons enqueue:", err.message))
	return request
}

/**
 * Turn leftover namespaced "Fetch New Seasons" tickets into real pipeline
 * requests. Safe to run on every boot (archives the ticket after promoting).
 */
async function promoteOrphanTvSeasonUpdates(deps) {
	const rows = await db.Request.findAll({
		where: {
			archivedAt: { [Op.is]: null },
			id: { [Op.like]: "update:%" },
		},
	})
	let promoted = 0
	const seen = new Set()
	for (const row of rows) {
		if (!isTvSeasonFetch(row.mediaType, row.queueMessage)) continue
		const tmdbId = canonicalTmdbId(row.id)
		try {
			if (!seen.has(tmdbId)) {
				await enqueueTvSeasonUpdate(row.toJSON ? row.toJSON() : row, deps)
				seen.add(tmdbId)
				promoted += 1
			}
			await row.update({ archivedAt: new Date() })
		} catch (err) {
			console.error(`tv season update promote ${row.id}:`, err.message)
		}
	}
	if (promoted) {
		console.log(
			`promoted ${promoted} Fetch New Seasons ticket(s) onto TMDB requests`,
		)
	}
	return promoted
}

async function persistStreamaId(request, streamaId) {
	if (streamaId == null || !request) return
	if (Number(request.streamaMediaId) === Number(streamaId)) return
	await request.update({ streamaMediaId: Number(streamaId) })
}

function requestAlreadyInLibrary(request) {
	if (!request) return false
	if (request.highlightedAt) return true
	return status.SORTIFY_COMPLETION_STAGES.has(request.pipelineStage)
}

async function markLibraryUncertain(request, libraryStatus) {
	if (requestAlreadyInLibrary(request)) {
		await appendEventIfChanged({
			requestId: request.id,
			actor: "portal",
			type: "library_lookup_failed",
			payload: { reason: "streama_library_uncertain", libraryStatus },
		})
		return
	}
	const missStage = await classifySourceMiss(request)
	if (status.shouldAdvance(request.pipelineStage, missStage)) {
		await request.update({ pipelineStage: missStage })
	}
	await appendEventIfChanged({
		requestId: request.id,
		actor: "portal",
		type: missStage,
		payload: { reason: "streama_library_uncertain", libraryStatus },
	})
}

/**
 * Enqueue a TV job: new shows get first + latest aired seasons (not the
 * ones in between). Request Update (`fetchMissing`) auto-queues every aired
 * season that is missing or incomplete. Jobs store episode-grain `missing[]`;
 * complete seasons are recorded on `season_plan` events only. Admin-supplied
 * magnets skip this unless `forceSeasonPlan` is set (leftover magnets from
 * an earlier season must not skip Fetch New Seasons). Uncertain Streama
 * lookups fail closed.
 */
async function enqueueTvSeasonsJob(request, deps) {
	if (!request || !isTvMedia(request.mediaType)) return null
	const { forceSeasonPlan, ...planDeps } = deps || {}
	const existingUrls = Array.isArray(request.magnetUrls)
		? request.magnetUrls.filter(Boolean)
		: request.magnetUrl
			? [request.magnetUrl]
			: []
	if (existingUrls.length && !forceSeasonPlan) return null
	try {
		const plan = await planTvSeasons(request, planDeps)
		console.log("tv season plan", {
			id: request.id,
			auto: plan.auto,
			pending: plan.pending,
			present: plan.present,
			complete: plan.complete,
			missing: plan.missing,
			libraryStatus: plan.libraryStatus,
		})
		await persistStreamaId(request, plan.streamaMediaId)
		await appendEvent({
			requestId: request.id,
			actor: "portal",
			type: "season_plan",
			payload: {
				auto: plan.auto,
				pending: plan.pending,
				present: plan.present,
				complete: plan.complete,
				missing: plan.missing,
				libraryStatus: plan.libraryStatus,
			},
		})
		if (plan.libraryUncertain) {
			await markLibraryUncertain(request, plan.libraryStatus)
			return null
		}
		if (plan.pending.length) {
			const prev = pendingSeasonsOf(request)
			const merged = normalizeSeasons([...prev, ...plan.pending])
			await request.update({ pendingSeasons: merged })
			if (seasonsKey(merged) !== seasonsKey(prev)) {
				await appendEvent({
					requestId: request.id,
					actor: "portal",
					type: "season_approval",
					payload: { pendingSeasons: merged, autoSeasons: plan.auto },
				})
			}
			if (!plan.auto.length && status.shouldAdvance(request.pipelineStage, "season_approval")) {
				await request.update({ pipelineStage: "season_approval" })
			}
		}
		if (!plan.auto.length) {
			if (!plan.pending.length) {
				await appendEventIfChanged({
					requestId: request.id,
					actor: "portal",
					type: "no_new_seasons",
					payload: { queueMessage: request.queueMessage },
				})
				if (
					planDeps.fetchMissing &&
					plan.libraryStatus === "found" &&
					request.pipelineStage === "requested"
				) {
					await request.update({ pipelineStage: "available" })
				}
			}
			return null
		}
		return createReadyJob(request, {
			sourceUrl: null,
			mediaType: request.mediaType,
			seasons: plan.auto,
			missing: Array.isArray(plan.missing) ? plan.missing : [],
		})
	} catch (err) {
		console.error("tv seasons enqueue:", err.message)
		return null
	}
}

/**
 * Admin picks some or all pending gap seasons. Creates a ready piratify job
 * and drops those seasons from pendingSeasons.
 */
async function approveTvSeasons(request, seasons, actor = "admin", deps = {}) {
	if (!request) return null
	const pending = pendingSeasonsOf(request)
	const wanted = normalizeSeasons(seasons) || []
	const approved = wanted.filter((s) => pending.includes(s))
	if (!approved.length) return null
	const remaining = pending.filter((s) => !approved.includes(s))
	let missing = []
	let airedInSeasons = false
	try {
		const planned = await missingCodesForSeasons(request, approved, deps)
		missing = planned.missing
		airedInSeasons = planned.airedInSeasons
	} catch (err) {
		console.error("tv seasons approve missing:", err.message)
	}
	const job = await createReadyJob(request, {
		sourceUrl: null,
		mediaType: request.mediaType,
		seasons: approved,
		missing,
		actor,
		allowPresentSeasons: true,
	})
	if (job || airedInSeasons) {
		await request.update({
			pendingSeasons: remaining.length ? remaining : null,
		})
	}
	if (job && status.shouldAdvance(request.pipelineStage, "magnet_ready")) {
		await request.update({ pipelineStage: "magnet_ready" })
	}
	await appendEvent({
		requestId: request.id,
		jobId: job && job.id,
		actor,
		type: "seasons_approved",
		payload: { seasons: approved, remaining, missing },
	})
	await request.reload()
	return { request, job, seasons: approved, remaining }
}

function magnetHashesToSkip(request) {
	const hashes = []
	if (request.magnetHash) hashes.push(request.magnetHash)
	for (const url of Array.isArray(request.magnetUrls) ? request.magnetUrls : []) {
		const h = extractInfoHash(url)
		if (h) hashes.push(h)
	}
	if (request.magnetUrl) {
		const h = extractInfoHash(request.magnetUrl)
		if (h) hashes.push(h)
	}
	return hashes
}

/**
 * Run (or re-run) the magnet lookup for a movie request and persist the result.
 * Idempotent unless `{ force: true }`: once a magnet is found we never look
 * again, except after a download Error/stall (capped in jobs.js).
 *
 * @returns {Promise<string>} the resulting magnetLookupStatus
 */
async function runMagnetLookup(request, deps = {}) {
	// Only movies are auto-looked-up. TV / update / issue rows are opt-out.
	if (request.mediaType !== "movie") {
		if (request.magnetLookupStatus !== "not_applicable") {
			await request.update({ magnetLookupStatus: "not_applicable" })
		}
		return "not_applicable"
	}
	if (request.magnetLookupStatus === "stopped") {
		return "stopped"
	}
	// Never re-look once found, unless a download failure asked for a replacement.
	if (request.magnetLookupStatus === "found" && !deps.force) {
		return request.magnetLookupStatus
	}

	const lib = await lookupLibraryMovie(request, deps)
	await persistStreamaId(request, lib.streamaId)
	if (lib.status === "found" && mediaHasVideo(lib.movie)) {
		await request.update({
			magnetLookupStatus: "stopped",
			pipelineStage: status.shouldAdvance(request.pipelineStage, "available")
				? "available"
				: request.pipelineStage,
		})
		await appendEvent({
			requestId: request.id,
			actor: "portal",
			type: "already_in_library",
			payload: { streamaMediaId: lib.streamaId },
		})
		return "stopped"
	}
	if (lib.status === "error" || lib.status === "unconfigured") {
		await markLibraryUncertain(request, lib.status)
	}

	const result = await lookupMovieMagnet(request.id, {
		excludeHashes: deps.force ? magnetHashesToSkip(request) : [],
	})
	const now = new Date()

	if (result.status === "found") {
		const magnetUrls = mergeMagnetUrls(request.magnetUrls, result.magnetUrl)
		await request.update({
			imdbId: result.imdbId || request.imdbId,
			magnetUrl: result.magnetUrl,
			magnetUrls,
			magnetHash: result.magnetHash,
			magnetQuality: result.magnetQuality,
			subtitleUrl: result.subtitleUrl,
			magnetLookupStatus: "found",
			magnetLookedUpAt: now,
			magnetFoundAt: now,
			pipelineStage: "magnet_ready",
		})
		await appendEvent({
			requestId: request.id,
			actor: "portal",
			type: "magnet_found",
			payload: {
				quality: result.magnetQuality,
				hasSubtitle: !!result.subtitleUrl,
			},
		})
		await emitSubtitleLookup(request.id, {
			found: !!result.subtitleUrl,
			url: result.subtitleUrl || undefined,
			error: result.subtitleUrl ? undefined : "not found",
		})
		await createReadyJob(request, {
			sourceUrl: result.magnetUrl,
			mediaType: "movie",
		})
		return "found"
	}

	if (result.status === "not_found") {
		const wasNotFound = request.magnetLookupStatus === "not_found"
		const missStage = request.magnetUrl
			? request.pipelineStage
			: await classifySourceMiss(request)
		await request.update({
			imdbId: result.imdbId || request.imdbId,
			magnetLookupStatus: "not_found",
			magnetLookedUpAt: now,
			pipelineStage: missStage,
		})
		if (!wasNotFound) {
			await appendEvent({
				requestId: request.id,
				actor: "portal",
				type: missStage,
				payload: { imdbId: result.imdbId || null },
			})
			if (result.imdbId) {
				let subtitleUrl = null
				let error = null
				try {
					subtitleUrl = await getYifySubtitleUrl(result.imdbId)
				} catch (err) {
					error = err.message
				}
				await emitSubtitleLookup(request.id, {
					found: !!subtitleUrl,
					url: subtitleUrl || undefined,
					error: error || (subtitleUrl ? undefined : "not found"),
				})
			} else {
				await emitSubtitleLookup(request.id, {
					found: false,
					error: "no imdb id",
				})
			}
		}
		return "not_found"
	}

	// error: source down. Retry next cycle; never flip a stored magnet back.
	await request.update({
		magnetLookupStatus: "error",
		magnetLookedUpAt: now,
	})
	return "error"
}

module.exports = {
	runMagnetLookup,
	createReadyJob,
	enqueueTvSeasonsJob,
	enqueueTvSeasonUpdate,
	approveTvSeasons,
	promoteOrphanTvSeasonUpdates,
	buildFolderName,
	mergeMagnetUrls,
	isSameSource,
	resolveRequest,
	tmdbFromFolder,
}
