/**
 * Streama library lookup by TMDB apiId. Callers must treat status
 * "error" / "unconfigured" as uncertain (do not auto-download).
 * "missing" means the index was searched and the title is not there.
 * "found" means show.json / movie.json loaded.
 */
const STREAMA_FETCH_MS = 8000
const STREAMA_INDEX_MS = 20000
const STREAMA_INDEX_PAGE = 200

/**
 * Node's fetch has no default timeout. Streama login + index scans were
 * blocking Request Update until TCP gave up.
 */
function fetchWithTimeout(fetchImpl, ms = STREAMA_FETCH_MS) {
	const get = fetchImpl || fetch
	return async (url, opts = {}) => {
		const ctrl = new AbortController()
		const timer = setTimeout(() => ctrl.abort(), ms)
		try {
			return await get(url, { ...opts, signal: ctrl.signal })
		} catch (err) {
			if (err && (err.name === "AbortError" || err.code === "ABORT_ERR")) {
				throw new Error(`fetch timeout (${ms}ms)`)
			}
			throw err
		} finally {
			clearTimeout(timer)
		}
	}
}

function streamaOrigins() {
	const seen = new Set()
	const out = []
	for (const raw of [process.env.STREAMA_URL, process.env.STREAMA_ENDPOINT]) {
		const base = String(raw || "").replace(/\/$/, "")
		if (!base || seen.has(base)) continue
		seen.add(base)
		out.push(base)
	}
	return out
}

function streamaConfig() {
	const origins = streamaOrigins()
	return {
		baseUrl: origins[0] || "",
		origins,
		username: process.env.STREAMA_USERNAME || "",
		password: process.env.STREAMA_PASSWORD || "",
	}
}

class CookieJar {
	constructor() {
		this.cookies = new Map()
	}
	header() {
		const parts = []
		for (const [k, v] of this.cookies) parts.push(`${k}=${v}`)
		return parts.join("; ")
	}
	store(res) {
		const getSet = res.headers && res.headers.getSetCookie
		let list = typeof getSet === "function" ? getSet.call(res.headers) : []
		if ((!list || !list.length) && res.headers && typeof res.headers.get === "function") {
			const raw = res.headers.get("set-cookie")
			if (raw) list = [raw]
		}
		for (const raw of list || []) {
			const nv = String(raw).split(";")[0]
			const eq = nv.indexOf("=")
			if (eq > 0) this.cookies.set(nv.slice(0, eq).trim(), nv.slice(eq + 1))
		}
	}
}

function fileLooksLikeVideo(f) {
	const ct = String((f && f.contentType) || "")
	const name = String((f && (f.originalFilename || f.src)) || "")
	if (/application\/x-subrip/i.test(ct) || /\.srt$/i.test(name)) return false
	if (ct.startsWith("video")) return true
	if (/\.(mkv|mp4|m4v|avi|mov|ts|webm|mpg|mpeg)$/i.test(name)) return true
	// Streama show/movie JSON often nests attached files as `{id}` only.
	return Boolean(f && f.id != null && !ct && !name)
}

function mediaHasVideo(media) {
	if (!media || media.deleted) return false
	const files = media.files || []
	return files.some(fileLooksLikeVideo)
}

async function streamaLogin(cfg, fetchImpl) {
	const get = fetchWithTimeout(fetchImpl)
	if (!cfg.baseUrl || !cfg.username || !cfg.password) return null
	const jar = new CookieJar()
	const authed = async (url, opts = {}) => {
		const headers = new Headers(opts.headers || {})
		const cookie = jar.header()
		if (cookie) headers.set("cookie", cookie)
		if (!headers.has("accept")) headers.set("accept", "application/json")
		const res = await get(url, { ...opts, headers, redirect: "manual" })
		jar.store(res)
		return res
	}
	await authed(`${cfg.baseUrl}/login/auth`, { method: "GET" })
	const form = new URLSearchParams({
		username: cfg.username,
		password: cfg.password,
		"remember-me": "on",
	})
	const loginRes = await authed(`${cfg.baseUrl}/login/authenticate`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: form.toString(),
	})
	const loc = loginRes.headers.get("location") || loginRes.url || ""
	if (/login_error/.test(loc)) {
		throw new Error("streama login rejected")
	}
	return {
		getJson: async (path) => {
			const res = await authed(`${cfg.baseUrl}${path}`, { method: "GET" })
			if (!res.ok) {
				const body = await res.text()
				throw new Error(`streama ${path} failed (${res.status}): ${body.slice(0, 200)}`)
			}
			return res.json()
		},
	}
}

