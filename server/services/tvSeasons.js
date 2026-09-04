/**
 * Decide which TV seasons a pipeline job should fetch.
 *
 * New show (confirmed absent from Streama): first + latest aired season.
 * Request Update (`fetchMissing`): every aired season that is missing or
 * incomplete. A season with any video is "present"; completeness is every
 * aired episode. Jobs carry episode-grain `missing[]` (`SxxEyy`). If Streama
 * is unreachable or unconfigured, do not guess — return no auto seasons
 * (fail closed). Never default to season 1 when TVMaze has no aired list.
 * Streama `show.json` often nests files as `{id}` stubs — those count as video.
 */
const TVMAZE_LOOKUP = "https://api.tvmaze.com/lookup/shows"
const TVMAZE_SEARCH = "https://api.tvmaze.com/search/shows"
const TVMAZE_EPISODES = "https://api.tvmaze.com/shows"
const { lookupLibraryShow, fileLooksLikeVideo, fetchWithTimeout } = require("./streamaLibrary")

function isTvMedia(mediaType) {
	const t = (mediaType || "").toLowerCase()
	return t === "tv" || t === "tvshow" || t === "show"
}

function isFetchNewSeasons(queueMessage) {
	return /fetch\s*new\s*seasons/i.test(String(queueMessage || ""))
}

// Search-bar "Request Update" → Fetch New Seasons, or the same message on an
// existing TV row. These must become pipeline jobs on the TMDB id — not
// namespaced update: tickets that never reach download.
function isTvSeasonFetch(mediaType, queueMessage) {
	return isTvMedia(mediaType) && isFetchNewSeasons(queueMessage)
}

function normalizeSeasons(seasons) {
	if (!Array.isArray(seasons)) return null
	const nums = [
		...new Set(
			seasons
				.map((n) => Number(n))
				.filter((n) => Number.isInteger(n) && n > 0)
		),
	].sort((a, b) => a - b)
	return nums.length ? nums : null
}

function seasonsKey(seasons) {
	const n = normalizeSeasons(seasons)
	return n ? n.join(",") : ""
}

function normalizeMissing(missing) {
	if (!Array.isArray(missing)) return null
	const codes = [
		...new Set(
			missing
				.map((c) => String(c || "").toUpperCase().trim())
				.filter((c) => /^S\d+E\d+$/.test(c))
		),
	].sort()
	return codes.length ? codes : null
}

function missingKey(missing) {
	const n = normalizeMissing(missing)
	return n ? n.join(",") : ""
}

/** First + latest aired season; a single-season show is just that season. */
function bookendSeasons(aired) {
	const list = normalizeSeasons(aired) || []
	if (!list.length) return []
	const first = list[0]
	const last = list[list.length - 1]
	return first === last ? [first] : [first, last]
}

/**
 * Split missing seasons into auto-download vs admin-approval gaps.
 * `library` = complete seasons (every aired episode has video).
 * `present` = seasons with any video (defaults to `library`).
 * No present videos → new show (bookends only).
 * `fetchMissing` (Request Update): auto-queue every aired season that is
 * missing or incomplete — no admin gap gate.
 */
function classifySeasonPlan(aired, library, present, opts) {
	const airedList = normalizeSeasons(aired) || []
	const completeList = normalizeSeasons(library) || []
	const presentList =
		present != null ? normalizeSeasons(present) || [] : completeList
	const fetchMissing = !!(opts && opts.fetchMissing)

	if (fetchMissing && presentList.length) {
		const completeSet = new Set(completeList)
		return {
			auto: airedList.filter((s) => !completeSet.has(s)),
			pending: [],
		}
	}

	if (!presentList.length) {
		return { auto: bookendSeasons(airedList), pending: [] }
	}

	const presentSet = new Set(presentList)
	const completeSet = new Set(completeList)
	const missingEntirely = airedList.filter((s) => !presentSet.has(s))
	const first = airedList[0]
	const last = airedList[airedList.length - 1]
	const auto = []
	if (first && missingEntirely.includes(first)) auto.push(first)
	if (last && last !== first && missingEntirely.includes(last)) auto.push(last)
	const autoSet = new Set(auto)
	const pendingGaps = missingEntirely.filter((s) => !autoSet.has(s))
	const incomplete = presentList.filter((s) => !completeSet.has(s))
	const pending = normalizeSeasons([...pendingGaps, ...incomplete]) || []
	return {
		auto: auto.filter((s) => !presentSet.has(s)),
		pending,
	}
}

function pendingSeasonsOf(request) {
	const raw = request && request.pendingSeasons
	return normalizeSeasons(Array.isArray(raw) ? raw : []) || []
}

function premieredYear(show) {
	const premiered = (show && show.premiered) || ""
	if (premiered.length >= 4 && /^\d{4}/.test(premiered)) {
		return Number(premiered.slice(0, 4))
	}
	return null
}

function episodeCode(season, number) {
	return `S${String(season).padStart(2, "0")}E${String(number).padStart(2, "0")}`
}

