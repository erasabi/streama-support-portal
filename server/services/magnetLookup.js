const axios = require("axios")
const cheerio = require("cheerio")
const {
	createSearchLog,
	recordAttempt,
	recordPick,
	finalizeSearchLog,
} = require("./magnetSearchLog")

// Server-side magnet/subtitle lookup. Mirrors the sources the client used
// (TMDB -> imdb_id, movies-api.accel.li YTS mirror, yifysubtitles) but persists
// the result so the pipeline can pull it and we can auto-mark availability.
//
// Every outbound call is recorded on a search log that the caller persists as a
// `magnet_lookup_detail` event. Behaviour is unchanged; the log exists so
// "the magnet is on YTS but the portal missed it" is answerable after the fact.

// Subtitle languages we report on. Only English is attached to the request
// `subtitleUrl` (English) and `subtitleUrlRu` on the request; both attach via
// rentify when present. Russian is still recorded per-language in the search log
// prove whether it was ever available upstream.
const SUBTITLE_LANGUAGES = ["English", "Russian"]

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
// `excludeHashes` skips torrents already tried (download Error / stall).
// Returns the winner plus why it won, so a miss can be explained.
function pickBestTorrentWithReason(torrents = [], excludeHashes = []) {
	if (!Array.isArray(torrents) || torrents.length === 0) {
		return { torrent: null, reason: "no torrents in YTS response" }
	}
	const skip = new Set(
		(excludeHashes || []).map((h) => String(h || "").toUpperCase()).filter(Boolean)
	)
	const eligible = skip.size
		? torrents.filter((t) => {
				const hash = String((t && (t.hash || extractInfoHash(t.url))) || "").toUpperCase()
				return hash && !skip.has(hash)
			})
		: torrents
	// Every torrent already tried: fall back to the full list rather than
	// reporting a miss on a title that does have sources.
	const exhausted = skip.size > 0 && eligible.length === 0
	const pool = eligible.length ? eligible : torrents
	const sorted = [...pool].sort((a, b) => {
		if (a.video_codec === "x264" && b.video_codec !== "x264") return -1
		if (a.video_codec !== "x264" && b.video_codec === "x264") return 1
		return qualityOrder(a.quality) - qualityOrder(b.quality)
	})
	const winner = sorted[0]
	if (!winner) {
		return { torrent: null, reason: "no torrent survived ranking" }
	}
	const parts = [`${winner.quality || "unknown quality"}`]
	if (winner.video_codec) parts.push(winner.video_codec)
	parts.push(`ranked 1 of ${pool.length}`)
	if (skip.size) {
		parts.push(
			exhausted
				? `all ${skip.size} previously-tried hash(es) exhausted, reusing full list`
				: `${skip.size} hash(es) excluded`
		)
	}
	return { torrent: winner, reason: parts.join("; "), exhausted }
}

