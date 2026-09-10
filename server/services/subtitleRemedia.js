const { canonicalTmdbId, isNamespacedRequestId } = require("../utils/requestId")

const LABEL_ADD = "Add Subtitles"
const LABEL_FIX = "Fix Subtitles"
const SUBTITLE_REMEDIA_LABELS = [LABEL_ADD, LABEL_FIX]

function isSubtitleRemediaMessage(message) {
	const s = String(message || "")
	if (/fix\s*sub(?:t)?itles?/i.test(s)) return true
	return /add\s*sub(?:t)?itles?/i.test(s)
}

function subtitleRemediaLabel(message) {
	const s = String(message || "")
	if (/fix\s*sub(?:t)?itles?/i.test(s)) return LABEL_FIX
	if (/add\s*sub(?:t)?itles?/i.test(s)) return LABEL_ADD
	return null
}

function isSubtitleRemediaLabel(label) {
	return SUBTITLE_REMEDIA_LABELS.includes(String(label || ""))
}

function isSubtitleRemediaRequest(request) {
	if (!request) return false
	if (isSubtitleRemediaLabel(request.queueStatus)) return true
	return (
		isNamespacedRequestId(request.id) &&
		isSubtitleRemediaMessage(request.queueMessage)
	)
}

function tmdbIdFromRequest(request) {
	const tmdbId = canonicalTmdbId(request && request.id)
	if (!tmdbId || !/^\d+$/.test(String(tmdbId))) return null
	return String(tmdbId)
}

module.exports = {
	LABEL_ADD,
	LABEL_FIX,
	SUBTITLE_REMEDIA_LABELS,
	isSubtitleRemediaMessage,
	subtitleRemediaLabel,
	isSubtitleRemediaLabel,
	isSubtitleRemediaRequest,
	tmdbIdFromRequest,
}
