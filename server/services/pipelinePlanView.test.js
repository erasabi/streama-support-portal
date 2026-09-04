const {
	summarizeJob,
	seasonPlanFromEvent,
	jobFetchMode,
	jobRemainingMissing,
} = require("./pipelinePlanView")

describe("pipelinePlanView", () => {
	test("seasonPlanFromEvent maps season_plan payload", () => {
		const plan = seasonPlanFromEvent({
			type: "season_plan",
			createdAt: "2026-01-01T00:00:00.000Z",
			payload: {
				auto: [1, 5],
				pending: [2, 3],
				present: [1],
				complete: [1],
				missing: ["S01E04", "S05E03"],
				libraryStatus: "found",
			},
		})
		expect(plan.autoSeasons).toEqual([1, 5])
		expect(plan.pendingSeasons).toEqual([2, 3])
		expect(plan.plannedMissing).toEqual(["S01E04", "S05E03"])
	})

	test("jobFetchMode prefers magnet, then episodes, then legacy seasons", () => {
		expect(jobFetchMode({ sourceUrl: "magnet:?x", seasons: [1] })).toBe("magnet")
		expect(
			jobFetchMode({
				detail: { missing: ["S02E11"] },
				seasons: [2],
			})
		).toBe("episodes")
		expect(jobFetchMode({ seasons: [2] })).toBe("seasons_legacy")
	})

	test("jobRemainingMissing uses ledger then leftover", () => {
		expect(
			jobRemainingMissing({
				claimStatus: "in_progress",
				detail: { missing: ["S01E01", "S01E02"] },
				ledger: { missing: ["S01E02"] },
			})
		).toEqual(["S01E02"])
		expect(
			jobRemainingMissing({
				claimStatus: "in_progress",
				detail: { leftoverMissing: ["S03E04"] },
			})
		).toEqual(["S03E04"])
		expect(
			jobRemainingMissing({
				claimStatus: "completed",
				detail: { missing: ["S01E01"] },
				ledger: { missing: ["S01E01"] },
			})
		).toEqual([])
	})

	test("summarizeJob exposes planned vs remaining", () => {
		const row = summarizeJob({
			id: "job-1",
			claimStatus: "ready",
			stage: "magnet_ready",
			folderName: "detroiters-2017-tmdb69866",
			sourceUrl: null,
			seasons: null,
			detail: { missing: ["S02E11", "S02E12"] },
			ledger: null,
			claimedBy: null,
			createdAt: new Date("2026-01-01"),
			updatedAt: new Date("2026-01-02"),
		})
		expect(row.fetchMode).toBe("episodes")
		expect(row.plannedMissing).toEqual(["S02E11", "S02E12"])
		expect(row.remainingMissing).toEqual(["S02E11", "S02E12"])
	})
})