function seasonNumberOf(ep) {
	if (!ep) return null
	const n = ep.season_number != null ? ep.season_number : ep.season
	return Number.isInteger(n) && n > 0 ? n : null
}

function episodeNumberOf(ep) {
	if (!ep) return null
	const raw =
		ep.episode_number != null
			? ep.episode_number
			: ep.episodeNumber != null
				? ep.episodeNumber
				: ep.number
	const n = Number(raw)
	return Number.isInteger(n) && n > 0 ? n : null
}

function airedEpisodesFromList(episodes, now) {
	const stampNow = now || new Date()
	const out = []
	for (const ep of episodes || []) {
		const season = ep && ep.season
		if (!Number.isInteger(season) || season <= 0) continue
		if (!ep.airstamp) continue
		const t = Date.parse(ep.airstamp)
		if (Number.isNaN(t) || t > stampNow.getTime()) continue
		const number =
			Number.isInteger(ep.number) && ep.number > 0 ? ep.number : null
		out.push({ season, number })
	}
	return out
}

function airedSeasonNumbersFromEpisodes(episodes, now) {
	return [
		...new Set(airedEpisodesFromList(episodes, now).map((ep) => ep.season)),
	].sort((a, b) => a - b)
}

function libraryEpisodeCodesFromShow(show) {
	const found = new Set()
	for (const ep of (show && show.episodes) || []) {
		if (ep && ep.deleted) continue
		if (!episodeHasVideo(ep)) continue
		const season = seasonNumberOf(ep)
		const number = episodeNumberOf(ep)
		if (!season || !number) continue
		found.add(episodeCode(season, number))
	}
	return found
}

/**
 * Aired TVMaze episodes in `seasons` that are not already in Streama.
 * Codes look like `S01E04`. Unnumbered episodes cannot form a code and are skipped.
 */
function missingEpisodeCodes(airedEps, seasons, libraryCodes) {
	const seasonSet = new Set(normalizeSeasons(seasons) || [])
	if (!seasonSet.size) return []
	const have =
		libraryCodes instanceof Set ? libraryCodes : new Set(libraryCodes || [])
	const out = []
	for (const ep of airedEps || []) {
		if (!seasonSet.has(ep.season) || !ep.number) continue
		const code = episodeCode(ep.season, ep.number)
		if (!have.has(code)) out.push(code)
	}
	return [...new Set(out)].sort()
}

async function libraryEpisodeCodesForRequest(request, deps = {}) {
	if (deps.libraryCodes) {
		return deps.libraryCodes instanceof Set
			? deps.libraryCodes
			: new Set(deps.libraryCodes)
	}
	const lookup = deps.libraryLookup || (await lookupLibraryShow(request, deps))
	if (lookup && lookup.status === "found" && lookup.show) {
		return libraryEpisodeCodesFromShow(lookup.show)
	}
	return new Set()
}

async function missingCodesForSeasons(request, seasons, deps = {}) {
	const airedEps = Array.isArray(deps.airedEpisodes)
		? deps.airedEpisodes
		: await fetchTvmazeEpisodes(request, deps)
	const libraryCodes = await libraryEpisodeCodesForRequest(request, deps)
	const seasonSet = new Set(normalizeSeasons(seasons) || [])
	const airedInSeasons = airedEps.some(
		(ep) => seasonSet.has(ep.season) && ep.number
	)
	return {
		missing: missingEpisodeCodes(airedEps, seasons, libraryCodes),
		airedInSeasons,
	}
}

/** Seasons that have every aired episode on disk — not "any episode exists". */
function completeSeasonsFromAired(airedEps, libraryCodes) {
	const bySeason = new Map()
	for (const ep of airedEps || []) {
		if (!bySeason.has(ep.season)) bySeason.set(ep.season, [])
		bySeason.get(ep.season).push(ep)
	}
	const complete = []
	const codes = libraryCodes instanceof Set ? libraryCodes : new Set(libraryCodes || [])
	for (const [season, eps] of bySeason) {
		const numbered = eps.filter((ep) => ep.number)
		if (!numbered.length) continue
		const allIn = numbered.every((ep) =>
			codes.has(episodeCode(ep.season, ep.number))
		)
		if (allIn) complete.push(season)
	}
	return complete.sort((a, b) => a - b)
}

function librarySeasonsFromShow(show) {
	const found = new Set()
	for (const ep of (show && show.episodes) || []) {
		if (ep && ep.deleted) continue
		const n = seasonNumberOf(ep)
		if (!n) continue
		if (!episodeHasVideo(ep)) continue
		found.add(n)
	}
	return [...found].sort((a, b) => a - b)
}

function episodeHasVideo(episode) {
	const files = (episode && episode.files) || []
	if (!files.length) return false
	return files.some(fileLooksLikeVideo)
}

async function fetchLibraryShow(request, deps = {}) {
	const lookup = await lookupLibraryShow(request, deps)
	return lookup.status === "found" ? lookup.show : null
}

