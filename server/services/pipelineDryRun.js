// Side-effect-free rehearsal of a media request.
//
// Answers "would this request actually work" before it enters the queue: does a
// source exist, will the right episodes be fetched, will subtitles come along,
// and will Streama register it against the right title. Nothing here writes a
// Request, a PipelineJob, an event, or adds a torrent. The assembled report is
// stored on a PipelineDryRun row so it can be reloaded and copied later.
//
// The forecasts are deliberately explicit about confidence. A prediction that
// looks like a guarantee is how "we fixed it" claims got made before.

const { lookupMovieMagnet } = require("./magnetLookup")
const { buildFolderName } = require("./requestPipeline")
const { isTvMedia, isFetchNewSeasons, planTvSeasons } = require("./tvSeasons")
const { fetchSortifyView } = require("./remoteAgents")
const { lookupLibraryShow, lookupLibraryMovie } = require("./streamaLibrary")
const { runPiratifyOnPrelanflix, loadPiratifyTicket } = require("./runPiratify")
const { formatDryRunForAgent, withoutAgentText } = require("./dryRunAgentText")

// Release-name markers that predict which subtitle path will fire at encode.
const BITMAP_SUB_MARKERS = [/\bblu-?ray\b/i, /\bbdremux\b/i, /\bremux\b/i, /\bbdrip\b/i]
const WEB_MARKERS = [/\bweb-?dl\b/i, /\bwebrip\b/i, /\bamzn\b/i, /\bnf\b/i, /\bhulu\b/i]
const YTS_MARKERS = [/\byts\b/i, /\byify\b/i]

function flag(code, severity, message, detail) {
	return { code, severity, message, detail: detail === undefined ? null : detail }
}

function workerPiratifyArgv({ folderName, title, year, missing, seasons }) {
	const episodes = Array.isArray(missing) ? missing : []
	const seasonList = Array.isArray(seasons) ? seasons : []
	return [
		"piratify",
		"add",
		"--dry-run",
		"--json",
		"-f",
		folderName,
		...(episodes.length ? ["--episodes", episodes.join(",")] : []),
		...(!episodes.length && seasonList.length ? ["--seasons", seasonList.join(",")] : []),
		...(year ? ["--year", String(year)] : []),
		title,
	]
}

/**
 * What enqueueTvSeasonsJob would put on the PipelineJob the worker claims:
 * seasons to auto-fetch, episode codes after the Streama diff, and seasons
 * that wait on admin approval.
 */
async function forecastFetchPlan(pseudoRequest, folderName, input, deps) {
	const planFn = deps.planTvSeasons || planTvSeasons
	const fetchMissing = !!(input.fetchMissing || isFetchNewSeasons(input.queueMessage))
	const plan = await planFn(pseudoRequest, { fetchMissing, ...(deps.planDeps || {}) })
	const missing = Array.isArray(plan.missing) ? plan.missing : []
	const autoSeasons = Array.isArray(plan.auto) ? plan.auto : []
	const pendingSeasons = Array.isArray(plan.pending) ? plan.pending : []
	const wouldEnqueueJob = !plan.libraryUncertain && autoSeasons.length > 0
	return {
		libraryStatus: plan.libraryStatus || null,
		libraryUncertain: !!plan.libraryUncertain,
		streamaMediaId: plan.streamaMediaId || null,
		fetchMissing,
		presentSeasons: plan.present || [],
		completeSeasons: plan.complete || [],
		autoSeasons,
		pendingSeasons,
		missingEpisodes: missing,
		wouldEnqueueJob,
		fetchMode: missing.length ? "episodes" : autoSeasons.length ? "seasons_legacy" : "none",
		workerCommand: workerPiratifyArgv({
			folderName,
			title: pseudoRequest.title,
			year: input.year,
			missing,
			seasons: autoSeasons,
		}),
		note:
			"Same rules as a live request: new show → first+last aired season; already in Streama → only missing/incomplete seasons (bookends auto, middle gaps need approval) unless Fetch New Seasons.",
	}
}

const PIRATIFY_FLAG_CODES = new Set([
	"piratify_not_reachable",
	"tv_source_lookup_error",
	"tv_episodes_unresolved",
	"tv_quality_warning",
	"tv_no_torrents_selected",
	"waiting_on_prelanflix",
])

