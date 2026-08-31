// Request PK is VARCHAR (TMDB id). Clients and TMDB often send numeric ids.
function normalizeRequestId(id) {
	if (id == null || id === "") return id
	return String(id)
}

// "update:{tmdb}:{ts}" / "issue:{tmdb}:{ts}" → the pipeline TMDB id.
// Plain TMDB ids are returned unchanged.
function canonicalTmdbId(id) {
	const s = normalizeRequestId(id)
	if (!s) return s
	const m = String(s).match(/^(?:update|issue):([^:]+):/i)
	return m ? m[1] : s
}

function isNamespacedRequestId(id) {
	return /^(?:update|issue):/i.test(String(id || ""))
}

module.exports = { normalizeRequestId, canonicalTmdbId, isNamespacedRequestId }
