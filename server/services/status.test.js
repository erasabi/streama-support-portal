const status = require("./status")
const { classifySourceMiss, isReleaseDateInFuture, isUnreleasedFromDates } = require("./availability")

describe("status.shouldAdvance", () => {
	test("advances forward through the pipeline", () => {
		expect(status.shouldAdvance("requested", "downloading")).toBe(true)
		expect(status.shouldAdvance("magnet_ready", "encoding")).toBe(true)
		expect(status.shouldAdvance("not_yet_available", "needs_manual_check")).toBe(
			true
		)
	})

	test("does not regress to an earlier stage", () => {
		expect(status.shouldAdvance("pending_approval", "downloading")).toBe(false)
		expect(status.shouldAdvance("encoding", "claimed")).toBe(false)
	})

	test("source-miss labels can switch either way (unreleased vs released)", () => {
		expect(status.shouldAdvance("not_yet_available", "needs_manual_check")).toBe(
			true
		)
		expect(status.shouldAdvance("needs_manual_check", "not_yet_available")).toBe(
			true
		)
	})

	test("always allows moving to failed and recovering from it", () => {
		expect(status.shouldAdvance("downloading", "failed")).toBe(true)
		expect(status.shouldAdvance("failed", "downloading")).toBe(true)
		expect(status.shouldAdvance("failed", "needs_manual_check")).toBe(true)
	})

	test("always allows paused (capacity) and recovery to claimed/downloading/magnet_ready", () => {
		expect(status.shouldAdvance("magnet_ready", "paused")).toBe(true)
		expect(status.shouldAdvance("downloading", "paused")).toBe(true)
		expect(status.shouldAdvance("paused", "paused")).toBe(true)
		expect(status.shouldAdvance("paused", "claimed")).toBe(true)
		expect(status.shouldAdvance("paused", "downloading")).toBe(true)
		expect(status.shouldAdvance("paused", "magnet_ready")).toBe(true)
		expect(status.shouldAdvance("available", "paused")).toBe(true)
		expect(status.shouldAdvance("paused", "available")).toBe(false)
	})

	test("same stage is idempotent (allowed, e.g. progress updates)", () => {
		expect(status.shouldAdvance("downloading", "downloading")).toBe(true)
	})

	test("encoding does not regress Available via shouldAdvance alone", () => {
		expect(status.shouldAdvance("available", "encoding")).toBe(false)
	})

	test("acquiring_subtitles sits between sorting and registering", () => {
		expect(status.stageIndex("acquiring_subtitles")).toBeGreaterThan(
			status.stageIndex("sorting")
		)
		expect(status.stageIndex("registering")).toBeGreaterThan(
			status.stageIndex("acquiring_subtitles")
		)
		expect(status.shouldAdvance("sorting", "acquiring_subtitles")).toBe(true)
		expect(status.shouldAdvance("acquiring_subtitles", "registering")).toBe(true)
	})

	test("remedia acquiring_subtitles does not rewind Available", () => {
		expect(status.shouldAdvance("available", "acquiring_subtitles")).toBe(false)
		expect(status.shouldApplyDerivedStage("available", "acquiring_subtitles")).toBe(
			false
		)
	})
})

describe("status.shouldApplyDerivedStage", () => {
	test("still advances forward", () => {
		expect(status.shouldApplyDerivedStage("encoding", "uploaded")).toBe(true)
	})

	test("rentify in-flight recovers from a premature sortify Available", () => {
		expect(status.shouldApplyDerivedStage("available", "encoding")).toBe(true)
		expect(status.shouldApplyDerivedStage("uploaded", "downloading")).toBe(true)
		expect(status.shouldApplyDerivedStage("registering", "syncing")).toBe(true)
		expect(status.shouldApplyDerivedStage("available", "magnet_ready")).toBe(true)
	})

	test("paused recovers to claimed/downloading/magnet_ready", () => {
		expect(status.shouldApplyDerivedStage("paused", "claimed")).toBe(true)
		expect(status.shouldApplyDerivedStage("paused", "downloading")).toBe(true)
		expect(status.shouldApplyDerivedStage("paused", "magnet_ready")).toBe(true)
	})

	test("does not otherwise regress", () => {
		expect(status.shouldApplyDerivedStage("encoding", "claimed")).toBe(false)
	})
})

