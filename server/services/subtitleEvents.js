/**
 * Derive subtitle timeline events from an agent's freeform `detail` payload.
 * Accepts a few shapes so rentify/sortify don't need a rigid contract:
 *   detail.subtitle = "uploaded" | "failed" | "missing"
 *   detail.subtitle = { status, language?, error? }
 *   detail.subtitleUploaded = true | false
 *   detail.subtitleAcquire = { video, tmdbId, trigger, languages: { en: { status } } }
 */

const ACQUIRE_STATUS_TO_TYPE = {
	kept: "subtitle_upload",
	already_present: "subtitle_upload",
	rejected: "subtitle_upload_failed",
	not_found: "subtitle_missing",
	skipped: "subtitle_missing",
	error: "subtitle_upload_failed",
}

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

function subtitleEventsFromAcquire(detail) {
	const acquire =
		detail && typeof detail === "object" && detail.subtitleAcquire && typeof detail.subtitleAcquire === "object"
			? detail.subtitleAcquire
			: null
	if (!acquire) return []
	const languages =
		acquire.languages && typeof acquire.languages === "object" && !Array.isArray(acquire.languages)
			? acquire.languages
			: {}
	const events = []
	for (const [language, row] of Object.entries(languages)) {
		const status = row && row.status
		const type = ACQUIRE_STATUS_TO_TYPE[status]
		if (!type) continue
		events.push({
			type,
			payload: {
				language,
				status,
				error: (row && (row.reason || row.error)) || null,
				trigger: acquire.trigger || null,
				video: acquire.video || null,
			},
		})
	}
	return events
}

function subtitleEventsFromDetail(detail) {
	const fromAcquire = subtitleEventsFromAcquire(detail)
	if (fromAcquire.length) return fromAcquire
	const one = subtitleEventFromDetail(detail)
	return one ? [one] : []
}

module.exports = {
	subtitleEventFromDetail,
	subtitleEventsFromAcquire,
	subtitleEventsFromDetail,
}
