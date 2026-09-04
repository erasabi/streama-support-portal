const { buildFolderName, mergeMagnetUrls, isSameSource } = require("./requestPipeline")

describe("buildFolderName", () => {
	const request = { id: "603", title: "The Matrix", releaseDate: "1999-03-31" }

	test("builds the tmdb folder contract", () => {
		expect(buildFolderName(request)).toBe("the-matrix-1999-tmdb603")
	})

	test("adds a short info-hash suffix so multi-source folders stay distinct", () => {
		const a = buildFolderName(request, "ABCDEF0123456789ABCDEF0123456789ABCDEF01")
		const b = buildFolderName(request, "1111111122222222333333334444444455555555")
		expect(a).toBe("the-matrix-1999-tmdb603-abcdef01")
		expect(b).toBe("the-matrix-1999-tmdb603-11111111")
		expect(a).not.toBe(b)
	})
})

describe("mergeMagnetUrls", () => {
	test("appends new urls and de-duplicates while preserving order", () => {
		expect(mergeMagnetUrls(["a"], "b")).toEqual(["a", "b"])
		expect(mergeMagnetUrls(["a", "b"], "a")).toEqual(["a", "b"])
		expect(mergeMagnetUrls(null, "a")).toEqual(["a"])
		expect(mergeMagnetUrls(["a"], null)).toEqual(["a"])
	})
})

describe("isSameSource", () => {
	test("matches by infoHash when present, otherwise by URL", () => {
		expect(
			isSameSource(
				{ infoHash: "ABC", sourceUrl: "magnet:?xt=urn:btih:abc" },
				"other",
				"ABC"
			)
		).toBe(true)
		expect(
			isSameSource({ infoHash: null, sourceUrl: "http://a" }, "http://a", null)
		).toBe(true)
		expect(
			isSameSource({ infoHash: "ABC", sourceUrl: "http://a" }, "http://b", "ZZZ")
		).toBe(false)
	})

	test("TV jobs without a URL match on seasons", () => {
		expect(
			isSameSource({ sourceUrl: null, seasons: [1] }, null, null, [1])
		).toBe(true)
		expect(
			isSameSource({ sourceUrl: null, seasons: [1] }, null, null, [2, 3])
		).toBe(false)
	})

	test("TV jobs with missing[] match on identical codes, not seasons alone", () => {
		const job = {
			sourceUrl: null,
			seasons: [1],
			detail: { missing: ["S01E04"] },
		}
		expect(isSameSource(job, null, null, [1], ["S01E04"])).toBe(true)
		expect(isSameSource(job, null, null, [1, 5], ["S01E04"])).toBe(true)
		expect(
			isSameSource(job, null, null, [1, 5], ["S01E04", "S05E01"])
		).toBe(false)
	})

	test("a later missing[] that is a subset of an in-flight job is a duplicate", () => {
		const job = {
			sourceUrl: null,
			seasons: [1, 5],
			detail: { missing: ["S01E04", "S05E01"] },
		}
		expect(isSameSource(job, null, null, [1], ["S01E04"])).toBe(true)
	})
})
