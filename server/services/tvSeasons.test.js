const {
	isTvMedia,
	isFetchNewSeasons,
	isTvSeasonFetch,
	normalizeSeasons,
	seasonsKey,
	bookendSeasons,
	classifySeasonPlan,
	airedSeasonNumbersFromEpisodes,
	librarySeasonsFromShow,
	libraryEpisodeCodesFromShow,
	completeSeasonsFromAired,
	missingEpisodeCodes,
	resolveTvSeasons,
	planTvSeasons,
} = require("./tvSeasons")

describe("normalizeSeasons / seasonsKey", () => {
	test("unique sorted positive ints", () => {
		expect(normalizeSeasons([3, 1, 1, 2])).toEqual([1, 2, 3])
		expect(normalizeSeasons([])).toBeNull()
		expect(seasonsKey([2, 1])).toBe("1,2")
	})
	test("isTvMedia", () => {
		expect(isTvMedia("tv")).toBe(true)
		expect(isTvMedia("tvShow")).toBe(true)
		expect(isTvMedia("movie")).toBe(false)
	})
	test("isTvSeasonFetch is only Fetch New Seasons on TV", () => {
		expect(isFetchNewSeasons("Fetch New Seasons")).toBe(true)
		expect(isTvSeasonFetch("tv", "Fetch New Seasons")).toBe(true)
		expect(isTvSeasonFetch("tv", "Video Not Working")).toBe(false)
		expect(isTvSeasonFetch("movie", "Fetch New Seasons")).toBe(false)
	})
})

describe("airedSeasonNumbersFromEpisodes", () => {
	const now = new Date("2026-08-25T00:00:00Z")
	test("skips specials and future air dates", () => {
		expect(
			airedSeasonNumbersFromEpisodes(
				[
					{ season: 0, airstamp: "2020-01-01T00:00:00Z" },
					{ season: 1, airstamp: "2020-01-01T00:00:00Z" },
					{ season: 2, airstamp: "2020-06-01T00:00:00Z" },
					{ season: 3, airstamp: "2027-01-01T00:00:00Z" },
				],
				now
			)
		).toEqual([1, 2])
	})
})

describe("librarySeasonsFromShow", () => {
	test("Streama file-id stub counts as a video", () => {
		expect(
			librarySeasonsFromShow({
				episodes: [
					{ season_number: 1, files: [{ id: 28355 }] },
					{ season_number: 2, deleted: true, files: [{ id: 28579 }] },
				],
			})
		).toEqual([1])
	})

	test("only seasons that have a video file", () => {
		expect(
			librarySeasonsFromShow({
				episodes: [
					{
						season_number: 1,
						files: [{ originalFilename: "s01e01.mkv", contentType: "video/x-matroska" }],
					},
					{ season_number: 2, files: [] },
					{
						season_number: 2,
						files: [{ originalFilename: "note.srt", contentType: "application/x-subrip" }],
					},
				],
			})
		).toEqual([1])
	})

	test("one episode does not mark the season complete", () => {
		const aired = [
			{ season: 1, number: 1 },
			{ season: 1, number: 2 },
			{ season: 2, number: 1 },
		]
		const show = {
			episodes: [
				{
					season_number: 1,
					episode_number: 1,
					files: [{ originalFilename: "s01e01.mkv", contentType: "video/x-matroska" }],
				},
				{
					season_number: 2,
					episodeNumber: 1,
					files: [{ originalFilename: "s02e01.mkv", contentType: "video/mp4" }],
				},
			],
		}
		expect(completeSeasonsFromAired(aired, libraryEpisodeCodesFromShow(show))).toEqual([
			2,
		])
	})
})