function applyPiratifyHop(report, piratify) {
	const next = {
		...report,
		piratify: { ...(report.piratify || {}), ...piratify },
	}
	if (report.piratify) {
		next.piratify.command = piratify.command || report.piratify.command
		next.piratify.plannedEpisodes =
			piratify.plannedEpisodes || report.piratify.plannedEpisodes
		next.piratify.plannedSeasons = piratify.plannedSeasons || report.piratify.plannedSeasons
	}
	let flags = (report.flags || []).filter((f) => !PIRATIFY_FLAG_CODES.has(f.code))
	if (next.piratify.status === "pending") {
		flags.push(
			flag(
				"waiting_on_prelanflix",
				"info",
				next.piratify.reason ||
					"Waiting for Prelanflix to run piratify --dry-run (next portal-worker tick).",
				{ ticketId: next.piratify.ticketId }
			)
		)
	} else if (next.piratify.status === "unavailable") {
		flags.push(
			flag(
				"piratify_not_reachable",
				"info",
				next.piratify.reason ||
					"Prelanflix worker did not finish the piratify dry-run in time. It claims tickets on the next portal-worker tick.",
				{ command: next.piratify.command }
			)
		)
	} else if (next.piratify.status === "error") {
		flags.push(
			flag(
				"tv_source_lookup_error",
				"error",
				`piratify lookup failed: ${next.piratify.error || "unknown error"}`,
				{ stderr: next.piratify.error, exitCode: next.piratify.exitCode }
			)
		)
	} else {
		const selected = next.piratify.selected || []
		if (Array.isArray(next.piratify.missing) && next.piratify.missing.length) {
			flags.push(
				flag(
					"tv_episodes_unresolved",
					"warn",
					`${next.piratify.missing.length} requested episode(s) had no acceptable torrent.`,
					{ missing: next.piratify.missing }
				)
			)
		}
		if (next.piratify.qualityWarning) {
			flags.push(flag("tv_quality_warning", "warn", String(next.piratify.qualityWarning)))
		}
		if (!selected.length) {
			flags.push(
				flag("tv_no_torrents_selected", "error", "piratify selected 0 torrents; this request would fail.")
			)
		}
		if (selected.length) {
			const mediaType = (report.input && report.input.mediaType) || "tv"
			next.encodeForecast = forecastEncode(selected[0].name, { mediaType })
		}
	}
	const errors = flags.filter((f) => f.severity === "error").length
	next.flags = flags
	next.flagSummary = {
		error: errors,
		warn: flags.filter((f) => f.severity === "warn").length,
		info: flags.filter((f) => f.severity === "info").length,
	}
	next.verdict = errors > 0 ? "would_fail" : flags.length ? "would_proceed_with_warnings" : "would_succeed"
	next.ticketId = next.piratify.ticketId || report.ticketId || null
	return next
}

function dryRunModels(deps = {}) {
	if (deps.db) return deps.db
	if (process.env.JEST_WORKER_ID) return null
	return require("../database")
}

function identityFromReport(report) {
	const input = (report && report.input) || {}
	return {
		tmdbId: input.tmdbId ? String(input.tmdbId) : null,
		mediaType: input.mediaType || null,
		requestId: input.requestId ? String(input.requestId) : null,
		verdict: report && report.verdict ? report.verdict : null,
	}
}

function withAgentText(report) {
	if (!report || typeof report !== "object") return report
	const doc = withoutAgentText(report)
	if (!doc.ok && doc.error) return doc
	return { ...doc, agentText: formatDryRunForAgent(doc) }
}

function toDryRunSummary(row) {
	const report = row.payload && row.payload.report
	const input = (report && report.input) || {}
	const piratify = (report && report.piratify) || {}
	const pending =
		row.status === "ready" ||
		row.status === "claimed" ||
		piratify.status === "pending"
	return {
		id: row.id,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		status: row.status,
		verdict: row.verdict || (report && report.verdict) || null,
		title: input.title || (row.payload && row.payload.title) || null,
		tmdbId: row.tmdbId || input.tmdbId || (row.payload && row.payload.tmdbId) || null,
		mediaType: row.mediaType || input.mediaType || null,
		pending,
	}
}