function pickBestTorrent(torrents = [], excludeHashes = []) {
	return pickBestTorrentWithReason(torrents, excludeHashes).torrent || null
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

function yifySubtitlePageUrl(imdbCode) {
	return `https://yifysubtitles.ch/movie-imdb/${imdbCode}`
}

/** Top-rated subtitle href per language on one scrape of the index page. */
function subtitleHrefsByLanguage($) {
	const byLanguage = new Map()
	$("tr").each(function () {
		try {
			const language = $(this).find("span.sub-lang").text().trim()
			if (!language) return
			const href = $(this).find('a[href^="/subtitles/"]').attr("href")
			if (!href) return
			const rating = parseFloat($(this).find("span.label").text().trim())
			const score = Number.isFinite(rating) ? rating : -Infinity
			const prev = byLanguage.get(language)
			if (!prev || score > prev.score) byLanguage.set(language, { href, score })
		} catch (error) {
			/* ignore a single malformed row */
		}
	})
	return byLanguage
}

function subtitleZipUrl(href) {
	const filename = href.substring("/subtitles/".length)
	return "https://yifysubtitles.ch/subtitle/" + filename + ".zip"
}

/**
 * Scrape the subtitle index once and resolve a URL per requested language.
 * Reporting-only for anything other than English: the request still carries a
 * single `subtitleUrl`, so Russian shows up in the trace without changing what
 * the pipeline attaches today.
 *
 * @returns {Promise<{pageUrl: string, byLanguage: Object, error?: string}>}
 */
async function getYifySubtitleIndex(imdbCode, languages = SUBTITLE_LANGUAGES) {
	const pageUrl = yifySubtitlePageUrl(imdbCode)
	try {
		const { data: html } = await axios.get(pageUrl, { timeout: 15000 })
		const $ = cheerio.load(html)
		const hrefs = subtitleHrefsByLanguage($)
		const byLanguage = {}
		for (const language of languages) {
			const hit = hrefs.get(language)
			byLanguage[language] = {
				found: !!hit,
				url: hit ? subtitleZipUrl(hit.href) : null,
			}
		}
		return { pageUrl, byLanguage }
	} catch (error) {
		const byLanguage = {}
		for (const language of languages) {
			byLanguage[language] = { found: false, url: null, error: error.message }
		}
		return { pageUrl, byLanguage, error: error.message }
	}
}

async function getYifySubtitleUrl(imdbCode) {
	try {
		const index = await getYifySubtitleIndex(imdbCode, ["English"])
		if (index.error) {
			console.log("getYifySubtitleUrl error:", index.error)
			return null
		}
		const english = index.byLanguage.English
		return english && english.url ? english.url : null
	} catch (error) {
		console.log("getYifySubtitleUrl error:", error.message)
		return null
	}
}

/**
 * Look up a movie's magnet + subtitle by TMDB id.
 *
 * Every result carries `search`: the full attempt log (TMDB call, YTS call with
 * the raw torrent list, subtitle scrape per language, pick + reason). Callers
 * persist it so a miss can be explained later.
 *
 * @returns {Promise<{status: string, imdbId?, magnetUrl?, magnetHash?, magnetQuality?, subtitleUrl?, subtitleUrlRu?, search: Object}>}
 *   status is one of: "found" | "not_found" | "error"
 */
async function lookupMovieMagnet(tmdbId, opts = {}) {
	const excludeHashes = opts.excludeHashes || []
	const search = createSearchLog({ tmdbId, mediaType: "movie", excludeHashes })

	const tmdbUrl = `${TMDB_MOVIE_ENDPOINT}/${tmdbId}`
	let imdbId = null
	try {
		imdbId = await getImdbId(tmdbId)
		recordAttempt(search, {
			source: "tmdb",
			query: tmdbUrl,
			ok: true,
			imdbId: imdbId || undefined,
			found: !!imdbId,
		})
	} catch (error) {
		console.log("TMDB lookup failed:", error.message)
		recordAttempt(search, {
			source: "tmdb",
			query: tmdbUrl,
			ok: false,
			error: error.message,
		})
		finalizeSearchLog(search, {
			outcome: "error",
			missReason: `TMDB lookup failed: ${error.message}`,
		})
		return { status: "error", search }
	}
	if (!imdbId) {
		// TMDB reachable but no imdb id yet -> treat as not released/known.
		finalizeSearchLog(search, {
			outcome: "not_found",
			missReason: "TMDB has no imdb_id for this title yet",
		})
		return { status: "not_found", imdbId: null, search }
	}

	const ytsUrl = `${YTS_MIRROR}?imdb_id=${imdbId}`
	let movie = null
	try {
		const { data } = await axios.get(ytsUrl, YTS_REQUEST)
		movie = data && data.data ? data.data.movie : null
		recordAttempt(search, {
			source: "yts",
			query: ytsUrl,
			ok: true,
			imdbId,
			movieId: movie ? movie.id : null,
			movieTitle: movie ? movie.title_long || movie.title : null,
			resultCount: movie && Array.isArray(movie.torrents) ? movie.torrents.length : 0,
			torrents: movie && Array.isArray(movie.torrents) ? movie.torrents : [],
		})
	} catch (error) {
		console.log("YTS mirror failed:", error.message)
		recordAttempt(search, {
			source: "yts",
			query: ytsUrl,
			ok: false,
			imdbId,
			error: error.message,
		})
		finalizeSearchLog(search, {
			outcome: "error",
			missReason: `YTS mirror failed: ${error.message}`,
		})
		return { status: "error", imdbId, search }
	}

	if (
		!movie ||
		movie.id === 0 ||
		!Array.isArray(movie.torrents) ||
		movie.torrents.length === 0
	) {
		// Distinguish "mirror has no such movie" from "movie exists, zero torrents".
		const missReason = !movie
			? "YTS mirror returned no movie object"
			: movie.id === 0
			? "YTS mirror returned movie.id === 0 (not in mirror)"
			: "YTS movie found but torrent list is empty"
		finalizeSearchLog(search, { outcome: "not_found", missReason })
		return { status: "not_found", imdbId, search }
	}

	const picked = pickBestTorrentWithReason(movie.torrents, excludeHashes)
	const best = picked.torrent
	if (!best || !best.url) {
		finalizeSearchLog(search, {
			outcome: "not_found",
			missReason: picked.reason || "no usable torrent url",
		})
		return { status: "not_found", imdbId, search }
	}
	recordPick(search, { torrent: best, reason: picked.reason })

	// Subtitle is best-effort; never fail the lookup on subtitle errors.
	// English + Russian YIFY URLs ride with the movie torrent (rentify -s ×2).
	let subtitleUrl = null
	let subtitleUrlRu = null
	try {
		const index = await getYifySubtitleIndex(imdbId, SUBTITLE_LANGUAGES)
		for (const language of SUBTITLE_LANGUAGES) {
			const row = index.byLanguage[language] || {}
			recordAttempt(search, {
				source: "yifysubtitles",
				query: index.pageUrl,
				language,
				ok: !index.error,
				found: !!row.found,
				subtitleUrl: row.url || undefined,
				error: row.error || index.error || undefined,
			})
		}
		const english = index.byLanguage.English
		const russian = index.byLanguage.Russian
		subtitleUrl = english && english.url ? english.url : null
		subtitleUrlRu = russian && russian.url ? russian.url : null
	} catch (error) {
		recordAttempt(search, {
			source: "yifysubtitles",
			query: yifySubtitlePageUrl(imdbId),
			ok: false,
			error: error.message,
		})
		subtitleUrl = null
		subtitleUrlRu = null
	}

	finalizeSearchLog(search, { outcome: "found" })

	return {
		status: "found",
		imdbId,
		magnetUrl: best.url,
		magnetHash: best.hash || extractInfoHash(best.url),
		magnetQuality: best.quality || null,
		subtitleUrl,
		subtitleUrlRu,
		search,
	}
}

module.exports = {
	SUBTITLE_LANGUAGES,
	lookupMovieMagnet,
	getYifySubtitleUrl,
	getYifySubtitleIndex,
	pickBestTorrent,
	pickBestTorrentWithReason,
	extractInfoHash,
}
