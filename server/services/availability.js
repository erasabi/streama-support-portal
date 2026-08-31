const axios = require("axios")

const TMDB_API_KEY =
	process.env.TMDB_API_KEY || "11cce9d83563a5188d7201b2514f7286"
const TMDB_BASE = "https://api.themoviedb.org/3"

// TMDB movie release types: 1 Premiere, 2 Limited theatrical, 3 Theatrical,
// 4 Digital, 5 Physical, 6 TV.
const TYPE_THEATRICAL = new Set([2, 3])
const TYPE_HOME = new Set([4, 5])

// If TMDB has a theatrical date but no digital/physical date yet, treat the
// title as still exclusive to theaters for this many days after opening.
const THEATRICAL_WINDOW_MS = 120 * 24 * 60 * 60 * 1000

function parseIsoDate(value) {
	if (!value) return null
	const d = new Date(value)
	return Number.isNaN(d.getTime()) ? null : d
}

function isTvRequest(request) {
	const t = String((request && request.mediaType) || "").toLowerCase()
	return t === "tv" || t === "tvshow" || t === "show"
}

function isReleaseDateInFuture(releaseDate, now = new Date()) {
	const d = parseIsoDate(releaseDate)
	if (!d) return false
	return d.getTime() > now.getTime()
}

/**
 * Sync stand-in for isNotYetReleased when we cannot call TMDB (list API).
 * TV: premiere still in the future. Movies: not opened yet, or still inside
 * the default theatrical window (home/digital dates need TMDB on lookup).
 */
function shouldDisplayNotYetAvailable(request, now = new Date()) {
	if (!request) return false
	if (isTvRequest(request)) {
		return isReleaseDateInFuture(request.releaseDate, now)
	}
	if (isReleaseDateInFuture(request.releaseDate, now)) return true
	const d = parseIsoDate(request.releaseDate)
	if (!d) return false
	const delta = now.getTime() - d.getTime()
	return delta >= 0 && delta < THEATRICAL_WINDOW_MS
}

function earliestDate(entries, types) {
	let min = null
	for (const entry of entries || []) {
		if (!types.has(Number(entry.type))) continue
		const d = parseIsoDate(entry.release_date)
		if (!d) continue
		if (!min || d < min) min = d
	}
	return min
}

function flattenReleaseDates(payload, preferRegion = "US") {
	const results = (payload && payload.results) || []
	const preferred = results.find((r) => r.iso_3166_1 === preferRegion)
	const ordered = preferred
		? [preferred, ...results.filter((r) => r !== preferred)]
		: results
	const out = []
	for (const region of ordered) {
		for (const rd of region.release_dates || []) {
			out.push(rd)
		}
	}
	return out
}

/**
 * @returns {boolean|null} true = not yet released, false = expect sources,
 *   null = not enough TMDB type info.
 */
function isUnreleasedFromDates(entries, now = new Date()) {
	const home = earliestDate(entries, TYPE_HOME)
	const theatrical = earliestDate(entries, TYPE_THEATRICAL)
	// A future theatrical date always wins. Stale digital/physical dates in
	// some region must not mark an unreleased title as out on home video.
	if (theatrical && theatrical > now) return true
	if (home) return home > now
	if (theatrical) {
		return now.getTime() - theatrical.getTime() < THEATRICAL_WINDOW_MS
	}
	return null
}

async function fetchMovieReleaseDates(tmdbId) {
	const { data } = await axios.get(`${TMDB_BASE}/movie/${tmdbId}/release_dates`, {
		params: { api_key: TMDB_API_KEY },
		timeout: 15000,
	})
	return flattenReleaseDates(data)
}

/**
 * True when torrents/YTS should not exist yet: TV premiere still in the
 * future, movie not yet in theaters, or still in the theatrical window
 * with no home/digital release.
 */
async function isNotYetReleased(request, opts = {}) {
	const now = opts.now || new Date()
	if (!request) return false
	if (isTvRequest(request)) {
		return isReleaseDateInFuture(request.releaseDate, now)
	}

	let entries = opts.movieReleaseDates
	if (entries === undefined && request.id) {
		try {
			entries = await fetchMovieReleaseDates(request.id)
		} catch (err) {
			console.log("TMDB release_dates failed:", err.message)
			entries = null
		}
	}
	if (entries && entries.length) {
		const fromTypes = isUnreleasedFromDates(entries, now)
		if (fromTypes !== null) return fromTypes
	}
	return isReleaseDateInFuture(request.releaseDate, now)
}

/**
 * Stage to store when automated search found nothing.
 * not_yet_available — not released / still in theaters
 * needs_manual_check — released but no source; look by hand
 */
async function classifySourceMiss(request, opts = {}) {
	if (await isNotYetReleased(request, opts)) return "not_yet_available"
	return "needs_manual_check"
}

module.exports = {
	THEATRICAL_WINDOW_MS,
	classifySourceMiss,
	fetchMovieReleaseDates,
	flattenReleaseDates,
	isNotYetReleased,
	isReleaseDateInFuture,
	isUnreleasedFromDates,
	isTvRequest,
	shouldDisplayNotYetAvailable,
}