function rowMatchesIdentity(row, { tmdbId, requestId }) {
	const payload = row.payload || {}
	const input = (payload.report && payload.report.input) || {}
	if (tmdbId) {
		const want = String(tmdbId)
		if (
			String(row.tmdbId || "") === want ||
			String(payload.tmdbId || "") === want ||
			String(input.tmdbId || "") === want
		) {
			return true
		}
	}
	if (requestId) {
		const want = String(requestId)
		if (String(row.requestId || "") === want || String(input.requestId || "") === want) {
			return true
		}
	}
	return false
}

async function persistDryRunReport(report, deps = {}) {
	if (!report || !report.ok) return report
	const models = dryRunModels(deps)
	if (!models || !models.PipelineDryRun) return report
	const stored = withoutAgentText(report)
	const identity = identityFromReport(stored)
	const ticketId = stored.ticketId || (stored.piratify && stored.piratify.ticketId)
	try {
		if (ticketId) {
			const row = await models.PipelineDryRun.findByPk(ticketId)
			if (row && typeof row.update === "function") {
				await row.update({
					payload: { ...(row.payload || {}), report: stored },
					tmdbId: identity.tmdbId || row.tmdbId || null,
					mediaType: identity.mediaType || row.mediaType || null,
					requestId: identity.requestId || row.requestId || null,
					verdict: identity.verdict || row.verdict || null,
				})
				stored.ticketId = ticketId
				return stored
			}
		}
		if (typeof models.PipelineDryRun.create !== "function") return stored
		const row = await models.PipelineDryRun.create({
			status: "stored",
			payload: {
				tmdbId: identity.tmdbId,
				title: stored.input && stored.input.title,
				report: stored,
			},
			tmdbId: identity.tmdbId,
			mediaType: identity.mediaType,
			requestId: identity.requestId,
			verdict: identity.verdict,
		})
		stored.ticketId = row.id
		if (typeof row.update === "function") {
			await row.update({ payload: { ...(row.payload || {}), report: stored } })
		}
		return stored
	} catch (err) {
		return stored
	}
}

async function listDryRuns(query = {}, deps = {}) {
	const models = dryRunModels(deps)
	if (!models || !models.PipelineDryRun || typeof models.PipelineDryRun.findAll !== "function") {
		return []
	}
	const tmdbId = query.tmdbId ? String(query.tmdbId).trim() : ""
	const requestId = query.requestId ? String(query.requestId).trim() : ""
	if (!tmdbId && !requestId) return []
	const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50)
	try {
		const { Op } = require("sequelize")
		const or = []
		if (tmdbId) {
			or.push(
				{ tmdbId },
				{ payload: { [Op.contains]: { tmdbId } } },
				{ payload: { [Op.contains]: { report: { input: { tmdbId } } } } }
			)
		}
		if (requestId) {
			or.push({ requestId })
		}
		const rows = await models.PipelineDryRun.findAll({
			where: { [Op.or]: or },
			order: [["createdAt", "DESC"]],
			limit,
		})
		return (rows || []).filter((row) => rowMatchesIdentity(row, { tmdbId, requestId })).map(toDryRunSummary)
	} catch (err) {
		// Memory mocks and older Sequelize JSON operators may not support Op.contains.
		const rows = await models.PipelineDryRun.findAll({
			order: [["createdAt", "DESC"]],
			limit: 100,
		})
		return (rows || [])
			.filter((row) => rowMatchesIdentity(row, { tmdbId, requestId }))
			.slice(0, limit)
			.map(toDryRunSummary)
	}
}

async function loadDryRunReport(id, deps = {}) {
	const loaded = await loadPiratifyTicket(id, deps)
	if (!loaded) return { ok: false, error: "not found" }
	const saved = loaded.row.payload && loaded.row.payload.report
	if (loaded.row.status === "stored") {
		if (saved && saved.ok) {
			return withAgentText({ ...withoutAgentText(saved), ticketId: id })
		}
		return { ok: false, error: "not found" }
	}
	const piratify = { ...loaded.piratify }
	if (saved && saved.piratify) {
		piratify.command = saved.piratify.command || piratify.command
		piratify.plannedEpisodes = saved.piratify.plannedEpisodes || piratify.plannedEpisodes
		piratify.plannedSeasons = saved.piratify.plannedSeasons || piratify.plannedSeasons
	}
	if (!saved || !saved.ok) {
		return withAgentText({
			ok: true,
			schema: "pipeline-dry-run/1",
			ticketId: id,
			piratify,
		})
	}
	const report = applyPiratifyHop(saved, piratify)
	report.ticketId = id
	if (piratify.status !== "pending") {
		await persistDryRunReport(report, deps)
	}
	return withAgentText(report)
}

