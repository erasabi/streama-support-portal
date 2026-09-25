/**
 * Human-readable subtitle labels for RequestEvent history (mirrors client pipeline.js).
 */

const LANGUAGE_NAMES = {
	en: "English",
	ru: "Russian",
	es: "Spanish",
	fr: "French",
	de: "German",
	pt: "Portuguese",
	it: "Italian",
	uk: "Ukrainian",
}

function formatLanguage(code) {
	if (code == null || code === "") return "Unknown"
	const token = String(code).trim().toLowerCase()
	const base = token.split(/[-_]/)[0]
	return LANGUAGE_NAMES[base] || token.toUpperCase()
}

function languageFromSubtitleUrl(url) {
	if (!url || typeof url !== "string") return null
	const lower = url.toLowerCase()
	if (/-russian-|-rus-/.test(lower)) return "ru"
	if (/-english-|-eng-/.test(lower)) return "en"
	return null
}

function languageFromPayload(payload) {
	if (!payload || typeof payload !== "object") return "en"
	if (payload.language) return String(payload.language).toLowerCase()
	const fromUrl = languageFromSubtitleUrl(payload.url)
	if (fromUrl) return fromUrl
	return "en"
}

function subtitleHistoryLabel(type, payload) {
	const lang = formatLanguage(languageFromPayload(payload))
	const p = payload && typeof payload === "object" ? payload : {}
	switch (type) {
		case "subtitle_lookup":
			return p.found ? `${lang} subtitle found` : `${lang} subtitle missing`
		case "subtitle_found":
			return `${lang} subtitle found`
		case "subtitle_missing":
			return `${lang} subtitle missing`
		case "subtitle_upload":
			return `${lang} subtitle uploaded`
		case "subtitle_upload_failed":
			return `${lang} subtitle failed`
		default:
			return null
	}
}

function enrichEventRow(row) {
	const plain = row && typeof row.toJSON === "function" ? row.toJSON() : { ...row }
	const label = subtitleHistoryLabel(plain.type, plain.payload)
	if (label) plain.displayLabel = label
	return plain
}

module.exports = {
	enrichEventRow,
	subtitleHistoryLabel,
	formatLanguage,
	languageFromPayload,
}
