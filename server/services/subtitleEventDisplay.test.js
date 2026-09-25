const {
	subtitleHistoryLabel,
	enrichEventRow,
	languageFromPayload,
} = require("./subtitleEventDisplay")

describe("subtitleHistoryLabel", () => {
	test("subtitle_lookup with language", () => {
		expect(
			subtitleHistoryLabel("subtitle_lookup", {
				language: "ru",
				found: true,
			})
		).toBe("Russian subtitle found")
	})

	test("legacy lookup without language defaults to English", () => {
		expect(subtitleHistoryLabel("subtitle_lookup", { found: true })).toBe(
			"English subtitle found"
		)
	})

	test("infers Russian from YIFY URL slug", () => {
		expect(
			languageFromPayload({
				found: true,
				url: "https://yifysubtitles.ch/subtitle/prometheus-russian-yify-123.zip",
			})
		).toBe("ru")
	})

	test("subtitle_found type", () => {
		expect(
			subtitleHistoryLabel("subtitle_found", { language: "en" })
		).toBe("English subtitle found")
	})
})

describe("enrichEventRow", () => {
	test("adds displayLabel for subtitle events", () => {
		const row = enrichEventRow({
			id: 1,
			type: "subtitle_lookup",
			payload: { language: "ru", found: false },
		})
		expect(row.displayLabel).toBe("Russian subtitle missing")
	})
})
