jest.mock("./remoteAgents", () => ({
	fetchSortifyView: jest.fn(async () => ({ status: "unconfigured", reason: "no agent" })),
	fetchPrelanflixView: jest.fn(async () => ({ status: "unconfigured", reason: "no agent" })),
}))

const { fetchSortifyView } = require("./remoteAgents")
const {
	runDryRun,
	loadDryRunReport,
	listDryRuns,
	forecastEncode,
	forecastSubtitles,
	forecastHighlight,
} = require("./pipelineDryRun")
const { formatDryRunForAgent } = require("./dryRunAgentText")

const HASH = "A".repeat(40)

function enqueuePlan(overrides = {}) {
	return async () => ({
		auto: [1],
		pending: [],
		libraryStatus: "missing",
		libraryUncertain: false,
		streamaMediaId: null,
		present: [],
		complete: [],
		missing: ["S01E01", "S01E02"],
		...overrides,
	})
}

function movieLookup(overrides = {}) {
	return async () => ({
		status: "found",
		imdbId: "tt0133093",
		magnetUrl: `magnet:?xt=urn:btih:${HASH}`,
		magnetHash: HASH,
		magnetQuality: "1080p",
		subtitleUrl: "https://y/en.zip",
		search: {
			outcome: "found",
			pick: { hash: HASH, quality: "1080p" },
			attempts: [
				{ source: "yts", movieTitle: "The Matrix (1999)", resultCount: 2, ok: true },
				{
					source: "yifysubtitles",
					language: "English",
					found: true,
					subtitleUrl: "https://y/en.zip",
					ok: true,
				},
				{ source: "yifysubtitles", language: "Russian", found: false, ok: true },
			],
		},
		...overrides,
	})
}

beforeEach(() => {
	jest.clearAllMocks()
	fetchSortifyView.mockResolvedValue({ status: "unconfigured", reason: "no agent" })
})

function memoryDryRunDb() {
	const rows = new Map()
	let n = 0
	return {
		PipelineDryRun: {
			async create(attrs) {
				const row = {
					id: `dr-${++n}`,
					status: attrs.status,
					payload: attrs.payload || {},
					result: attrs.result || null,
					tmdbId: attrs.tmdbId || null,
					mediaType: attrs.mediaType || null,
					requestId: attrs.requestId || null,
					verdict: attrs.verdict || null,
					createdAt: new Date(),
					updatedAt: new Date(),
					async update(next) {
						Object.assign(row, next, { updatedAt: new Date() })
						return row
					},
				}
				rows.set(row.id, row)
				return row
			},
			async findByPk(id) {
				return rows.get(id) || null
			},
			async findAll({ limit } = {}) {
				return [...rows.values()]
					.sort((a, b) => b.createdAt - a.createdAt)
					.slice(0, limit || 100)
			},
		},
		_rows: rows,
	}
}

