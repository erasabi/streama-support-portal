// Structured record of every lookup attempt made while searching for a movie
// source. Persisted as a `magnet_lookup_detail` event so the pipeline trace can
// show which endpoints ran, which torrents came back, which one was picked, and
// why a title was classified as a miss.
//
// Nothing here changes lookup behaviour -- it only records it. "Magnet exists on
// YTS but the portal says not found" is unanswerable without this.

const MAX_TORRENTS = 50
const MAX_ATTEMPTS = 40
const MAX_ERROR_CHARS = 300

function trimText(value, max = MAX_ERROR_CHARS) {
	if (value == null) return null
	const text = String(value).trim()
	if (!text) return null
	return text.length > max ? `${text.slice(0, max)}...` : text
}

function upperHashes(list) {
	const out = []
	for (const raw of Array.isArray(list) ? list : []) {
		const hash = String(raw || "").trim().toUpperCase()
		if (hash && !out.includes(hash)) out.push(hash)
	}
	return out
}

/** Compact torrent view: enough to compare against what an operator sees on YTS. */
function summarizeTorrent(torrent) {
	if (!torrent || typeof torrent !== "object") return null
	const hash = torrent.hash ? String(torrent.hash).toUpperCase() : null
	return {
		hash,
		quality: torrent.quality || null,
		videoCodec: torrent.video_codec || null,
		type: torrent.type || null,
		seeds: Number.isFinite(Number(torrent.seeds)) ? Number(torrent.seeds) : null,
		peers: Number.isFinite(Number(torrent.peers)) ? Number(torrent.peers) : null,
		size: torrent.size || null,
		url: torrent.url || null,
	}
}

function createSearchLog({ tmdbId, mediaType = "movie", excludeHashes = [] } = {}) {
	return {
		tmdbId: tmdbId == null ? null : String(tmdbId),
		mediaType,
		excludeHashes: upperHashes(excludeHashes),
		attempts: [],
		pick: null,
		outcome: null,
		missReason: null,
		startedAt: new Date().toISOString(),
		finishedAt: null,
	}
}

/**
 * Record one outbound call. `source` is the system queried (tmdb, yts,
 * yifysubtitles, piratify); `query` is the search string or URL used.
 */
function recordAttempt(log, attempt = {}) {
	if (!log || !Array.isArray(log.attempts)) return null
	if (log.attempts.length >= MAX_ATTEMPTS) return null
	const row = {
		source: attempt.source || "unknown",
		query: trimText(attempt.query, 500),
		ok: attempt.ok === true,
	}
	if (attempt.language) row.language = String(attempt.language)
	if (attempt.imdbId) row.imdbId = String(attempt.imdbId)
	if (attempt.movieId != null) row.movieId = attempt.movieId
	if (attempt.movieTitle) row.movieTitle = trimText(attempt.movieTitle, 200)
	if (attempt.resultCount != null && Number.isFinite(Number(attempt.resultCount))) {
		row.resultCount = Number(attempt.resultCount)
	}
	if (Array.isArray(attempt.torrents)) {
		row.torrents = attempt.torrents
			.map(summarizeTorrent)
			.filter(Boolean)
			.slice(0, MAX_TORRENTS)
	}
	if (attempt.subtitleUrl) row.subtitleUrl = trimText(attempt.subtitleUrl, 500)
	if (attempt.found != null) row.found = !!attempt.found
	const error = trimText(attempt.error)
	if (error) row.error = error
	log.attempts.push(row)
	return row
}

/** The torrent that won `pickBestTorrent`, plus why it won. */
function recordPick(log, { torrent, reason } = {}) {
	if (!log) return null
	const summary = summarizeTorrent(torrent)
	log.pick = summary ? { ...summary, reason: trimText(reason, 200) } : null
	return log.pick
}

function finalizeSearchLog(log, { outcome, missReason } = {}) {
	if (!log) return null
	if (outcome) log.outcome = outcome
	const reason = trimText(missReason)
	if (reason) log.missReason = reason
	log.finishedAt = new Date().toISOString()
	return log
}

/** Languages seen on the subtitle index, with whether a URL was resolved. */
function subtitleLanguagesFromLog(log) {
	const out = {}
	for (const attempt of (log && log.attempts) || []) {
		if (attempt.source !== "yifysubtitles" || !attempt.language) continue
		out[attempt.language] = {
			found: !!attempt.found,
			url: attempt.subtitleUrl || null,
			error: attempt.error || null,
		}
	}
	return out
}

/** Event payload form: caps applied by recordAttempt, safe to persist as JSONB. */
function searchLogPayload(log) {
	if (!log) return null
	return {
		tmdbId: log.tmdbId,
		mediaType: log.mediaType,
		outcome: log.outcome,
		missReason: log.missReason,
		excludeHashes: log.excludeHashes,
		attempts: log.attempts,
		pick: log.pick,
		subtitleLanguages: subtitleLanguagesFromLog(log),
		startedAt: log.startedAt,
		finishedAt: log.finishedAt,
	}
}

module.exports = {
	MAX_TORRENTS,
	MAX_ATTEMPTS,
	createSearchLog,
	recordAttempt,
	recordPick,
	finalizeSearchLog,
	searchLogPayload,
	subtitleLanguagesFromLog,
	summarizeTorrent,
}