function normalizeCsv(value) {
	if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
	return String(value == null ? "" : value)
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean)
}

function episodeCodes(value) {
	return normalizeCsv(value)
		.map((c) => c.toUpperCase())
		.filter((c) => /^S\d+E\d+$/.test(c))
}

/**
 * Predict the encoder's subtitle behaviour from the release name.
 * Heuristic only -- ffprobe is the real answer and only runs on the box.
 */
function forecastEncode(torrentName, { mediaType } = {}) {
	const name = String(torrentName || "")
	if (!name) {
		return {
			confidence: "none",
			reason: "no torrent selected, nothing to forecast",
			audioLanguageGuess: null,
			hardsubLikely: false,
			expectedSubtitleSources: [],
		}
	}
	const isYts = YTS_MARKERS.some((re) => re.test(name))
	const isWeb = WEB_MARKERS.some((re) => re.test(name))
	const isBitmapProne = BITMAP_SUB_MARKERS.some((re) => re.test(name))

	const expected = []
	if (isYts) {
		expected.push({
			source: "sidecar .srt in release (YTS Subs/ folder)",
			languages: ["en", "possibly others"],
			confidence: "likely",
		})
	}
	if (isBitmapProne) {
		expected.push({
			source: "embedded PGS/bitmap tracks",
			languages: ["en"],
			confidence: "likely present but SKIPPED",
			note: "encode-watch only extracts text codecs; PGS cannot become .srt",
		})
	}
	if (isWeb) {
		expected.push({
			source: "embedded tracks (WEB releases are often PGS or none)",
			languages: [],
			confidence: "uncertain",
		})
	}

	// Hardsub only fires when the kept audio track is non-English, so an
	// English-language title never gets burn-in and has no fallback.
	const foreignHint = /\b(jpn|japanese|kor|korean|multi|dual[\s._-]?audio)\b/i.test(name)

	return {
		confidence: isYts || isBitmapProne ? "medium" : "low",
		reason: "predicted from release name only; ffprobe on the box is authoritative",
		torrentName: name,
		audioLanguageGuess: foreignHint ? "non-English (hardsub path possible)" : "English (assumed)",
		hardsubLikely: foreignHint,
		expectedSubtitleSources: expected,
		audioNormalization: "AAC stereo 192k unless source is already AAC <= 2ch",
		tierGuess: /2160p|4k/i.test(name) ? "_1080p.mp4 (downscaled by CRF tier)" : /720p/i.test(name) ? "_720p.mp4" : "_1080p.mp4",
		mediaType: mediaType || null,
	}
}

/**
 * Which subtitle languages this request would actually acquire, and from where.
 * Reflects today's behaviour: one English URL for movies, nothing for TV.
 */
function forecastSubtitles({ mediaType, search, magnetFound }) {
	const languages = {}
	const attempts = Array.isArray(search && search.attempts) ? search.attempts : []
	for (const attempt of attempts.filter((a) => a.source === "yifysubtitles")) {
		if (!attempt.language) continue
		languages[attempt.language] = {
			availableUpstream: !!attempt.found,
			url: attempt.subtitleUrl || null,
			error: attempt.error || null,
		}
	}

	const tv = isTvMedia(mediaType)
	const wouldAttach = []
	const wouldNotAttach = []

	if (tv) {
		// portal-worker passes -s only on the rentify (movie/admin URL) branch.
		wouldNotAttach.push({
			language: "en",
			reason: "TV jobs go to piratify, which never receives or attaches a subtitle URL",
		})
		wouldNotAttach.push({
			language: "ru",
			reason: "same as English: no subtitle URL is planned for TV jobs",
		})
	} else {
		const english = languages.English
		if (magnetFound && english && english.availableUpstream) {
			wouldAttach.push({
				language: "en",
				via: "request.subtitleUrl -> rentify add -s",
				url: english.url,
			})
		} else {
			wouldNotAttach.push({
				language: "en",
				reason: english
					? "no English subtitle found on the YIFY index"
					: "English subtitle lookup did not run (magnet miss)",
			})
		}
		const russian = languages.Russian
		wouldNotAttach.push({
			language: "ru",
			reason: russian && russian.availableUpstream
				? "available upstream but the portal stores a single English subtitleUrl"
				: "not available upstream, and nothing fetches Russian for movies",
			availableUpstream: !!(russian && russian.availableUpstream),
			url: russian ? russian.url : null,
		})
	}

	return { upstreamIndex: languages, wouldAttach, wouldNotAttach }
}

