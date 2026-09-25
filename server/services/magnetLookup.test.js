jest.mock("axios")
const axios = require("axios")

const {
	lookupMovieMagnet,
	pickBestTorrent,
	pickBestTorrentWithReason,
	getYifySubtitleIndex,
	extractInfoHash,
} = require("./magnetLookup")

const HASH_A = "A".repeat(40)
const HASH_B = "B".repeat(40)

function torrent(overrides = {}) {
	return {
		hash: HASH_A,
		quality: "1080p",
		video_codec: "x264",
		url: `https://yts.mx/torrent/download/${HASH_A}`,
		seeds: 50,
		...overrides,
	}
}

// Minimal YIFY index page. Cells must be real <td>s: an HTML parser hoists
// non-cell children out of a <tr>, which would empty every row.
function yifyHtml(rows) {
	const body = rows
		.map(
			(r) =>
				`<tr><td><span class="label">${r.rating}</span></td>` +
				`<td><span class="sub-lang">${r.lang}</span></td>` +
				`<td><a href="/subtitles/${r.slug}">dl</a></td></tr>`
		)
		.join("")
	return `<html><body><table><tbody>${body}</tbody></table></body></html>`
}

beforeEach(() => {
	jest.resetAllMocks()
})

describe("pickBestTorrent", () => {
	test("prefers x264 over other codecs, then 1080p over 2160p", () => {
		const best = pickBestTorrent([
			torrent({ hash: HASH_B, quality: "1080p", video_codec: "x265" }),
			torrent({ hash: HASH_A, quality: "2160p", video_codec: "x264" }),
		])
		expect(best.hash).toBe(HASH_A)
	})

	test("skips hashes already tried", () => {
		const best = pickBestTorrent(
			[torrent({ hash: HASH_A }), torrent({ hash: HASH_B, quality: "2160p" })],
			[HASH_A]
		)
		expect(best.hash).toBe(HASH_B)
	})

	// A title whose only sources have all failed is still a title WITH sources.
	// Reporting it as "not found" is the magnet-miss taxonomy bug.
	test("falls back to the full list when every hash is excluded, and says so", () => {
		const picked = pickBestTorrentWithReason([torrent({ hash: HASH_A })], [HASH_A])
		expect(picked.torrent.hash).toBe(HASH_A)
		expect(picked.exhausted).toBe(true)
		expect(picked.reason).toMatch(/exhausted/)
	})

	test("empty torrent list reports why, not just null", () => {
		const picked = pickBestTorrentWithReason([])
		expect(picked.torrent).toBeNull()
		expect(picked.reason).toMatch(/no torrents/)
	})
})