describe("status.displayStatus", () => {
	test("admin override wins over derived stage", () => {
		const req = {
			queueStatusSource: "admin",
			queueStatus: "Unavailable",
			pipelineStage: "downloading",
		}
		expect(status.displayStatus(req)).toBe("Unavailable")
	})

	test("derived stage maps to a user-facing label", () => {
		expect(
			status.displayStatus({ queueStatusSource: "derived", pipelineStage: "downloading" })
		).toBe("Downloading")
		expect(
			status.displayStatus({
				queueStatusSource: "derived",
				pipelineStage: "acquiring_subtitles",
			})
		).toBe("Subtitles")
	})

	test("pending_approval is treated as adding to library (approval automated)", () => {
		expect(
			status.displayStatus({
				queueStatusSource: "derived",
				pipelineStage: "pending_approval",
			})
		).toBe("Adding to library")
	})

	test("archived wins over admin override and pipeline stage", () => {
		expect(
			status.displayStatus({
				archivedAt: new Date(),
				queueStatusSource: "admin",
				queueStatus: "Unavailable",
				pipelineStage: "downloading",
			})
		).toBe("Archived")
	})

	test("failed surfaces even without an admin label", () => {
		expect(
			status.displayStatus({ queueStatusSource: "derived", pipelineStage: "failed" })
		).toBe("Failed")
	})

	test("paused shows Paused (capacity)", () => {
		expect(status.STAGE_LABELS.paused).toBe("Paused")
		expect(
			status.displayStatus({ queueStatusSource: "derived", pipelineStage: "paused" })
		).toBe("Paused")
	})

	test("unreleased source miss shows Not Yet Available", () => {
		const detail = {
			detail: {
				error:
					"Upcoming Show: 0 torrent(s) selected; missing S01E01",
			},
		}
		expect(
			status.displayStatus({
				queueStatusSource: "derived",
				pipelineStage: "not_yet_available",
				pipelineStageDetail: detail,
				releaseDate: "2099-01-01",
			})
		).toBe("Not Yet Available")
		expect(
			status.displayStatus({
				queueStatusSource: "derived",
				pipelineStage: "failed",
				pipelineStageDetail: detail,
				releaseDate: "2099-01-01",
			})
		).toBe("Not Yet Available")
	})

	test("released source miss shows Check Manually", () => {
		const detail = {
			detail: {
				error:
					"Let's Marry Harry: 0 torrent(s) selected; missing S01E01, S01E02",
			},
		}
		expect(
			status.displayStatus({
				queueStatusSource: "derived",
				pipelineStage: "needs_manual_check",
				mediaType: "tv",
				pipelineStageDetail: detail,
				releaseDate: "2026-08-05",
			})
		).toBe("Check Manually")
		expect(
			status.displayStatus({
				queueStatusSource: "derived",
				pipelineStage: "failed",
				mediaType: "tv",
				pipelineStageDetail: detail,
				releaseDate: "2026-08-05",
			})
		).toBe("Check Manually")
		expect(
			status.displayStatus({
				queueStatusSource: "derived",
				pipelineStage: "failed",
				pipelineStageDetail: {
					detail: { error: "No torrents were added." },
				},
			})
		).toBe("Check Manually")
	})

	test("future premiere stored as Check Manually still displays Not Yet Available", () => {
		expect(
			status.displayStatus({
				queueStatusSource: "derived",
				pipelineStage: "needs_manual_check",
				mediaType: "movie",
				releaseDate: "2099-01-01",
			})
		).toBe("Not Yet Available")
	})

	test("movie still in the theatrical window displays Not Yet Available", () => {
		const now = new Date("2026-08-31T12:00:00Z")
		expect(
			status.displayStatus(
				{
					queueStatusSource: "derived",
					pipelineStage: "needs_manual_check",
					mediaType: "movie",
					releaseDate: "2026-07-15",
				},
				now
			)
		).toBe("Not Yet Available")
	})

	test("movie past the theatrical window stays Check Manually", () => {
		const now = new Date("2026-08-31T12:00:00Z")
		expect(
			status.displayStatus(
				{
					queueStatusSource: "derived",
					pipelineStage: "needs_manual_check",
					mediaType: "movie",
					releaseDate: "2026-01-01",
				},
				now
			)
		).toBe("Check Manually")
	})

	test("TV that already premiered stays Check Manually", () => {
		const now = new Date("2026-08-31T12:00:00Z")
		expect(
			status.displayStatus(
				{
					queueStatusSource: "derived",
					pipelineStage: "needs_manual_check",
					mediaType: "tv",
					releaseDate: "2026-07-15",
				},
				now
			)
		).toBe("Check Manually")
	})

	test("falls back to queueStatus for legacy/update rows", () => {
		expect(
			status.displayStatus({ queueStatusSource: "admin", queueStatus: "Request Update" })
		).toBe("Request Update")
	})

	test("pending gap seasons show Approve Seasons unless the pipeline is active", () => {
		expect(
			status.displayStatus({
				queueStatusSource: "derived",
				pipelineStage: "available",
				pendingSeasons: [2, 3, 4],
			})
		).toBe("Approve Seasons")
		expect(
			status.displayStatus({
				queueStatusSource: "derived",
				pipelineStage: "season_approval",
				pendingSeasons: [2],
			})
		).toBe("Approve Seasons")
		expect(
			status.displayStatus({
				queueStatusSource: "derived",
				pipelineStage: "downloading",
				pendingSeasons: [2, 3],
			})
		).toBe("Downloading")
	})
})

