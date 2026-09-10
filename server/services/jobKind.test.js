const { jobKind, isSubtitleAcquireJob, kindSql } = require("./jobKind")

describe("jobKind", () => {
	test("defaults to download when kind is missing", () => {
		expect(jobKind({})).toBe("download")
		expect(jobKind({ detail: { missing: ["S01E01"] } })).toBe("download")
		expect(isSubtitleAcquireJob({ detail: { kind: "download" } })).toBe(false)
	})

	test("recognizes subtitle_acquire", () => {
		expect(jobKind({ detail: { kind: "subtitle_acquire" } })).toBe(
			"subtitle_acquire"
		)
		expect(isSubtitleAcquireJob({ detail: { kind: "subtitle_acquire" } })).toBe(
			true
		)
	})

	test("SQL filter treats null kind as download", () => {
		expect(kindSql("download")).toContain("download")
		expect(kindSql("subtitle_acquire")).toContain("subtitle_acquire")
	})
})
