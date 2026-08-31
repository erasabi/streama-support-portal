const { normalizeRequestId, canonicalTmdbId, isNamespacedRequestId } = require("./requestId")

describe("canonicalTmdbId", () => {
	test("returns plain TMDB ids unchanged", () => {
		expect(canonicalTmdbId("85552")).toBe("85552")
		expect(canonicalTmdbId(85552)).toBe("85552")
	})

	test("extracts TMDB id from update/issue rows", () => {
		expect(canonicalTmdbId("update:85552:1787812595606")).toBe("85552")
		expect(canonicalTmdbId("issue:1396:1")).toBe("1396")
	})
})

describe("isNamespacedRequestId", () => {
	test("detects update/issue prefixes", () => {
		expect(isNamespacedRequestId("update:85552:1")).toBe(true)
		expect(isNamespacedRequestId("issue:85552:1")).toBe(true)
		expect(isNamespacedRequestId("85552")).toBe(false)
		expect(normalizeRequestId("85552")).toBe("85552")
	})
})
