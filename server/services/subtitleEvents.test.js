const { subtitleEventFromDetail } = require("./subtitleEvents")

describe("subtitleEventFromDetail", () => {
	test("returns null when detail has no subtitle info", () => {
		expect(subtitleEventFromDetail(null)).toBe(null)
		expect(subtitleEventFromDetail({})).toBe(null)
		expect(subtitleEventFromDetail({ progressPct: 40 })).toBe(null)
	})

	test("maps string status", () => {
		expect(subtitleEventFromDetail({ subtitle: "uploaded" })).toEqual({
			type: "subtitle_upload",
			payload: { language: "en", error: null },
		})
		expect(subtitleEventFromDetail({ subtitle: "failed" })).toEqual({
			type: "subtitle_upload_failed",
			payload: { language: "en", error: null },
		})
		expect(subtitleEventFromDetail({ subtitle: "missing" })).toEqual({
			type: "subtitle_missing",
			payload: { language: "en", error: null },
		})
	})

	test("maps object status with language/error", () => {
		expect(
			subtitleEventFromDetail({
				subtitle: { status: "failed", language: "es", error: "404" },
			})
		).toEqual({
			type: "subtitle_upload_failed",
			payload: { language: "es", error: "404" },
		})
	})

	test("maps subtitleUploaded boolean", () => {
		expect(subtitleEventFromDetail({ subtitleUploaded: true }).type).toBe(
			"subtitle_upload"
		)
		expect(subtitleEventFromDetail({ subtitleUploaded: false }).type).toBe(
			"subtitle_upload_failed"
		)
	})
})
