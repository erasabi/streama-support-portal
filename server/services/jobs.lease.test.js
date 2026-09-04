const {
	shouldFailStalledLease,
	stuckTtlMs,
	STUCK_DOWNLOAD_MS,
	STUCK_ENCODE_MS,
} = require("./jobs.lease")

describe("lease stall TTL", () => {
	test("downloading uses the longer download TTL", () => {
		expect(stuckTtlMs("downloading")).toBe(STUCK_DOWNLOAD_MS)
		expect(stuckTtlMs("encoding")).toBe(STUCK_ENCODE_MS)
	})

	test("does not fail until stalledSince is set", () => {
		expect(shouldFailStalledLease("downloading", null)).toBe(false)
	})

	test("fails downloading after 6h with no heartbeat", () => {
		const stalledSince = "2026-09-04T00:00:00.000Z"
		const now = Date.parse(stalledSince) + STUCK_DOWNLOAD_MS
		expect(shouldFailStalledLease("downloading", stalledSince, now - 1)).toBe(false)
		expect(shouldFailStalledLease("downloading", stalledSince, now)).toBe(true)
	})

	test("fails encoding after 2h with no heartbeat", () => {
		const stalledSince = "2026-09-04T00:00:00.000Z"
		const now = Date.parse(stalledSince) + STUCK_ENCODE_MS
		expect(shouldFailStalledLease("encoding", stalledSince, now - 1)).toBe(false)
		expect(shouldFailStalledLease("encoding", stalledSince, now)).toBe(true)
	})
})