describe("resolveTvSeasons", () => {
	function jsonRes(body, ok = true) {
		return {
			ok,
			json: async () => body,
			text: async () => JSON.stringify(body),
			headers: { getSetCookie: () => [], get: () => null },
		}
	}

	test("new show (not in Streama) is first + latest, not in-between", async () => {
		const fetchImpl = async (url) => {
			if (String(url).startsWith("https://api.tvmaze.com/lookup")) {
				return jsonRes({ id: 99 })
			}
			if (String(url).includes("/episodes")) {
				return jsonRes([
					{ season: 1, airstamp: "2020-01-01T00:00:00Z" },
					{ season: 2, airstamp: "2021-01-01T00:00:00Z" },
					{ season: 3, airstamp: "2022-01-01T00:00:00Z" },
					{ season: 4, airstamp: "2023-01-01T00:00:00Z" },
				])
			}
			throw new Error(`unexpected ${url}`)
		}
		const seasons = await resolveTvSeasons(
			{ id: "603", title: "Widows Bay", mediaType: "tv" },
			{
				fetchImpl,
				libraryLookup: { status: "missing" },
				streamaConfig: { baseUrl: "", username: "", password: "" },
			}
		)
		expect(seasons).toEqual([1, 4])
	})

	test("new single-season show is season 1 only", async () => {
		const fetchImpl = async (url) => {
			if (String(url).startsWith("https://api.tvmaze.com/lookup")) {
				return jsonRes({ id: 99 })
			}
			if (String(url).includes("/episodes")) {
				return jsonRes([{ season: 1, airstamp: "2020-01-01T00:00:00Z" }])
			}
			throw new Error(`unexpected ${url}`)
		}
		const seasons = await resolveTvSeasons(
			{ id: "603", title: "Widows Bay", mediaType: "tv" },
			{
				fetchImpl,
				libraryLookup: { status: "missing" },
				streamaConfig: { baseUrl: "", username: "", password: "" },
			}
		)
		expect(seasons).toEqual([1])
	})

	test("update auto-queues latest missing season; gaps stay pending", async () => {
		const fetchImpl = async (url) => {
			if (String(url).startsWith("https://api.tvmaze.com/lookup")) {
				return jsonRes({ id: 99 })
			}
			if (String(url).includes("/episodes")) {
				return jsonRes([
					{ season: 1, airstamp: "2020-01-01T00:00:00Z" },
					{ season: 2, airstamp: "2021-01-01T00:00:00Z" },
					{ season: 3, airstamp: "2022-01-01T00:00:00Z" },
				])
			}
			throw new Error(`unexpected ${url}`)
		}
		const deps = {
			fetchImpl,
			librarySeasons: [1],
			streamaConfig: { baseUrl: "", username: "", password: "" },
		}
		const seasons = await resolveTvSeasons(
			{ id: "603", title: "Show", mediaType: "tv", streamaMediaId: 12 },
			deps
		)
		expect(seasons).toEqual([3])
		const plan = await planTvSeasons(
			{ id: "603", title: "Show", mediaType: "tv", streamaMediaId: 12 },
			deps
		)
		expect(plan.auto).toEqual([3])
		expect(plan.pending).toEqual([2])
		expect(plan.libraryUncertain).toBe(false)
		expect(plan.libraryStatus).toBe("found")
	})

	test("Streama error/unconfigured does not bookend as a new show", async () => {
		const fetchImpl = async (url) => {
			if (String(url).startsWith("https://api.tvmaze.com/lookup")) {
				return jsonRes({ id: 99 })
			}
			if (String(url).includes("/episodes")) {
				return jsonRes([
					{ season: 1, airstamp: "2020-01-01T00:00:00Z", number: 1 },
					{ season: 2, airstamp: "2021-01-01T00:00:00Z", number: 1 },
				])
			}
			throw new Error(`unexpected ${url}`)
		}
		const plan = await planTvSeasons(
			{ id: "69866", title: "Detroiters", mediaType: "tv" },
			{ fetchImpl, streamaConfig: { baseUrl: "", username: "", password: "" } }
		)
		expect(plan.auto).toEqual([])
		expect(plan.libraryUncertain).toBe(true)
		expect(plan.libraryStatus).toBe("unconfigured")
	})

	test("Streama lookup error does not bookend as a new show", async () => {
		const fetchImpl = async (url) => {
			if (String(url).startsWith("https://api.tvmaze.com/lookup")) {
				return jsonRes({ id: 99 })
			}
			if (String(url).includes("/episodes")) {
				return jsonRes([
					{ season: 1, airstamp: "2020-01-01T00:00:00Z", number: 1 },
					{ season: 2, airstamp: "2021-01-01T00:00:00Z", number: 1 },
				])
			}
			throw new Error(`unexpected ${url}`)
		}
		const plan = await planTvSeasons(
			{ id: "69866", title: "Detroiters", mediaType: "tv" },
			{ fetchImpl, libraryLookup: { status: "error", error: "streama 500" } }
		)
		expect(plan.auto).toEqual([])
		expect(plan.pending).toEqual([])
		expect(plan.libraryUncertain).toBe(true)
		expect(plan.libraryStatus).toBe("error")
	})

	test("file-id stubs: present S01 is not auto-queued", async () => {
		const fetchImpl = async (url) => {
			if (String(url).startsWith("https://api.tvmaze.com/lookup")) {
				return jsonRes({ id: 99 })
			}
			if (String(url).includes("/episodes")) {
				return jsonRes([
					{ season: 1, number: 1, airstamp: "2017-02-07T00:00:00Z" },
					{ season: 1, number: 10, airstamp: "2017-04-11T00:00:00Z" },
					{ season: 2, number: 1, airstamp: "2018-06-15T00:00:00Z" },
				])
			}
			throw new Error(`unexpected ${url}`)
		}
		const show = {
			id: 1720,
			apiId: "69866",
			episodes: [
				{ season_number: 1, episode_number: 1, deleted: false, files: [{ id: 28351 }] },
				{ season_number: 1, episode_number: 9, deleted: false, files: [{ id: 28355 }] },
				{ season_number: 2, episode_number: 1, deleted: true, files: [{ id: 28579 }] },
			],
		}
		const plan = await planTvSeasons(
			{ id: "69866", title: "Detroiters", mediaType: "tv" },
			{
				fetchImpl,
				libraryLookup: { status: "found", show, streamaId: 1720 },
			}
		)
		expect(plan.present).toEqual([1])
		expect(plan.auto).toEqual([2])
		expect(plan.pending).toEqual([1])
		expect(plan.missing).toEqual(["S02E01"])
		expect(plan.streamaMediaId).toBe(1720)
	})

	test("fetchMissing auto-queues incomplete present seasons and missing seasons", async () => {
		const fetchImpl = async (url) => {
			if (String(url).startsWith("https://api.tvmaze.com/lookup")) {
				return jsonRes({ id: 99 })
			}
			if (String(url).includes("/episodes")) {
				return jsonRes([
					{ season: 1, number: 1, airstamp: "2017-02-07T00:00:00Z" },
					{ season: 1, number: 10, airstamp: "2017-04-11T00:00:00Z" },
					{ season: 2, number: 1, airstamp: "2018-06-15T00:00:00Z" },
				])
			}
			throw new Error(`unexpected ${url}`)
		}
		const show = {
			id: 1720,
			apiId: "69866",
			episodes: [
				{ season_number: 1, episode_number: 1, deleted: false, files: [{ id: 28351 }] },
				{ season_number: 1, episode_number: 9, deleted: false, files: [{ id: 28355 }] },
				{ season_number: 2, episode_number: 1, deleted: true, files: [{ id: 28579 }] },
			],
		}
		const plan = await planTvSeasons(
			{ id: "69866", title: "Detroiters", mediaType: "tv" },
			{
				fetchImpl,
				fetchMissing: true,
				libraryLookup: { status: "found", show, streamaId: 1720 },
			}
		)
		expect(plan.complete).toEqual([])
		expect(plan.present).toEqual([1])
		expect(plan.auto).toEqual([1, 2])
		expect(plan.pending).toEqual([])
		expect(plan.missing).toEqual(["S01E10", "S02E01"])
	})

	test("incomplete season missing[] is only absent episode codes", async () => {
		const fetchImpl = async (url) => {
			if (String(url).startsWith("https://api.tvmaze.com/lookup")) {
				return jsonRes({ id: 99 })
			}
			if (String(url).includes("/episodes")) {
				return jsonRes([
					{ season: 1, number: 1, airstamp: "2017-02-07T00:00:00Z" },
					{ season: 1, number: 2, airstamp: "2017-02-14T00:00:00Z" },
					{ season: 1, number: 3, airstamp: "2017-02-21T00:00:00Z" },
					{ season: 1, number: 4, airstamp: "2017-02-28T00:00:00Z" },
				])
			}
			throw new Error(`unexpected ${url}`)
		}
		const show = {
			id: 1,
			episodes: [
				{
					season_number: 1,
					episode_number: 1,
					files: [{ originalFilename: "s01e01.mkv", contentType: "video/mp4" }],
				},
				{
					season_number: 1,
					episode_number: 2,
					files: [{ originalFilename: "s01e02.mkv", contentType: "video/mp4" }],
				},
				{
					season_number: 1,
					episode_number: 3,
					files: [{ originalFilename: "s01e03.mkv", contentType: "video/mp4" }],
				},
			],
		}
		const plan = await planTvSeasons(
			{ id: "1", title: "Show", mediaType: "tv" },
			{
				fetchImpl,
				fetchMissing: true,
				libraryLookup: { status: "found", show, streamaId: 1 },
			}
		)
		expect(plan.auto).toEqual([1])
		expect(plan.missing).toEqual(["S01E04"])
		expect(plan.missing).not.toEqual(["S01E01", "S01E02", "S01E03", "S01E04"])
	})

	test("new show bookends: missing is all aired episodes in those seasons", async () => {
		const fetchImpl = async (url) => {
			if (String(url).startsWith("https://api.tvmaze.com/lookup")) {
				return jsonRes({ id: 99 })
			}
			if (String(url).includes("/episodes")) {
				return jsonRes([
					{ season: 1, number: 1, airstamp: "2020-01-01T00:00:00Z" },
					{ season: 1, number: 2, airstamp: "2020-01-08T00:00:00Z" },
					{ season: 2, number: 1, airstamp: "2021-01-01T00:00:00Z" },
					{ season: 3, number: 1, airstamp: "2022-01-01T00:00:00Z" },
					{ season: 4, number: 1, airstamp: "2023-01-01T00:00:00Z" },
					{ season: 4, number: 2, airstamp: "2023-01-08T00:00:00Z" },
				])
			}
			throw new Error(`unexpected ${url}`)
		}
		const plan = await planTvSeasons(
			{ id: "603", title: "Widows Bay", mediaType: "tv" },
			{
				fetchImpl,
				libraryLookup: { status: "missing" },
			}
		)
		expect(plan.auto).toEqual([1, 4])
		expect(plan.missing).toEqual(["S01E01", "S01E02", "S04E01", "S04E02"])
	})

	test("does not default to season 1 when TVMaze and library yield nothing", async () => {
		const fetchImpl = async (url) => {
			if (String(url).startsWith("https://api.tvmaze.com/lookup")) {
				return jsonRes({ id: 99 })
			}
			if (String(url).includes("/episodes")) {
				return jsonRes([])
			}
			throw new Error(`unexpected ${url}`)
		}
		const plan = await planTvSeasons(
			{ id: "603", title: "Unknown Show", mediaType: "tv" },
			{
				fetchImpl,
				libraryLookup: { status: "missing" },
			}
		)
		expect(plan.auto).toEqual([])
		expect(plan.missing).toEqual([])
		expect(plan.libraryStatus).toBe("missing")
	})

	test("empty missing when auto seasons have no numbered aired episodes", async () => {
		const fetchImpl = async (url) => {
			if (String(url).startsWith("https://api.tvmaze.com/lookup")) {
				return jsonRes({ id: 99 })
			}
			if (String(url).includes("/episodes")) {
				return jsonRes([{ season: 1, airstamp: "2020-01-01T00:00:00Z" }])
			}
			throw new Error(`unexpected ${url}`)
		}
		const plan = await planTvSeasons(
			{ id: "603", title: "Show", mediaType: "tv" },
			{
				fetchImpl,
				libraryLookup: { status: "missing" },
			}
		)
		expect(plan.auto).toEqual([1])
		expect(plan.missing).toEqual([])
	})
})