/**
 * Does Streama already hold an entry for this TMDB id? Uses the portal's own
 * Streama login, so it works with no agent on the ElanFlix side.
 *
 * "missing" is a real answer (index scanned, nothing matched). A scan can time
 * out on large libraries, which is reported as "error" rather than "missing" so
 * an unfinished scan is never read as "not there".
 */
async function lookupStreamaLibrary({ tmdbId, mediaType }, deps = {}) {
	const lookup = isTvMedia(mediaType)
		? deps.lookupLibraryShow || lookupLibraryShow
		: deps.lookupLibraryMovie || lookupLibraryMovie
	try {
		const res = await lookup({ id: tmdbId, mediaType }, deps)
		return {
			status: res.status,
			streamaId: res.streamaId || null,
			error: res.error || null,
			alreadyInLibrary: res.status === "found",
		}
	} catch (err) {
		return { status: "error", streamaId: null, error: err.message, alreadyInLibrary: null }
	}
}

/**
 * What Streama would do with the expected encoded filename. Streama matches by
 * filename TMDB search, not the folder `tmdb{id}`, so this is where a correct
 * magnet can still land on the wrong title.
 */
async function forecastStreamaMatch({ title, tmdbId, mediaType, folderName }, deps = {}) {
	const remote = await fetchSortifyView({ folderName, tmdbId }, deps).catch((err) => ({
		status: "unreachable",
		error: err.message,
	}))
	if (!remote || remote.status !== "ok") {
		// Sortify has no inspection API. The portal's own Streama login can
		// still say whether this TMDB id is already in the library. That is
		// not a filename-matcher forecast — matches stays null.
		const library = await lookupStreamaLibrary({ tmdbId, mediaType }, deps)
		let reason
		if (library.status === "found") {
			reason = `Already in Streama (id ${library.streamaId}). Filename match still unverified — Streama searches TMDB by filename, not folder tmdb${tmdbId}.`
		} else if (library.status === "missing") {
			reason = `Not in Streama yet. Filename match still unverified — Streama searches TMDB by filename, not folder tmdb${tmdbId}.`
		} else {
			reason = library.error
				? `Streama library scan failed (${library.error}). Filename match cannot be checked from the portal.`
				: "Filename match cannot be checked from the portal (it runs on ElanFlix at register)."
		}
		return {
			status: remote ? remote.status : "unreachable",
			reason,
			folderTmdbId: String(tmdbId),
			matcherApiId: null,
			matches: null,
			libraryCheck: library,
			note: "Streama matches on filename TMDB search; the folder tmdb id is not passed to the matcher today",
		}
	}
	const data = remote.data || {}
	const match = data.match || {}
	const matcherApiId = match.apiId != null ? String(match.apiId) : null
	return {
		status: "ok",
		folderTmdbId: String(tmdbId),
		matcherApiId,
		matcherTitle: match.title || null,
		matcherMediaType: match.mediaType || null,
		matches: matcherApiId == null ? null : matcherApiId === String(tmdbId),
		alreadyInLibrary: !!data.alreadyInLibrary,
		existingHighlights: Array.isArray(data.highlights) ? data.highlights.length : null,
		highlights: Array.isArray(data.highlights) ? data.highlights : [],
	}
}

/**
 * Would a dashboard highlight be created, deduped, or duplicated?
 * Streama returns 409 only when media AND videoToPlay both match.
 */
