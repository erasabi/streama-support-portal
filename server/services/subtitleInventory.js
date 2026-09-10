// Language detection for subtitle file names as they appear across the pipeline.
//
// encode-watch names its output `<lang>_<media>.srt` (en_Movie.srt), YTS
// releases ship `Subs/English.srt` or `Movie.en.srt`, and Sortify/subify writes
// `<media>.en.srt`. The trace has to bucket all of those by language to answer
// "did Russian ever ride along with the media like English does".

// Spelled-out names seen in real releases -> ISO-ish code we report on.
const LANGUAGE_WORDS = {
	english: "en",
	eng: "en",
	russian: "ru",
	rus: "ru",
	russkij: "ru",
	spanish: "es",
	spa: "es",
	french: "fr",
	fre: "fr",
	german: "de",
	ger: "de",
	portuguese: "pt",
	italian: "it",
	dutch: "nl",
	arabic: "ar",
	chinese: "zh",
	japanese: "ja",
	korean: "ko",
	ukrainian: "uk",
	polish: "pl",
	turkish: "tr",
	hindi: "hi",
}

// Cyrillic "Русский" and friends: releases label Russian subs in Cyrillic.
const CYRILLIC_RUSSIAN = /[\u0420\u0440][\u0443\u0443][\u0441\u0421]/

const SUBTITLE_EXTENSIONS = [".srt", ".vtt", ".ass", ".ssa", ".sub", ".sup", ".idx"]

function baseName(name) {
	return String(name || "").split("/").pop()
}

function isSubtitleName(name) {
	const lower = String(name || "").toLowerCase()
	return SUBTITLE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function normalizeCode(raw) {
	const token = String(raw || "").trim().toLowerCase()
	if (!token) return null
	if (LANGUAGE_WORDS[token]) return LANGUAGE_WORDS[token]
	// Region forms: pt-BR, zh-hans
	const region = token.match(/^([a-z]{2})[-_]([a-z]{2,4})$/)
	if (region) return `${region[1]}-${region[2]}`
	if (/^[a-z]{2}$/.test(token)) return token
	if (/^[a-z]{3}$/.test(token)) return LANGUAGE_WORDS[token] || token
	return null
}

/**
 * Best-effort language code for a subtitle file name.
 * Checks, in order: `<lang>_` prefix (encode-watch), `.`/`_` delimited token
 * before the extension, spelled-out language word anywhere, Cyrillic Russian.
 */
function subtitleLanguage(name) {
	const base = baseName(name)
	if (!base) return null
	if (CYRILLIC_RUSSIAN.test(base)) return "ru"

	const withoutExt = base.replace(/\.[^.]+$/, "")

	// encode-watch form: en_Movie.srt / pt-br_Movie.srt
	const prefix = withoutExt.match(/^([a-z]{2}(?:[-_][a-z]{2,4})?)_/i)
	if (prefix) {
		const code = normalizeCode(prefix[1])
		if (code) return code
	}

	// Trailing token: Movie.en.srt / Movie_rus.srt / Movie.pt-BR.srt
	const trailing = withoutExt.match(/[._-]([A-Za-z]{2,4}(?:[-_][A-Za-z]{2,4})?)$/)
	if (trailing) {
		const code = normalizeCode(trailing[1])
		if (code) return code
	}

	// Named only by language: English.srt / 2_English.srt / Subs/Russian.srt
	for (const word of Object.keys(LANGUAGE_WORDS)) {
		const re = new RegExp(`(^|[^a-z])${word}([^a-z]|$)`, "i")
		if (re.test(withoutExt)) return LANGUAGE_WORDS[word]
	}

	return null
}

/**
 * Bucket a stage's file list by subtitle language.
 * @returns {{ languages: Object, unknown: string[], count: number }}
 */
function subtitlesByLanguage(files = []) {
	const languages = {}
	const unknown = []
	let count = 0
	for (const raw of Array.isArray(files) ? files : []) {
		const name = typeof raw === "string" ? raw : raw && raw.name
		if (!name) continue
		const declared = raw && typeof raw === "object" && raw.language ? raw.language : null
		if (!declared && !isSubtitleName(name)) continue
		count += 1
		const code = normalizeCode(declared) || subtitleLanguage(name)
		if (!code) {
			unknown.push(baseName(name))
			continue
		}
		if (!languages[code]) languages[code] = []
		languages[code].push(baseName(name))
	}
	return { languages, unknown, count }
}

module.exports = {
	LANGUAGE_WORDS,
	isSubtitleName,
	subtitleLanguage,
	subtitlesByLanguage,
	normalizeCode,
}