describe("availability.classifySourceMiss", () => {
	const now = new Date("2026-08-30T12:00:00Z")

	test("TV with future premiere is not yet available", async () => {
		expect(
			await classifySourceMiss(
				{ mediaType: "tv", releaseDate: "2026-12-01" },
				{ now }
			)
		).toBe("not_yet_available")
	})

	test("TV with aired premiere needs a manual check", async () => {
		expect(
			await classifySourceMiss(
				{ mediaType: "tv", releaseDate: "2026-08-05" },
				{ now }
			)
		).toBe("needs_manual_check")
	})

	test("movie still in theatrical window is not yet available", async () => {
		expect(
			await classifySourceMiss(
				{ mediaType: "movie", id: "1", releaseDate: "2026-08-01" },
				{
					now,
					movieReleaseDates: [
						{ type: 3, release_date: "2026-08-01T00:00:00.000Z" },
					],
				}
			)
		).toBe("not_yet_available")
	})

	test("movie with past digital release needs a manual check", async () => {
		expect(
			await classifySourceMiss(
				{ mediaType: "movie", id: "1", releaseDate: "2026-01-01" },
				{
					now,
					movieReleaseDates: [
						{ type: 3, release_date: "2026-01-01T00:00:00.000Z" },
						{ type: 4, release_date: "2026-04-01T00:00:00.000Z" },
					],
				}
			)
		).toBe("needs_manual_check")
	})

	test("movie not yet in theaters is not yet available", async () => {
		expect(
			await classifySourceMiss(
				{ mediaType: "movie", id: "1", releaseDate: "2026-12-25" },
				{
					now,
					movieReleaseDates: [
						{ type: 3, release_date: "2026-12-25T00:00:00.000Z" },
					],
				}
			)
		).toBe("not_yet_available")
	})

	test("future theatrical date beats a stale digital date", () => {
		expect(
			isUnreleasedFromDates(
				[
					{ type: 4, release_date: "2024-01-01T00:00:00.000Z" },
					{ type: 3, release_date: "2027-06-17T00:00:00.000Z" },
				],
				now
			)
		).toBe(true)
	})

	test("isReleaseDateInFuture is false for missing dates", () => {
		expect(isReleaseDateInFuture(null, now)).toBe(false)
		expect(isReleaseDateInFuture("2026-08-05", now)).toBe(false)
		expect(isReleaseDateInFuture("2026-12-01", now)).toBe(true)
	})
})
