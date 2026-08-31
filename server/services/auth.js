// Auth helpers.
//
// Agent routes are protected by bearer tokens (PIPELINE_API_TOKEN /
// SORTIFY_API_TOKEN). Browser magnet visibility is a best-effort check based on
// Streama identity headers forwarded by the SPA; locking the whole /requests
// surface behind a Streama session is a documented follow-up. The important
// guarantee today is that magnets never ship in the public list payload and are
// only returned on a single-request fetch to the owner or an admin.

const PIPELINE_TOKENS = () =>
	[process.env.PIPELINE_API_TOKEN, process.env.SORTIFY_API_TOKEN].filter(Boolean)

const ADMIN_SECRETS = process.env.ADMIN_SECRETS
const SUPERUSER_SECRETS = process.env.SUPERUSER_SECRETS

function agentAuth(req, res, next) {
	const tokens = PIPELINE_TOKENS()
	if (tokens.length === 0) {
		return res.status(401).json({ error: "agent API disabled: no token configured" })
	}
	const header = req.get("authorization") || ""
	const match = header.match(/^Bearer\s+(.+)$/i)
	const provided = match ? match[1].trim() : null
	if (!provided || !tokens.includes(provided)) {
		return res.status(401).json({ error: "invalid or missing agent token" })
	}
	req.agent = provided === process.env.SORTIFY_API_TOKEN ? "sortify" : "pipeline"
	next()
}

function isAdminRequest(req) {
	// Non-production convenience mirrors the client's dev shortcut.
	if (process.env.NODE_ENV !== "production") return true
	const user = req.get("x-streama-user")
	const authorities = req.get("x-streama-authorities") || ""
	if (SUPERUSER_SECRETS && user === SUPERUSER_SECRETS) return true
	if (ADMIN_SECRETS && authorities.split(",").map((a) => a.trim()).includes(ADMIN_SECRETS))
		return true
	return false
}

function canViewMagnet(req, request) {
	if (isAdminRequest(req)) return true
	const user = req.get("x-streama-user")
	return !!user && user === request.requestUser
}

function adminOnly(req, res, next) {
	if (!isAdminRequest(req)) {
		return res.status(403).json({ error: "admin only" })
	}
	next()
}

module.exports = { agentAuth, adminOnly, isAdminRequest, canViewMagnet }