describe("lookupMovieMagnet miss taxonomy", () => {
	test("TMDB failure is an error with the reason recorded, not a silent miss", async () => {
		axios.get.mockRejectedValueOnce(new Error("socket hang up"))
		const result = await lookupMovieMagnet("603")
		expect(result.status).toBe("error")
		expect(result.search.outcome).toBe("error")
		expect(result.search.missReason).toMatch(/socket hang up/)
		expect(result.search.attempts[0]).toMatchObject({ source: "tmdb", ok: false })
	})

	test("no imdb_id is a distinct miss reason from a YTS miss", async () => {
		axios.get.mockResolvedValueOnce({ data: { imdb_id: null } })
		const result = await lookupMovieMagnet("603")
		expect(result.status).toBe("not_found")
		expect(result.search.missReason).toMatch(/no imdb_id/)
	})

	test("YTS timeout is an error, never not_found", async () => {
		axios.get
			.mockResolvedValueOnce({ data: { imdb_id: "tt0133093" } })
			.mockRejectedValueOnce(new Error("timeout of 45000ms exceeded"))
		const result = await lookupMovieMagnet("603")
		expect(result.status).toBe("error")
		expect(result.search.missReason).toMatch(/timeout/)
	})

	test("movie.id === 0 is distinguishable from an empty torrent list", async () => {
		axios.get
			.mockResolvedValueOnce({ data: { imdb_id: "tt0133093" } })
			.mockResolvedValueOnce({ data: { data: { movie: { id: 0, torrents: [] } } } })
		const zero = await lookupMovieMagnet("603")
		expect(zero.status).toBe("not_found")
		expect(zero.search.missReason).toMatch(/movie\.id === 0/)

		axios.get
			.mockResolvedValueOnce({ data: { imdb_id: "tt0133093" } })
			.mockResolvedValueOnce({
				data: { data: { movie: { id: 12, title_long: "The Matrix (1999)", torrents: [] } } },
			})
		const empty = await lookupMovieMagnet("603")
		expect(empty.status).toBe("not_found")
		expect(empty.search.missReason).toMatch(/torrent list is empty/)
	})

	test("a found lookup records the endpoints, the torrent list, and the pick reason", async () => {
		axios.get
			.mockResolvedValueOnce({ data: { imdb_id: "tt0133093" } })
			.mockResolvedValueOnce({
				data: {
					data: {
						movie: {
							id: 12,
							title_long: "The Matrix (1999)",
							torrents: [torrent(), torrent({ hash: HASH_B, quality: "2160p" })],
						},
					},
				},
			})
			.mockResolvedValueOnce({
				data: yifyHtml([{ lang: "English", rating: "8", slug: "matrix-en" }]),
			})

		const result = await lookupMovieMagnet("603")
		expect(result.status).toBe("found")

		const sources = result.search.attempts.map((a) => a.source)
		expect(sources).toContain("tmdb")
		expect(sources).toContain("yts")
		expect(sources).toContain("yifysubtitles")

		const yts = result.search.attempts.find((a) => a.source === "yts")
		expect(yts.query).toContain("imdb_id=tt0133093")
		expect(yts.movieTitle).toBe("The Matrix (1999)")
		expect(yts.torrents).toHaveLength(2)
		expect(result.search.pick.hash).toBe(HASH_A)
		expect(result.search.pick.reason).toMatch(/1080p/)
	})
})

describe("subtitle language coverage", () => {
	test("the index reports Russian availability alongside English", async () => {
		axios.get.mockResolvedValueOnce({
			data: yifyHtml([
				{ lang: "English", rating: "8", slug: "m-en" },
				{ lang: "Russian", rating: "5", slug: "m-ru" },
			]),
		})
		const index = await getYifySubtitleIndex("tt0133093")
		expect(index.byLanguage.English.found).toBe(true)
		expect(index.byLanguage.Russian.found).toBe(true)
		expect(index.byLanguage.Russian.url).toContain("m-ru.zip")
	})

	test("top-rated entry wins within a language", async () => {
		axios.get.mockResolvedValueOnce({
			data: yifyHtml([
				{ lang: "English", rating: "2", slug: "low" },
				{ lang: "English", rating: "9", slug: "high" },
			]),
		})
		const index = await getYifySubtitleIndex("tt1", ["English"])
		expect(index.byLanguage.English.url).toContain("high.zip")
	})

	test("Russian YIFY URL is returned alongside English for movie lookup", async () => {
		axios.get
			.mockResolvedValueOnce({ data: { imdb_id: "tt0133093" } })
			.mockResolvedValueOnce({
				data: { data: { movie: { id: 12, torrents: [torrent()] } } },
			})
			.mockResolvedValueOnce({
				data: yifyHtml([
					{ lang: "English", rating: "8", slug: "m-en" },
					{ lang: "Russian", rating: "7", slug: "m-ru" },
				]),
			})

		const result = await lookupMovieMagnet("603")
		const russian = result.search.attempts.find(
			(a) => a.source === "yifysubtitles" && a.language === "Russian"
		)
		expect(russian.found).toBe(true)
		expect(russian.subtitleUrl).toContain("m-ru.zip")
		expect(result.subtitleUrl).toContain("m-en.zip")
		expect(result.subtitleUrlRu).toContain("m-ru.zip")
	})
})

describe("extractInfoHash", () => {
	test("reads btih from a magnet and a bare hash from a YTS url", () => {
		expect(extractInfoHash(`magnet:?xt=urn:btih:${HASH_A.toLowerCase()}&dn=x`)).toBe(HASH_A)
		expect(extractInfoHash(`https://yts.mx/torrent/download/${HASH_B}`)).toBe(HASH_B)
		expect(extractInfoHash(null)).toBeNull()
	})
})