describe("runDryRun", () => {
	test("rejects a request with no tmdb id", async () => {
		const report = await runDryRun({ title: "x" })
		expect(report.ok).toBe(false)
	})

	test("states plainly that it wrote nothing", async () => {
		const report = await runDryRun(
			{ tmdbId: "603", title: "The Matrix", mediaType: "movie", year: "1999" },
			{ lookupMovieMagnet: movieLookup() }
		)
		expect(report.sideEffects).toMatch(/^none/)
		expect(report.expectedFolderName).toBe("the-matrix-1999-tmdb603")
	})

	test("a magnet miss is a would_fail verdict with the reason attached", async () => {
		const miss = async () => ({
			status: "not_found",
			imdbId: "tt1",
			search: {
				outcome: "not_found",
				missReason: "YTS mirror returned movie.id === 0 (not in mirror)",
				attempts: [],
			},
		})
		const report = await runDryRun(
			{ tmdbId: "603", title: "Nope", mediaType: "movie" },
			{ lookupMovieMagnet: miss }
		)
		expect(report.verdict).toBe("would_fail")
		const flag = report.flags.find((f) => f.code === "magnet_not_found")
		expect(flag.message).toMatch(/movie\.id === 0/)
	})

	test("a same-title different-film YTS result is flagged", async () => {
		const wrong = movieLookup()
		const report = await runDryRun(
			{ tmdbId: "603", title: "The Furious", mediaType: "movie" },
			{ lookupMovieMagnet: wrong }
		)
		expect(report.flags.map((f) => f.code)).toContain("yts_title_mismatch")
	})

	test("Russian availability upstream is reported without being attached", async () => {
		const withRussian = movieLookup({
			search: {
				outcome: "found",
				pick: { hash: HASH, quality: "1080p" },
				attempts: [
					{ source: "yts", movieTitle: "The Matrix (1999)", resultCount: 1, ok: true },
					{
						source: "yifysubtitles",
						language: "English",
						found: true,
						subtitleUrl: "https://y/en.zip",
						ok: true,
					},
					{
						source: "yifysubtitles",
						language: "Russian",
						found: true,
						subtitleUrl: "https://y/ru.zip",
						ok: true,
					},
				],
			},
		})
		const report = await runDryRun(
			{ tmdbId: "603", title: "The Matrix", mediaType: "movie" },
			{ lookupMovieMagnet: withRussian }
		)
		expect(report.subtitleForecast.wouldAttach.map((a) => a.language)).toEqual(["en"])
		expect(report.flags.map((f) => f.code)).toContain("russian_available_but_not_attached")
	})

	test("a TV request prints the exact piratify command to reproduce on the box", async () => {
		const report = await runDryRun(
			{
				tmdbId: "69866",
				title: "Detroiters",
				mediaType: "tv",
				year: "2017",
				episodes: "S02E11,S02E12",
			},
			{
				runPiratify: async () => ({ status: "unavailable", reason: "stub" }),
				planTvSeasons: enqueuePlan(),
			}
		)
		expect(report.piratify.command).toEqual([
			"piratify",
			"add",
			"--dry-run",
			"--json",
			"-f",
			"detroiters-2017-tmdb69866",
			"--episodes",
			"S02E11,S02E12",
			"--year",
			"2017",
			"Detroiters",
		])
	})

	test("TV subtitles are forecast as none, because TV jobs get no subtitle url", async () => {
		const report = await runDryRun(
			{
				tmdbId: "69866",
				title: "Detroiters",
				mediaType: "tv",
			},
			{ runPiratify: async () => ({ status: "unavailable", reason: "stub" }), planTvSeasons: enqueuePlan() }
		)
		expect(report.subtitleForecast.wouldAttach).toEqual([])
		expect(report.flags.map((f) => f.code)).toContain("no_subtitles_would_be_attached")
	})

	test("a Streama apiId that differs from the folder tmdb id is a would_fail", async () => {
		fetchSortifyView.mockResolvedValue({
			status: "ok",
			data: { match: { apiId: "99999", title: "Some Other Film" }, highlights: [] },
		})
		const report = await runDryRun(
			{ tmdbId: "603", title: "The Matrix", mediaType: "movie" },
			{ lookupMovieMagnet: movieLookup() }
		)
		expect(report.streamaMatch.matches).toBe(false)
		expect(report.verdict).toBe("would_fail")
		expect(report.flags.map((f) => f.code)).toContain("streama_identity_mismatch")
	})

	test("an unreachable Sortify agent is unverified, never a silent pass", async () => {
		const report = await runDryRun(
			{ tmdbId: "603", title: "The Matrix", mediaType: "movie" },
			{ lookupMovieMagnet: movieLookup() }
		)
		expect(report.streamaMatch.matches).toBeNull()
		expect(report.flags.map((f) => f.code)).toContain("streama_match_unverified")
		expect(report.streamaMatch.reason).not.toMatch(/SORTIFY_AGENT_URL/)
	})

	test("a Streama library miss is an answer, not streama_match_unverified", async () => {
		const report = await runDryRun(
			{ tmdbId: "603", title: "The Matrix", mediaType: "movie" },
			{
				lookupMovieMagnet: movieLookup(),
				lookupLibraryMovie: async () => ({ status: "missing", streamaId: null }),
			}
		)
		expect(report.streamaMatch.libraryCheck.status).toBe("missing")
		expect(report.flags.map((f) => f.code)).not.toContain("streama_match_unverified")
		expect(report.highlightForecast.outcome).toBe("new_highlight")
	})

	test("TV dry-run when Prelanflix has not finished yet is pending, not a failed lookup", async () => {
		const report = await runDryRun(
			{
				tmdbId: "387",
				title: "SpongeBob SquarePants",
				mediaType: "tv",
				year: "1999",
			},
			{
				runPiratify: async () => ({
					status: "pending",
					reason: "Waiting on Prelanflix. portal-worker claims dry-runs on the next tick.",
				}),
				planTvSeasons: enqueuePlan(),
			}
		)
		expect(report.ok).toBe(true)
		expect(report.piratify.status).toBe("pending")
		expect(report.verdict).not.toBe("would_fail")
		expect(report.flags.map((f) => f.code)).toContain("waiting_on_prelanflix")
		expect(report.flags.map((f) => f.code)).not.toContain("tv_no_torrents_selected")
	})

	test("a successful piratify resolve is a real source, not a skip", async () => {
		const runPiratify = jest.fn(async () => ({
			status: "ok",
			selected: [
				{
					name: "SpongeBob.S01.1080p.WEBRip",
					quality: 1080,
					seeders: 50,
					kind: "pack",
				},
			],
			missing: [],
			searchQueries: [{ query: "spongebob squarepants 1999", result_count: 12 }],
			winningQueries: ["spongebob squarepants 1999"],
		}))
		const report = await runDryRun(
			{
				tmdbId: "387",
				title: "SpongeBob SquarePants",
				mediaType: "tv",
				year: "1999",
			},
			{
				runPiratify,
				planTvSeasons: enqueuePlan({ missing: ["S01E03", "S01E04"], auto: [1] }),
			}
		)
		expect(runPiratify.mock.calls[0][0].episodes).toEqual(["S01E03", "S01E04"])
		expect(report.fetchPlan.missingEpisodes).toEqual(["S01E03", "S01E04"])
		expect(report.fetchPlan.workerCommand).toContain("--episodes")
		expect(report.fetchPlan.workerCommand.join(" ")).toMatch(/S01E03,S01E04/)
		expect(report.piratify.status).toBe("ok")
		expect(report.encodeForecast.torrentName).toBe("SpongeBob.S01.1080p.WEBRip")
		expect(report.flags.map((f) => f.code)).not.toContain("piratify_not_reachable")
		expect(report.flags.map((f) => f.code)).not.toContain("tv_no_torrents_selected")
	})

	test("when Streama already has the show complete, piratify is not asked to search", async () => {
		const runPiratify = jest.fn()
		const report = await runDryRun(
			{
				tmdbId: "387",
				title: "SpongeBob SquarePants",
				mediaType: "tv",
				year: "1999",
			},
			{
				runPiratify,
				planTvSeasons: enqueuePlan({
					auto: [],
					pending: [],
					libraryStatus: "found",
					present: [1, 2],
					complete: [1, 2],
					missing: [],
				}),
			}
		)
		expect(runPiratify).not.toHaveBeenCalled()
		expect(report.piratify.status).toBe("skipped")
		expect(report.fetchPlan.wouldEnqueueJob).toBe(false)
		expect(report.flags.map((f) => f.code)).toContain("nothing_to_fetch")
	})

	test("middle-season gaps wait on approval and are listed separately from auto-queue", async () => {
		const runPiratify = jest.fn(async () => ({ status: "ok", selected: [{ name: "S03" }], missing: [] }))
		const report = await runDryRun(
			{ tmdbId: "1", title: "Show", mediaType: "tv", year: "2010" },
			{
				runPiratify,
				planTvSeasons: enqueuePlan({
					auto: [3],
					pending: [2],
					libraryStatus: "found",
					present: [1],
					complete: [1],
					missing: ["S03E01"],
				}),
			}
		)
		expect(report.fetchPlan.autoSeasons).toEqual([3])
		expect(report.fetchPlan.pendingSeasons).toEqual([2])
		expect(report.fetchPlan.presentSeasons).toEqual([1])
		expect(runPiratify.mock.calls[0][0].episodes).toEqual(["S03E01"])
	})

	test("movie dry-runs are stored even without a piratify ticket", async () => {
		const db = memoryDryRunDb()
		const report = await runDryRun(
			{ tmdbId: "603", title: "The Matrix", mediaType: "movie", year: "1999", requestId: "603" },
			{ lookupMovieMagnet: movieLookup(), db }
		)
		expect(report.ticketId).toBeTruthy()
		expect(report.agentText).toMatch(/# Pipeline dry-run/)
		expect(report.agentText).toMatch(/the-matrix-1999-tmdb603/)
		const row = db._rows.get(report.ticketId)
		expect(row.status).toBe("stored")
		expect(row.tmdbId).toBe("603")
		expect(row.requestId).toBe("603")
		expect(row.payload.report.verdict).toBe(report.verdict)
		expect(row.payload.report.agentText).toBeUndefined()
		const listed = await listDryRuns({ tmdbId: "603" }, { db })
		expect(listed.map((r) => r.id)).toContain(report.ticketId)
		const loaded = await loadDryRunReport(report.ticketId, { db })
		expect(loaded.verdict).toBe(report.verdict)
		expect(loaded.piratify).toBeFalsy()
		expect(loaded.agentText).toMatch(/Verdict|verdict/i)
	})

	test("a completed piratify hop is written back onto the ticket", async () => {
		const db = memoryDryRunDb()
		const row = await db.PipelineDryRun.create({
			status: "done",
			tmdbId: "387",
			mediaType: "tv",
			payload: {
				folderName: "spongebob-squarepants-1999-tmdb387",
				title: "SpongeBob SquarePants",
				year: "1999",
				episodes: ["S01E01"],
				tmdbId: "387",
				report: {
					ok: true,
					schema: "pipeline-dry-run/1",
					input: { tmdbId: "387", title: "SpongeBob SquarePants", mediaType: "tv", year: "1999" },
					expectedFolderName: "spongebob-squarepants-1999-tmdb387",
					verdict: "would_proceed_with_warnings",
					flags: [],
					piratify: { status: "pending", ticketId: "dr-1" },
				},
			},
			result: {
				selected: [{ name: "SpongeBob.S01.1080p.WEBRip", quality: 1080, seeders: 50 }],
				missing: [],
				searchQueries: [{ query: "spongebob squarepants 1999", result_count: 12 }],
			},
		})
		const loaded = await loadDryRunReport(row.id, { db })
		expect(loaded.piratify.status).toBe("ok")
		expect(loaded.piratify.selected[0].name).toMatch(/SpongeBob/)
		expect(db._rows.get(row.id).payload.report.piratify.status).toBe("ok")
		expect(db._rows.get(row.id).verdict).toBe(loaded.verdict)
	})
})

describe("formatDryRunForAgent", () => {
	test("pastes a briefing plus JSON a debug agent can use as context", () => {
		const text = formatDryRunForAgent({
			ok: true,
			schema: "pipeline-dry-run/1",
			generatedAt: "2026-09-10T05:00:00.000Z",
			verdict: "would_fail",
			expectedFolderName: "nope-tmdb1",
			input: { tmdbId: "1", title: "Nope", mediaType: "movie", year: "2022" },
			magnetSearch: { status: "not_found", search: { missReason: "YTS miss" } },
			flags: [{ severity: "error", code: "magnet_not_found", message: "No source found" }],
		})
		expect(text).toMatch(/^# Pipeline dry-run/)
		expect(text).toMatch(/Would fail/)
		expect(text).toMatch(/Nope \(2022\)/)
		expect(text).toMatch(/error `magnet_not_found`/)
		expect(text).toMatch(/```json/)
		expect(text).toMatch(/"schema": "pipeline-dry-run\/1"/)
		expect(text).not.toMatch(/"agentText"/)
	})
})

describe("forecastHighlight", () => {
	test("no existing highlight means a clean new row", () => {
		const out = forecastHighlight(
			{ status: "ok", highlights: [] },
			{ mediaType: "movie" }
		)
		expect(out.outcome).toBe("new_highlight")
	})

	// A new episode has a different videoToPlay, so Streama's 409 never fires.
	test("an existing highlight on a show predicts a duplicate, not a 409", () => {
		const out = forecastHighlight(
			{ status: "ok", highlights: [{ id: 1 }] },
			{ mediaType: "tv" }
		)
		expect(out.outcome).toBe("likely_duplicate")
	})

	test("an existing highlight on a movie predicts a 409", () => {
		const out = forecastHighlight(
			{ status: "ok", highlights: [{ id: 1 }] },
			{ mediaType: "movie" }
		)
		expect(out.outcome).toBe("likely_409_treated_as_success")
	})
})

describe("forecastEncode", () => {
	test("a Blu-ray remux is predicted to carry skippable bitmap subs", () => {
		const out = forecastEncode("Show.S01E01.1080p.BluRay.REMUX.x264-GRP")
		expect(
			out.expectedSubtitleSources.some((s) => String(s.confidence).includes("SKIPPED"))
		).toBe(true)
	})

	test("a YTS release is predicted to ship a sidecar srt", () => {
		const out = forecastEncode("The Matrix (1999) [1080p] [YTS.MX]")
		expect(out.expectedSubtitleSources.some((s) => /sidecar/.test(s.source))).toBe(true)
	})

	test("English-sounding releases are not predicted to hardsub", () => {
		expect(forecastEncode("Show.S01E01.1080p.WEB-DL").hardsubLikely).toBe(false)
		expect(forecastEncode("Anime.S01E01.1080p.JPN.Dual.Audio").hardsubLikely).toBe(true)
	})

	test("no source selected forecasts nothing rather than guessing", () => {
		expect(forecastEncode(null).confidence).toBe("none")
	})
})

describe("forecastSubtitles", () => {
	test("a movie with an English index entry attaches English only", () => {
		const out = forecastSubtitles({
			mediaType: "movie",
			magnetFound: true,
			search: {
				attempts: [
					{ source: "yifysubtitles", language: "English", found: true, subtitleUrl: "u" },
				],
			},
		})
		expect(out.wouldAttach).toHaveLength(1)
		expect(out.wouldNotAttach.map((r) => r.language)).toContain("ru")
	})
})