async function librarySeasonNumbers(request, deps = {}) {
	const show = await fetchLibraryShow(request, deps)
	if (!show) return []
	return librarySeasonsFromShow(show)
}

async function fetchTvmazeEpisodes(request, deps = {}) {
	const get = fetchWithTimeout(deps.fetchImpl, 8000)
	const now = deps.now || new Date()
	let show = null
	if (request.id && !String(request.id).includes(":")) {
		const res = await get(`${TVMAZE_LOOKUP}?tmdb=${encodeURIComponent(request.id)}`)
		if (res.ok) show = await res.json()
	}
	if (!show && request.title) {
		const res = await get(
			`${TVMAZE_SEARCH}?q=${encodeURIComponent(request.title)}`
		)
		if (res.ok) {
			const results = await res.json()
			const year = (request.releaseDate || "").slice(0, 4)
			const shows = (results || []).map((row) => row.show || row).filter(Boolean)
			if (year && /^\d{4}$/.test(year)) {
				show = shows.find((s) => premieredYear(s) === Number(year)) || null
			} else {
				show = shows[0] || null
			}
		}
	}
	if (!show || show.id == null) return []
	const epsRes = await get(`${TVMAZE_EPISODES}/${show.id}/episodes`)
	if (!epsRes.ok) return []
	const episodes = await epsRes.json()
	return airedEpisodesFromList(episodes, now)
}

async function airedSeasonNumbers(request, deps = {}) {
	const airedEps = await fetchTvmazeEpisodes(request, deps)
	return [...new Set(airedEps.map((ep) => ep.season))].sort((a, b) => a - b)
}

function emptyPlan(libraryStatus, streamaMediaId = null) {
	return {
		auto: [],
		pending: [],
		libraryStatus,
		libraryUncertain: libraryStatus === "error" || libraryStatus === "unconfigured",
		streamaMediaId: streamaMediaId || null,
		present: [],
		complete: [],
		missing: [],
	}
}

/**
 * @returns {Promise<{auto: number[], pending: number[], libraryStatus: string, libraryUncertain: boolean, streamaMediaId: number|null, present: number[], complete: number[], missing: string[]}>}
 */
async function planTvSeasons(request, deps = {}) {
	const airedEps = await fetchTvmazeEpisodes(request, deps)
	const aired = [...new Set(airedEps.map((ep) => ep.season))].sort((a, b) => a - b)

	let lookup
	if (deps.libraryLookup) {
		lookup = deps.libraryLookup
	} else if (Array.isArray(deps.librarySeasons)) {
		lookup = {
			status: "found",
			streamaId: request.streamaMediaId != null ? Number(request.streamaMediaId) : null,
			present: deps.librarySeasons,
			complete: deps.librarySeasons,
		}
	} else {
		lookup = await lookupLibraryShow(request, deps)
	}

	if (lookup.status === "error" || lookup.status === "unconfigured") {
		return emptyPlan(lookup.status, lookup.streamaId)
	}

	let present = Array.isArray(lookup.present) ? lookup.present : []
	let complete = Array.isArray(lookup.complete) ? lookup.complete : []
	let libraryCodes = new Set()
	if (lookup.status === "found" && lookup.show) {
		present = librarySeasonsFromShow(lookup.show)
		libraryCodes = libraryEpisodeCodesFromShow(lookup.show)
		complete = completeSeasonsFromAired(airedEps, libraryCodes)
	}

	const plan = classifySeasonPlan(aired, complete, present, {
		fetchMissing: !!deps.fetchMissing,
	})
	return {
		auto: plan.auto,
		pending: plan.pending,
		libraryStatus: lookup.status,
		libraryUncertain: false,
		streamaMediaId: lookup.streamaId != null ? lookup.streamaId : null,
		present,
		complete,
		missing: missingEpisodeCodes(airedEps, plan.auto, libraryCodes),
	}
}

/**
 * Seasons to auto-enqueue. Empty means do not create a piratify job
 * (there may still be gap seasons waiting on admin approval).
 */
async function resolveTvSeasons(request, deps = {}) {
	const plan = await planTvSeasons(request, deps)
	return plan.auto
}

module.exports = {
	isTvMedia,
	isFetchNewSeasons,
	isTvSeasonFetch,
	normalizeSeasons,
	seasonsKey,
	normalizeMissing,
	missingKey,
	bookendSeasons,
	classifySeasonPlan,
	pendingSeasonsOf,
	airedSeasonNumbersFromEpisodes,
	airedEpisodesFromList,
	librarySeasonsFromShow,
	libraryEpisodeCodesFromShow,
	missingEpisodeCodes,
	missingCodesForSeasons,
	completeSeasonsFromAired,
	episodeCode,
	planTvSeasons,
	resolveTvSeasons,
	airedSeasonNumbers,
	librarySeasonNumbers,
	episodeHasVideo,
}