describe("bookendSeasons / classifySeasonPlan", () => {
	test("bookends skip in-between seasons", () => {
		expect(bookendSeasons([1, 2, 3, 8])).toEqual([1, 8])
		expect(bookendSeasons([1])).toEqual([1])
		expect(bookendSeasons([])).toEqual([])
	})

	test("new show auto-queues bookends only", () => {
		expect(classifySeasonPlan([1, 2, 3, 4, 5], [])).toEqual({
			auto: [1, 5],
			pending: [],
		})
	})

	test("first+latest already in library: gaps need approval", () => {
		expect(classifySeasonPlan([1, 2, 3, 4, 5], [1, 5])).toEqual({
			auto: [],
			pending: [2, 3, 4],
		})
	})

	test("library has first only: auto latest, pending gaps", () => {
		expect(classifySeasonPlan([1, 2, 3, 4], [1])).toEqual({
			auto: [4],
			pending: [2, 3],
		})
	})

	test("incomplete present season is pending, not auto-queued", () => {
		expect(classifySeasonPlan([1, 2], [], [1])).toEqual({
			auto: [2],
			pending: [1],
		})
	})

	test("only a new latest season is missing", () => {
		expect(classifySeasonPlan([1, 2, 3], [1, 2])).toEqual({
			auto: [3],
			pending: [],
		})
	})

	test("fetchMissing auto-queues every incomplete or missing season", () => {
		expect(
			classifySeasonPlan([1, 2, 3, 4], [1], [1, 2], { fetchMissing: true })
		).toEqual({
			auto: [2, 3, 4],
			pending: [],
		})
	})

	test("fetchMissing no-ops when every aired season is complete", () => {
		expect(
			classifySeasonPlan([1, 2], [1, 2], [1, 2], { fetchMissing: true })
		).toEqual({
			auto: [],
			pending: [],
		})
	})
})

describe("missingEpisodeCodes", () => {
	test("subtracts library codes within the planned seasons only", () => {
		const aired = [
			{ season: 1, number: 1 },
			{ season: 1, number: 4 },
			{ season: 2, number: 1 },
			{ season: 3, number: 2 },
		]
		expect(
			missingEpisodeCodes(aired, [1, 3], new Set(["S01E01"]))
		).toEqual(["S01E04", "S03E02"])
	})

	test("empty when every aired episode in those seasons is present", () => {
		expect(
			missingEpisodeCodes(
				[
					{ season: 1, number: 1 },
					{ season: 1, number: 2 },
				],
				[1],
				new Set(["S01E01", "S01E02"])
			)
		).toEqual([])
	})
})