function indexRows(data) {
	return Array.isArray(data) ? data : (data && data.list) || []
}

function rowApiIdMatches(row, want) {
	return row && (row.apiId === want || Number(row.apiId) === want)
}

/**
 * Prefer Streama's `apiId` filter (one query). Fall back to paging the index
 * only when the server ignored the param (mixed apiIds + a larger total).
 */
async function findIdByApiId(client, indexPath, tmdbId, opts = {}) {
	const want = Number(tmdbId)
	if (!Number.isFinite(want)) return null
	const sep = indexPath.includes("?") ? "&" : "?"
	const pageSize = opts.pageSize || STREAMA_INDEX_PAGE

	const filtered = await client.getJson(
		`${indexPath}${sep}max=5&offset=0&apiId=${encodeURIComponent(String(want))}`
	)
	const filteredRows = indexRows(filtered)
	const hit = filteredRows.find((row) => rowApiIdMatches(row, want))
	if (hit) return Number(hit.id)
	const filteredTotal =
		filtered && filtered.total != null ? Number(filtered.total) : filteredRows.length
	const looksFiltered =
		filteredRows.length === 0 ||
		filteredRows.every((row) => rowApiIdMatches(row, want))
	if (looksFiltered && filteredTotal <= Math.max(filteredRows.length, 5)) {
		return null
	}

	const deadline = opts.deadline || Date.now() + STREAMA_INDEX_MS
	let offset = 0
	let total = null
	while (total == null || offset < total) {
		if (Date.now() > deadline) {
			throw new Error("streama index scan timeout")
		}
		const data = await client.getJson(
			`${indexPath}${sep}max=${pageSize}&offset=${offset}&sort=dateCreated&order=DESC`
		)
		const rows = indexRows(data)
		total =
			data.total != null
				? data.total
				: rows.length < pageSize
					? offset + rows.length
					: offset + pageSize
		for (const row of rows) {
			if (rowApiIdMatches(row, want)) return Number(row.id)
		}
		if (!rows.length) break
		offset += rows.length
		if (offset > 5000) break
	}
	return null
}

function emptyLookup(status, streamaId = null, error) {
	return { status, show: null, movie: null, streamaId, error }
}

async function lookupByApiId(request, deps, kind) {
	const cfg = deps.streamaConfig || streamaConfig()
	const fetchImpl = deps.fetchImpl
	const origins = Array.isArray(cfg.origins) && cfg.origins.length
		? cfg.origins
		: cfg.baseUrl
			? [cfg.baseUrl]
			: []
	if (!origins.length || !cfg.username || !cfg.password) {
		return emptyLookup("unconfigured")
	}
	const indexPath = kind === "movie" ? "/movie/index.json" : "/tvShow/index.json"
	const showPath = kind === "movie" ? "/movie/show.json" : "/tvShow/show.json"
	const cachedId =
		request.streamaMediaId != null ? Number(request.streamaMediaId) : null
	let lastErr = null
	for (const baseUrl of origins) {
		try {
			const client = await streamaLogin({ ...cfg, baseUrl }, fetchImpl)
			if (!client) continue
			let id = cachedId
			if (!id && request.id && !String(request.id).includes(":")) {
				id = await findIdByApiId(client, indexPath, request.id)
			}
			if (!id) return emptyLookup("missing")
			let body
			try {
				body = await client.getJson(`${showPath}?id=${id}`)
			} catch (showErr) {
				if (cachedId && request.id && !String(request.id).includes(":")) {
					id = await findIdByApiId(client, indexPath, request.id)
					if (id) body = await client.getJson(`${showPath}?id=${id}`)
					else throw showErr
				} else {
					throw showErr
				}
			}
			if (kind === "movie") {
				return { status: "found", show: null, movie: body, streamaId: id }
			}
			return { status: "found", show: body, movie: null, streamaId: id }
		} catch (err) {
			lastErr = err
			console.error(`streama ${kind} lookup failed:`, err.message)
		}
	}
	return emptyLookup("error", cachedId, lastErr && lastErr.message)
}

async function lookupLibraryShow(request, deps = {}) {
	return lookupByApiId(request, deps, "tv")
}

async function lookupLibraryMovie(request, deps = {}) {
	return lookupByApiId(request, deps, "movie")
}

module.exports = {
	streamaConfig,
	streamaLogin,
	fetchWithTimeout,
	fileLooksLikeVideo,
	mediaHasVideo,
	findIdByApiId,
	lookupLibraryShow,
	lookupLibraryMovie,
}
