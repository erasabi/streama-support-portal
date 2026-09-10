const {
	subtitleEventFromDetail,
	subtitleEventsFromAcquire,
	subtitleEventsFromDetail,
} = require("./subtitleEvents")

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

describe("subtitleEventsFromAcquire", () => {
	test("emits one timeline row per language", () => {
		expect(
			subtitleEventsFromAcquire({
				subtitleAcquire: {
					video: "detroiters.s01e01.mp4",
					tmdbId: "69866",
					trigger: "manual",
					languages: {
						en: { needed: true, status: "kept", source: "opensubtitlescom" },
						ru: {
							needed: true,
							status: "rejected",
							reason: "offset_out_of_range",
						},
					},
				},
			})
		).toEqual([
			{
				type: "subtitle_upload",
				payload: {
					language: "en",
					status: "kept",
					error: null,
					trigger: "manual",
					video: "detroiters.s01e01.mp4",
				},
			},
			{
				type: "subtitle_upload_failed",
				payload: {
					language: "ru",
					status: "rejected",
					error: "offset_out_of_range",
					trigger: "manual",
					video: "detroiters.s01e01.mp4",
				},
			},
		])
	})

	test("maps not_found and already_present", () => {
		const events = subtitleEventsFromAcquire({
			subtitleAcquire: {
				languages: {
					en: { status: "already_present" },
					ru: { status: "not_found" },
				},
			},
		})
		expect(events.map((e) => e.type)).toEqual([
			"subtitle_upload",
			"subtitle_missing",
		])
	})

	test("prefers acquire rows when both shapes are present", () => {
		const events = subtitleEventsFromDetail({
			subtitle: "uploaded",
			subtitleAcquire: {
				languages: { ru: { status: "error", reason: "attach_failed" } },
			},
		})
		expect(events).toEqual([
			{
				type: "subtitle_upload_failed",
				payload: {
					language: "ru",
					status: "error",
					error: "attach_failed",
					trigger: null,
					video: null,
				},
			},
		])
	})
})