function forecastHighlight(streamaMatch, { mediaType }) {
	if (!streamaMatch || streamaMatch.status !== "ok") {
		// Highlight rows live behind the sortify agent, but if Streama has no
		// entry for this title at all there is nothing to duplicate yet.
		const lib = (streamaMatch && streamaMatch.libraryCheck) || null
		if (lib && lib.status === "missing") {
			return {
				outcome: "new_highlight",
				reason:
					"Streama has no entry for this TMDB id yet, so the first register would create a single dashboard highlight.",
				basis: "portal streama library scan (no sortify agent)",
			}
		}
		if (lib && lib.status === "found") {
			return {
				outcome: "unknown",
				reason: `Streama already holds this title (id ${lib.streamaId}). Highlight rows cannot be read without the sortify agent, so duplicate vs 409 is unknown.`,
				basis: "portal streama library scan (no sortify agent)",
			}
		}
		return {
			outcome: "unknown",
			reason: "Streama highlight rows could not be read; cannot predict duplicate vs 409",
		}
	}
	const existing = streamaMatch.highlights || []
	if (!existing.length) {
		return { outcome: "new_highlight", reason: "no existing highlight for this media" }
	}
	if (isTvMedia(mediaType)) {
		return {
			outcome: "likely_duplicate",
			reason: `${existing.length} highlight(s) already exist. A new episode has a different videoToPlay, so Streama will not 409 and a second dashboard row is created.`,
			existingCount: existing.length,
		}
	}
	return {
		outcome: "likely_409_treated_as_success",
		reason: "a highlight exists for this movie and videoToPlay would match",
		existingCount: existing.length,
	}
}

/**
 * Rehearse a request end to end.
 *
 * @param {Object} input { title, tmdbId, mediaType, year?, seasons?, episodes? }
 * @param {Object} deps  { lookupMovieMagnet?, runPiratify?, fetchImpl? }
 * @returns {Promise<Object>} dry-run report
 */
