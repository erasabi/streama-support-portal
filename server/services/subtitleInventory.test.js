const { subtitleLanguage, subtitlesByLanguage } = require("./subtitleInventory")

describe("subtitleLanguage", () => {
	test("encode-watch prefix form", () => {
		expect(subtitleLanguage("en_Sintel.srt")).toBe("en")
		expect(subtitleLanguage("ru_Sintel.srt")).toBe("ru")
		expect(subtitleLanguage("pt-br_Movie.srt")).toBe("pt-br")
	})

	test("trailing code form used by releases and subify", () => {
		expect(subtitleLanguage("Movie.en.srt")).toBe("en")
		expect(subtitleLanguage("Movie_rus.srt")).toBe("ru")
		expect(subtitleLanguage("Show.S01E01.eng.srt")).toBe("en")
	})

	test("language-only names from YTS Subs/ folders", () => {
		expect(subtitleLanguage("Subs/English.srt")).toBe("en")
		expect(subtitleLanguage("2_English.srt")).toBe("en")
		expect(subtitleLanguage("Subs/Russian.srt")).toBe("ru")
	})

	test("Cyrillic Russian naming is recognised", () => {
		expect(subtitleLanguage("\u0420\u0443\u0441\u0441\u043a\u0438\u0439.srt")).toBe("ru")
	})

	test("no detectable language returns null rather than guessing", () => {
		expect(subtitleLanguage("Movie.srt")).toBeNull()
		expect(subtitleLanguage("")).toBeNull()
	})
})

describe("subtitlesByLanguage", () => {
	test("buckets mixed naming conventions and ignores video files", () => {
		const out = subtitlesByLanguage([
			{ name: "Show.S01E01_1080p.mp4", kind: "video" },
			{ name: "en_Show.S01E01.srt" },
			{ name: "ru_Show.S01E01.srt" },
			{ name: "Subs/English.srt" },
		])
		expect(Object.keys(out.languages).sort()).toEqual(["en", "ru"])
		expect(out.languages.en).toHaveLength(2)
		expect(out.count).toBe(3)
	})

	test("an explicit language field wins over the filename", () => {
		const out = subtitlesByLanguage([{ name: "mystery.srt", language: "rus" }])
		expect(out.languages.ru).toEqual(["mystery.srt"])
	})

	test("undetectable subtitles are surfaced, not dropped", () => {
		const out = subtitlesByLanguage([{ name: "Movie.srt" }])
		expect(out.unknown).toEqual(["Movie.srt"])
		expect(out.count).toBe(1)
	})

	test("bitmap sidecars still count as subtitle files", () => {
		const out = subtitlesByLanguage([{ name: "Movie.en.sup" }])
		expect(out.languages.en).toEqual(["Movie.en.sup"])
	})
})
