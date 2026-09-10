// Optional read-only enrichment for the pipeline trace.
//
// Most of what the trace needs is already mirrored in the portal (artifacts,
// ledger, events posted by rentify/sortify). These calls add the live view the
// portal never sees -- uTorrent status, on-disk `subs/` listings, Streama
// match/highlight rows -- when the boxes expose an inspection endpoint.
//
// Every call is best-effort and fails soft: the trace records `unconfigured` or
// `unreachable` instead of erroring, so a missing agent never blocks a trace.

const DEFAULT_TIMEOUT_MS = 6000

function agentConfig() {
	return {
		prelanflix: {
			baseUrl: String(process.env.PRELANFLIX_AGENT_URL || "").replace(/\/$/, ""),
			token: process.env.PRELANFLIX_AGENT_TOKEN || process.env.PIPELINE_API_TOKEN || "",
		},
		sortify: {
			baseUrl: String(process.env.SORTIFY_AGENT_URL || "").replace(/\/$/, ""),
			token: process.env.SORTIFY_AGENT_TOKEN || process.env.SORTIFY_API_TOKEN || "",
		},
	}
}

async function getJson(url, { token, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
	const get = fetchImpl || fetch
	const ctrl = new AbortController()
	const timer = setTimeout(() => ctrl.abort(), timeoutMs)
	try {
		const res = await get(url, {
			signal: ctrl.signal,
			headers: token ? { Authorization: `Bearer ${token}` } : {},
		})
		if (!res.ok) {
			return { status: "unreachable", error: `HTTP ${res.status}`, url }
		}
		return { status: "ok", data: await res.json(), url }
	} catch (err) {
		const aborted = err && (err.name === "AbortError" || err.code === "ABORT_ERR")
		return {
			status: "unreachable",
			error: aborted ? `timeout after ${timeoutMs}ms` : err.message,
			url,
		}
	} finally {
		clearTimeout(timer)
	}
}

/**
 * Live download/encode view for one pipeline folder: rentify units, uTorrent
 * status per infoHash, on-disk stage listings including `subs/`.
 */
async function fetchPrelanflixView(folderName, deps = {}) {
	const cfg = (deps.config || agentConfig()).prelanflix
	if (!folderName) return { status: "skipped", reason: "no folderName" }
	if (!cfg.baseUrl) {
		return {
			status: "unconfigured",
			reason:
				"No Prelanflix inspection API exists; the worker only calls the portal. " +
				"Live rentify/uTorrent state arrives via detail.downloader on progress ticks instead.",
		}
	}
	const url = `${cfg.baseUrl}/pipeline/trace?folder=${encodeURIComponent(folderName)}`
	return getJson(url, { token: cfg.token, fetchImpl: deps.fetchImpl })
}

/**
 * Live sort/register view: sortify history for the folder, Streama match
 * identity (`apiId` the matcher would assign) and dashboard highlight rows.
 */
async function fetchSortifyView({ folderName, tmdbId, streamaMediaId }, deps = {}) {
	const cfg = (deps.config || agentConfig()).sortify
	if (!cfg.baseUrl) {
		return {
			status: "unconfigured",
			reason:
				"No Sortify inspection API exists; the agent only posts to the portal. " +
				"Identity and highlight facts arrive via detail.apiId / detail.highlightStatus on events instead.",
		}
	}
	const params = new URLSearchParams()
	if (folderName) params.set("folder", folderName)
	if (tmdbId) params.set("tmdb", String(tmdbId))
	if (streamaMediaId) params.set("mediaId", String(streamaMediaId))
	const url = `${cfg.baseUrl}/sortify/trace?${params.toString()}`
	return getJson(url, { token: cfg.token, fetchImpl: deps.fetchImpl })
}

module.exports = {
	DEFAULT_TIMEOUT_MS,
	agentConfig,
	fetchPrelanflixView,
	fetchSortifyView,
}