async function runDryRun(input = {}, deps = {}) {
	const tmdbId = String(input.tmdbId || input.id || "").trim()
	const title = String(input.title || "").trim()
	const mediaType = String(input.mediaType || "movie").trim()
	const flags = []

	if (!tmdbId) {
		return { ok: false, error: "tmdbId is required" }
	}
	if (!title) {
		flags.push(flag("missing_title", "warn", "No title supplied; folder name and TV search will be wrong."))
	}

	const year = input.year ? String(input.year).slice(0, 4) : null
	const pseudoRequest = {
		id: tmdbId,
		title: title || "media",
		releaseDate: year ? `${year}-01-01` : input.releaseDate || null,
		mediaType,
	}
	const folderName = buildFolderName(pseudoRequest, null)
	const tv = isTvMedia(mediaType)

	// --- 1/2. Source lookup -------------------------------------------------
	let magnetSearch = null
	let piratify = null
	let selectedTorrentName = null
	let fetchPlan = null

	if (tv) {
		const overrideEpisodes = episodeCodes(input.episodes)
		fetchPlan = await forecastFetchPlan(pseudoRequest, folderName, { ...input, year }, deps)

		if (fetchPlan.libraryUncertain) {
			flags.push(
				flag(
					"library_uncertain",
					"error",
					`Streama library lookup is ${fetchPlan.libraryStatus}; the portal would not enqueue a piratify job (fail closed).`,
					{ libraryStatus: fetchPlan.libraryStatus }
				)
			)
		} else if (!fetchPlan.wouldEnqueueJob) {
			flags.push(
				flag(
					"nothing_to_fetch",
					"info",
					fetchPlan.pendingSeasons.length
						? `Portal would not auto-queue piratify. ${fetchPlan.pendingSeasons.length} season(s) need admin approval: ${fetchPlan.pendingSeasons.join(", ")}.`
						: "Portal would not create a download job — nothing missing after the Streama diff (or no aired seasons).",
					{
						presentSeasons: fetchPlan.presentSeasons,
						completeSeasons: fetchPlan.completeSeasons,
						pendingSeasons: fetchPlan.pendingSeasons,
					}
				)
			)
		}

		const episodes = overrideEpisodes.length ? overrideEpisodes : fetchPlan.missingEpisodes
		const seasons = overrideEpisodes.length ? [] : fetchPlan.autoSeasons.map(String)
		if (overrideEpisodes.length) {
			flags.push(
				flag(
					"episode_override",
					"info",
					"Dry-run used explicit episode codes instead of the Streama diff.",
					{ override: overrideEpisodes, planned: fetchPlan.missingEpisodes }
				)
			)
		}

		const shouldResolve =
			overrideEpisodes.length > 0 || fetchPlan.wouldEnqueueJob

		if (!shouldResolve) {
			piratify = {
				status: "skipped",
				reason: "portal would not send piratify a job after comparing to Streama",
				command: fetchPlan.workerCommand,
				plannedEpisodes: fetchPlan.missingEpisodes,
				plannedSeasons: fetchPlan.autoSeasons,
			}
		} else {
			const runPiratify = deps.runPiratify || runPiratifyOnPrelanflix
			piratify = await runPiratify(
				{
					folderName,
					title,
					year,
					episodes,
					seasons,
					tmdbId,
					mediaType,
					requestId: input.requestId || null,
				},
				{ wait: false }
			)
			piratify = piratify && typeof piratify === "object" ? piratify : { status: "error", error: "empty piratify result" }
			piratify.command = overrideEpisodes.length
				? workerPiratifyArgv({
						folderName,
						title,
						year,
						missing: overrideEpisodes,
						seasons: [],
				  })
				: fetchPlan.workerCommand
			piratify.plannedEpisodes = episodes
			piratify.plannedSeasons = fetchPlan.autoSeasons
			if (piratify.status === "ok") {
				const selected = piratify.selected || []
				selectedTorrentName = selected.length ? selected[0].name : null
			}
		}
	} else {
		const lookup = deps.lookupMovieMagnet || lookupMovieMagnet
		const result = await lookup(tmdbId, { excludeHashes: [] })
		magnetSearch = {
			status: result.status,
			imdbId: result.imdbId || null,
			magnetUrl: result.magnetUrl || null,
			magnetHash: result.magnetHash || null,
			magnetQuality: result.magnetQuality || null,
			subtitleUrl: result.subtitleUrl || null,
			search: result.search || null,
		}
		const pick = result.search && result.search.pick
		selectedTorrentName = pick ? pick.url || null : null
		const ytsAttempt = ((result.search && result.search.attempts) || []).find(
			(a) => a.source === "yts"
		)
		if (ytsAttempt && ytsAttempt.movieTitle) selectedTorrentName = ytsAttempt.movieTitle
		if (result.status === "error") {
			flags.push(
				flag("magnet_lookup_error", "error", `Source lookup errored: ${result.search && result.search.missReason}`)
			)
		} else if (result.status === "not_found") {
			flags.push(
				flag(
					"magnet_not_found",
					"error",
					`No source found: ${(result.search && result.search.missReason) || "unknown"}. Only the YTS mirror is searched for movies.`,
					{ attempts: (result.search && result.search.attempts) || [] }
				)
			)
		}
		// Same-title different-film collisions are a known miss cause.
		if (ytsAttempt && ytsAttempt.movieTitle && title) {
			const ytsTitle = String(ytsAttempt.movieTitle).toLowerCase()
			if (!ytsTitle.includes(title.toLowerCase().slice(0, Math.min(title.length, 12)))) {
				flags.push(
					flag(
						"yts_title_mismatch",
						"warn",
						`YTS returned "${ytsAttempt.movieTitle}" for a request titled "${title}". Verify the TMDB id is the intended film.`,
						{ ytsTitle: ytsAttempt.movieTitle, requestTitle: title }
					)
				)
			}
		}
	}

	const magnetFound = tv
		? !!(piratify && Array.isArray(piratify.selected) && piratify.selected.length)
		: magnetSearch && magnetSearch.status === "found"

	// --- 3. Encode forecast -------------------------------------------------
	const encodeForecast = forecastEncode(selectedTorrentName, { mediaType })

	// --- Subtitle forecast --------------------------------------------------
	const subtitleForecast = forecastSubtitles({
		mediaType,
		search: magnetSearch && magnetSearch.search,
		magnetFound,
	})
	if (!subtitleForecast.wouldAttach.length && !(piratify && piratify.status === "skipped")) {
		flags.push(
			flag(
				"no_subtitles_would_be_attached",
				"warn",
				tv
					? "No subtitles would be attached: TV jobs never get a subtitle URL, so subs depend entirely on the release or later subify."
					: "No subtitles would be attached for this movie.",
				{ wouldNotAttach: subtitleForecast.wouldNotAttach }
			)
		)
	}
	if (
		subtitleForecast.upstreamIndex.Russian &&
		subtitleForecast.upstreamIndex.Russian.availableUpstream
	) {
		flags.push(
			flag(
				"russian_available_but_not_attached",
				"warn",
				"Russian subtitles exist upstream but would not be attached: the portal stores one English subtitleUrl.",
				subtitleForecast.upstreamIndex.Russian
			)
		)
	}
	if (
		encodeForecast.expectedSubtitleSources.some((s) =>
			String(s.confidence || "").includes("SKIPPED")
		)
	) {
		flags.push(
			flag(
				"embedded_subs_would_be_skipped",
				"warn",
				"This release likely carries bitmap (PGS) subtitles, which the encoder skips, so no .srt would be produced from the source.",
				encodeForecast.expectedSubtitleSources
			)
		)
	}

	// --- 4. Streama match ---------------------------------------------------
	const streamaMatch = await forecastStreamaMatch(
		{ title, tmdbId, mediaType, folderName },
		deps
	)
	if (streamaMatch.matches === false) {
		flags.push(
			flag(
				"streama_identity_mismatch",
				"error",
				`Streama would register this under apiId ${streamaMatch.matcherApiId}${
					streamaMatch.matcherTitle ? ` (${streamaMatch.matcherTitle})` : ""
				}, not tmdb${tmdbId}. This is the wrong-media assignment path.`,
				streamaMatch
			)
		)
	} else if (streamaMatch.matches === null) {
		const lib = streamaMatch.libraryCheck
		const libraryAnswered = lib && (lib.status === "found" || lib.status === "missing")
		const fetchAnswered = !!(fetchPlan && fetchPlan.libraryStatus)
		if (!libraryAnswered && !fetchAnswered) {
			flags.push(
				flag(
					"streama_match_unverified",
					"info",
					"Filename match cannot be verified from the portal (Streama searches TMDB by filename at register). Library presence is listed under Streama match when the portal login can scan it.",
					{ status: streamaMatch.status, reason: streamaMatch.reason }
				)
			)
		}
	}

	// --- 5. Highlight -------------------------------------------------------
	const highlightForecast = forecastHighlight(streamaMatch, { mediaType })
	if (highlightForecast.outcome === "likely_duplicate") {
		flags.push(
			flag("duplicate_highlight_likely", "warn", highlightForecast.reason, {
				existingCount: highlightForecast.existingCount,
			})
		)
	}

	const errors = flags.filter((f) => f.severity === "error").length
	let report = {
		ok: true,
		schema: "pipeline-dry-run/1",
		generatedAt: new Date().toISOString(),
		// Nothing was written. Stated explicitly so a dry run is never mistaken
		// for a queued request.
		sideEffects:
			"none: no Request, PipelineJob, or torrent; the report is stored as a PipelineDryRun row. TV source lookup is a Prelanflix piratify ticket.",
		input: {
			tmdbId,
			title,
			mediaType,
			year,
			seasons: normalizeCsv(input.seasons),
			episodes: episodeCodes(input.episodes),
			requestId: input.requestId ? String(input.requestId) : null,
		},
		expectedFolderName: folderName,
		verdict: errors > 0 ? "would_fail" : flags.length ? "would_proceed_with_warnings" : "would_succeed",
		fetchPlan,
		magnetSearch,
		piratify,
		subtitleForecast,
		encodeForecast,
		streamaMatch,
		highlightForecast,
		flags,
		flagSummary: {
			error: errors,
			warn: flags.filter((f) => f.severity === "warn").length,
			info: flags.filter((f) => f.severity === "info").length,
		},
	}
	if (tv && piratify && piratify.status !== "skipped") {
		report = applyPiratifyHop(report, piratify)
	}
	return withAgentText(await persistDryRunReport(report, deps))
}

module.exports = {
	runDryRun,
	loadDryRunReport,
	applyPiratifyHop,
	forecastEncode,
	forecastSubtitles,
	forecastStreamaMatch,
	forecastHighlight,
	forecastFetchPlan,
	workerPiratifyArgv,
	listDryRuns,
	formatDryRunForAgent,
}
