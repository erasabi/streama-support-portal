const { mergePipelineLedger } = require("./pipelineLedger")

describe("mergePipelineLedger", () => {
	test("tolerates missing keys and empty existing", () => {
		expect(mergePipelineLedger(null, {})).toEqual({
			infoHash: null,
			missing: [],
			paths: { download: [], encode: [], upload: [] },
			attempts: { add: 0, leftoverRetry: 0 },
			lastError: null,
		})
	})

	test("sets infoHash from progress or detail", () => {
		const fromTop = mergePipelineLedger(null, { infoHash: "ABC" })
		expect(fromTop.infoHash).toBe("ABC")
		const fromDetail = mergePipelineLedger(fromTop, {
			detail: { infoHash: "DEF" },
		})
		expect(fromDetail.infoHash).toBe("DEF")
		const kept = mergePipelineLedger(fromTop, { detail: { reason: "disk" } })
		expect(kept.infoHash).toBe("ABC")
	})

	test("unions detail.missing and lets leftoverMissing replace remaining work", () => {
		const seeded = mergePipelineLedger(null, {
			detail: { missing: ["S02E11", "S02E12"] },
		})
		expect(seeded.missing).toEqual(["S02E11", "S02E12"])
		const grown = mergePipelineLedger(seeded, {
			detail: { missing: ["S02E13"] },
		})
		expect(grown.missing).toEqual(["S02E11", "S02E12", "S02E13"])
		const leftover = mergePipelineLedger(grown, {
			detail: { leftoverMissing: ["S02E13"] },
		})
		expect(leftover.missing).toEqual(["S02E13"])
		const done = mergePipelineLedger(leftover, {
			detail: { leftoverMissing: [] },
		})
		expect(done.missing).toEqual([])
	})

	test("unions artifact file names into paths and never shrinks", () => {
		const first = mergePipelineLedger(null, {
			artifacts: {
				download: {
					files: [{ name: "Show.S02E11.mkv" }, { name: "Show.S02E11.srt" }],
				},
			},
		})
		expect(first.paths.download).toEqual(["Show.S02E11.mkv", "Show.S02E11.srt"])
		const second = mergePipelineLedger(first, {
			artifacts: {
				download: { files: ["Show.S02E12.mkv"] },
				encode: { files: [{ name: "Show.S02E11.mp4" }], subtitles: ["en_ep.srt"] },
				upload: { files: [] },
			},
		})
		expect(second.paths.download).toEqual([
			"Show.S02E11.mkv",
			"Show.S02E11.srt",
			"Show.S02E12.mkv",
		])
		expect(second.paths.encode).toEqual(["Show.S02E11.mp4", "en_ep.srt"])
		expect(second.paths.upload).toEqual([])
		const errorTick = mergePipelineLedger(second, {
			detail: { error: "disk full" },
		})
		expect(errorTick.paths).toEqual(second.paths)
		expect(errorTick.lastError).toBe("disk full")
	})

	test("merges attempts without shrinking counters", () => {
		const first = mergePipelineLedger(null, {
			detail: { attempts: { add: 1 } },
		})
		expect(first.attempts).toEqual({ add: 1, leftoverRetry: 0 })
		const second = mergePipelineLedger(first, {
			detail: { attempts: { leftoverRetry: 2 } },
		})
		expect(second.attempts).toEqual({ add: 1, leftoverRetry: 2 })
		const lower = mergePipelineLedger(second, {
			detail: { attempts: { leftoverRetry: 1 } },
		})
		expect(lower.attempts.leftoverRetry).toBe(2)
	})

	test("does not clear lastError when a later tick omits error", () => {
		const failed = mergePipelineLedger(null, {
			detail: { error: "utorrent timeout" },
		})
		const later = mergePipelineLedger(failed, {
			detail: { reason: "disk", freeKb: 1 },
		})
		expect(later.lastError).toBe("utorrent timeout")
	})
})
