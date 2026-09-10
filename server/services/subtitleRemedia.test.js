const {
	isSubtitleRemediaMessage,
	subtitleRemediaLabel,
	isSubtitleRemediaRequest,
	tmdbIdFromRequest,
	LABEL_ADD,
	LABEL_FIX,
} = require("./subtitleRemedia")

describe("subtitle remedia messages", () => {
	test("matches Add Subtitles and the legacy typo", () => {
		expect(isSubtitleRemediaMessage("Add Subtitles")).toBe(true)
		expect(isSubtitleRemediaMessage("Add Subitles")).toBe(true)
		expect(subtitleRemediaLabel("Add Subitles")).toBe(LABEL_ADD)
	})

	test("matches Fix Subtitles", () => {
		expect(isSubtitleRemediaMessage("Fix Subtitles")).toBe(true)
		expect(subtitleRemediaLabel("Fix Subtitles")).toBe(LABEL_FIX)
	})

	test("ignores Fetch New Seasons and other tickets", () => {
		expect(isSubtitleRemediaMessage("Fetch New Seasons")).toBe(false)
		expect(isSubtitleRemediaMessage("Video Not Working")).toBe(false)
		expect(subtitleRemediaLabel("Fetch New Seasons")).toBe(null)
	})

	test("reads TMDB id from namespaced tickets", () => {
		expect(tmdbIdFromRequest({ id: "update:85552:1" })).toBe("85552")
		expect(tmdbIdFromRequest({ id: "issue:1396:9" })).toBe("1396")
		expect(tmdbIdFromRequest({ id: "85552" })).toBe("85552")
		expect(tmdbIdFromRequest({ id: "update:nope:1" })).toBe(null)
	})

	test("recognizes remedia request rows", () => {
		expect(
			isSubtitleRemediaRequest({
				id: "update:1:1",
				queueStatus: LABEL_ADD,
			})
		).toBe(true)
		expect(
			isSubtitleRemediaRequest({
				id: "603",
				queueStatus: null,
				queueMessage: null,
			})
		).toBe(false)
	})
})
