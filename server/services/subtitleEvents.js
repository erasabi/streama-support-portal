/**
 * Derive a subtitle timeline event from an agent's freeform `detail` payload.
 * Accepts a few shapes so rentify/sortify don't need a rigid contract:
 *   detail.subtitle = "uploaded" | "failed" | "missing"
 *   detail.subtitle = { status, language?, error? }
 *   detail.subtitleUploaded = true | false
 */
function subtitleEventFromDetail(detail) {
	if (!detail || typeof detail !== "object") return null
	let status = null
	let language = detail.subtitleLanguage || detail.language || "en"
	let error = null
	if (typeof detail.subtitle === "string") {
		status = detail.subtitle
	} else if (detail.subtitle && typeof detail.subtitle === "object") {
		status = detail.subtitle.status || null
		language = detail.subtitle.language || language
		error = detail.subtitle.error || null
	} else if (typeof detail.subtitleUploaded === "boolean") {
		status = detail.subtitleUploaded ? "uploaded" : "failed"
	}
	if (!status) return null
	const map = {
		uploaded: "subtitle_upload",
		success: "subtitle_upload",
		failed: "subtitle_upload_failed",
		error: "subtitle_upload_failed",
		missing: "subtitle_missing",
		none: "subtitle_missing",
	}
	const type = map[status]
	if (!type) return null
	return { type, payload: { language, error } }
}

module.exports = { subtitleEventFromDetail }
