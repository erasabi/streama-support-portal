const axios = require("axios")
const cheerio = require("cheerio")

// Server-side magnet/subtitle lookup. Mirrors the sources the client used
// (TMDB -> imdb_id, movies-api.accel.li YTS mirror, yifysubtitles) but persists
// the result so the pipeline can pull it and we can auto-mark availability.

const TMDB_API_KEY =
	process.env.TMDB_API_KEY || "11cce9d83563a5188d7201b2514f7286"
const TMDB_MOVIE_ENDPOINT = "https://api.themoviedb.org/3/movie"
const YTS_MIRROR = "https://movies-api.accel.li/api/v2/movie_details.json"
// This Cloudflare origin consistently takes ~20s TTFB for both hits and
// misses. Axios 15s was aborting before the JSON arrived, so unreleased
// titles were logged as timeouts instead of movie.id === 0 (not found).
// DNS also returns AAAA records that are not reachable from this host.
const YTS_TIMEOUT_MS = 45000
const YTS_REQUEST = { timeout: YTS_TIMEOUT_MS, family: 4 }

function qualityOrder(quality) {
	switch (quality) {
		case "1080p":
			return 1
		case "2160p":
			return 2
		default:
			return 3
	}
}

// Prefer x264 (browser/Firestick friendly), then 1080p > 2160p > other.
function pickBestTorrent(torrents = []) {
	if (!Array.isArray(torrents) || torrents.length === 0) return null
	const sorted = [...torrents].sort((a, b) => {
		if (a.video_codec === "x264" && b.video_codec !== "x264") return -1
		if (a.video_codec !== "x264" && b.video_codec === "x264") return 1
		return qualityOrder(a.quality) - qualityOrder(b.quality)
	})
	return sorted[0]
}

// Extract the 40-char btih info hash from a magnet or YTS download URL.
function extractInfoHash(urlOrMagnet) {
	if (!urlOrMagnet) return null
	const magnetMatch = urlOrMagnet.match(/btih:([A-Fa-f0-9]{40})/)
	if (magnetMatch) return magnetMatch[1].toUpperCase()
	const ytsMatch = urlOrMagnet.match(/([A-Fa-f0-9]{40})/)
	return ytsMatch ? ytsMatch[1].toUpperCase() : null
}

async function getImdbId(tmdbId) {
	const { data } = await axios.get(
		`${TMDB_MOVIE_ENDPOINT}/${tmdbId}?api_key=${TMDB_API_KEY}`,
		{ timeout: 15000 },
	)
	return data && data.imdb_id ? data.imdb_id : null
}

async function getYifySubtitleUrl(imdbCode) {
	try {
		const url = `https://yifysubtitles.ch/movie-imdb/${imdbCode}`
		const { data: html } = await axios.get(url, { timeout: 15000 })
		const $ = cheerio.load(html)
		const engElement = $("tr").filter(function () {
			return $(this).find("span.sub-lang").text().trim() === "English"
		})
		const listEng = {}
		engElement.each(function () {
			try {
				const rating = $(this).find("span.label").text().trim()
				const href = $(this).find('a[href^="/subtitles/"]').attr("href")
				if (href) listEng[rating] = href
			} catch (error) {
				/* ignore a single malformed row */
			}
		})
		if (Object.keys(listEng).length === 0) return null
		const topRatedKey = Object.keys(listEng).reduce((a, b) =>
			parseFloat(a) > parseFloat(b) ? a : b,
		)
		const filename = listEng[topRatedKey].substring("/subtitles/".length)
		return "https://yifysubtitles.ch/subtitle/" + filename + ".zip"
	} catch (error) {
		console.log("getYifySubtitleUrl error:", error.message)
		return null
	}
}

/**
 * Look up a movie's magnet + subtitle by TMDB id.
 *
 * @returns {Promise<{status: string, imdbId?, magnetUrl?, magnetHash?, magnetQuality?, subtitleUrl?}>}
 *   status is one of: "found" | "not_found" | "error"
 */
async function lookupMovieMagnet(tmdbId) {
	let imdbId = null
	try {
		imdbId = await getImdbId(tmdbId)
	} catch (error) {
		console.log("TMDB lookup failed:", error.message)
		return { status: "error" }
	}
	if (!imdbId) {
		// TMDB reachable but no imdb id yet -> treat as not released/known.
		return { status: "not_found", imdbId: null }
	}

	let movie = null
	try {
		const { data } = await axios.get(
			`${YTS_MIRROR}?imdb_id=${imdbId}`,
			YTS_REQUEST,
		)
		movie = data && data.data ? data.data.movie : null
	} catch (error) {
		console.log("YTS mirror failed:", error.message)
		return { status: "error", imdbId }
	}

	if (
		!movie ||
		movie.id === 0 ||
		!Array.isArray(movie.torrents) ||
		movie.torrents.length === 0
	) {
		return { status: "not_found", imdbId }
	}

	const best = pickBestTorrent(movie.torrents)
	if (!best || !best.url) {
		return { status: "not_found", imdbId }
	}

	// Subtitle is best-effort; never fail the lookup on subtitle errors.
	let subtitleUrl = null
	try {
		subtitleUrl = await getYifySubtitleUrl(imdbId)
	} catch (error) {
		subtitleUrl = null
	}

	return {
		status: "found",
		imdbId,
		magnetUrl: best.url,
		magnetHash: best.hash || extractInfoHash(best.url),
		magnetQuality: best.quality || null,
		subtitleUrl,
	}
}

module.exports = {
	lookupMovieMagnet,
	getYifySubtitleUrl,
	pickBestTorrent,
	extractInfoHash,
}
