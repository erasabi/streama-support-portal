// Probes for the six recurring pipeline bug classes.
//
// Each class gets a detection probe (the trace must flag the pattern) and, where
// the durable fix is still gated on live traces, a characterization test that
// pins today's behaviour. Tests marked PINS CURRENT BEHAVIOUR are expected to
// fail when the matching fix lands -- that failure is the gate, not a
// regression. Update them together with the fix.

const {
	buildIdentity,
	buildMagnetLookup,
	buildFetchPlan,
	buildJobs,
	buildEncode,
	buildSortifyStreama,
	buildSubtitleAcquire,
	buildFlags,
	downloaderEvidence,
	deliveredEpisodeCodes,
} = require("./pipelineTrace")

function makeTrace({
	request = {},
	jobs = [],
	events = [],
	plan = null,
	remoteSortify = null,
} = {}) {
	const row = {
		id: "69866",
		title: "Detroiters",
		releaseDate: "2017-02-07",
		mediaType: "tv",
		pipelineStage: "downloading",
		magnetLookupStatus: "not_applicable",
		queueStatusSource: "derived",
		...request,
	}
	const artifacts = row.pipelineArtifacts || {}
	const identity = buildIdentity(row, jobs)
	const magnetLookup = buildMagnetLookup(row, events)
	const fetchPlan = buildFetchPlan(row, plan, jobs, artifacts, events)
	const jobViews = buildJobs(jobs, artifacts)
	const encode = buildEncode(artifacts, events)
	const sortifyStreama = buildSortifyStreama(row, events, identity, remoteSortify)
	const subtitleAcquire = buildSubtitleAcquire(events, jobs)
	const flags = buildFlags({
		request: row,
		identity,
		magnetLookup,
		fetchPlan,
		jobs: jobViews,
		encode,
		sortifyStreama,
		subtitleAcquire,
	})
	return { identity, magnetLookup, fetchPlan, jobs: jobViews, encode, sortifyStreama, subtitleAcquire, flags }
}

const codes = (flags) => flags.map((f) => f.code)

describe("identity", () => {
	test("recovers the tmdb id from each job folder name", () => {
		const { identity } = makeTrace({
			jobs: [{ id: "j1", folderName: "detroiters-2017-tmdb69866", claimStatus: "ready" }],
		})
		expect(identity.expectedFolderName).toBe("detroiters-2017-tmdb69866")
		expect(identity.folderTmdbIds).toEqual(["69866"])
	})

	test("canonical TMDB id from a namespaced Add Subtitles ticket", () => {
		const { identity } = makeTrace({
			request: { id: "update:270476:1789021540218", title: "Widow's Bay", releaseDate: "2026-01-01" },
			jobs: [{ id: "j1", folderName: "widow-s-bay-2026-tmdb270476" }],
		})
		expect(identity.tmdbId).toBe("270476")
		expect(identity.expectedFolderName).toBe("widow-s-bay-2026-tmdb270476")
	})
})

// --- Class 1: portal says Downloading, rentify has nothing -----------------

describe("class: download badge without a downloader", () => {
	test("a claimed job with no hash, file, or progress has no evidence", () => {
		const evidence = downloaderEvidence({ id: "j1", claimStatus: "claimed" }, {})
		expect(evidence.hasEvidence).toBe(false)
	})

	test("an infoHash or a downloaded file counts as evidence", () => {
		expect(downloaderEvidence({ infoHash: "A".repeat(40) }, {}).hasEvidence).toBe(true)
		expect(
			downloaderEvidence({}, { download: { files: [{ name: "x.mkv" }] } }).hasEvidence
		).toBe(true)
	})

	test("stage Downloading with a claimed-only job is flagged", () => {
		const { flags } = makeTrace({
			request: { pipelineStage: "downloading" },
			jobs: [{ id: "j1", claimStatus: "claimed", stage: "claimed", claimedBy: "prelanflix" }],
		})
		expect(codes(flags)).toContain("download_stage_without_downloader_evidence")
	})

	test("stage Downloading with a real torrent is not flagged", () => {
		const { flags } = makeTrace({
			request: { pipelineStage: "downloading" },
			jobs: [
				{
					id: "j1",
					claimStatus: "in_progress",
					stage: "downloading",
					infoHash: "A".repeat(40),
					progressPct: 42,
				},
			],
		})
		expect(codes(flags)).not.toContain("download_stage_without_downloader_evidence")
	})

	test("stage Downloading with no active job at all is flagged separately", () => {
		const { flags } = makeTrace({ request: { pipelineStage: "downloading" }, jobs: [] })
		expect(codes(flags)).toContain("download_stage_without_active_job")
	})

	// PINS CURRENT BEHAVIOUR (gated fix: "download contract").
	// `claimed` is labelled Downloading before `rentify add` runs, which is why
	// the portal and rentify disagree. Flip to "Queued"/"Claimed" with the fix.
	test("claimed is still labelled Downloading to the user", () => {
		const status = require("./status")
		expect(status.stageLabel("claimed")).toBe("Downloading")
	})
})

// --- Class 2: magnet exists but the portal missed it -----------------------

describe("class: magnet miss taxonomy", () => {
	test("a movie with no recorded search cannot explain its miss", () => {
		const { flags } = makeTrace({
			request: { mediaType: "movie", magnetLookupStatus: "not_found", pipelineStage: "requested" },
		})
		expect(codes(flags)).toContain("magnet_search_not_recorded")
	})

	test("a recorded miss surfaces the reason", () => {
		const { magnetLookup, flags } = makeTrace({
			request: { mediaType: "movie", magnetLookupStatus: "not_found", pipelineStage: "requested" },
			events: [
				{
					id: "e1",
					createdAt: "2026-01-01",
					type: "magnet_lookup_detail",
					payload: {
						outcome: "not_found",
						missReason: "YTS mirror returned movie.id === 0 (not in mirror)",
						attempts: [{ source: "yts", query: "https://yts?imdb_id=tt1", ok: true }],
					},
				},
			],
		})
		expect(magnetLookup.searchCount).toBe(1)
		expect(codes(flags)).toContain("magnet_reported_not_found")
	})

	test("a TV miss is never reported as a magnet lookup failure", () => {
		const { magnetLookup, flags } = makeTrace({
			request: { mediaType: "tv", magnetLookupStatus: "not_applicable" },
		})
		expect(magnetLookup.autoLookupApplies).toBe(false)
		expect(codes(flags)).not.toContain("magnet_search_not_recorded")
		expect(codes(flags)).not.toContain("magnet_reported_not_found")
	})

	test("a stored magnet that is on the exclude list is flagged", () => {
		const hash = "A".repeat(40)
		const { flags } = makeTrace({
			request: { mediaType: "movie", magnetLookupStatus: "found", magnetHash: hash },
			events: [
				{
					id: "e1",
					createdAt: "2026-01-01",
					type: "magnet_lookup_detail",
					payload: { outcome: "found", excludeHashes: [hash], attempts: [] },
				},
			],
		})
		expect(codes(flags)).toContain("stored_magnet_hash_excluded")
	})
})

// --- Class 3: right magnet, wrong media in Streama -------------------------

describe("class: identity gate", () => {
	test("folder tmdb id vs Streama matcher apiId mismatch is flagged", () => {
		const { flags, sortifyStreama } = makeTrace({
			jobs: [{ id: "j1", folderName: "detroiters-2017-tmdb69866", claimStatus: "completed" }],
			remoteSortify: {
				status: "ok",
				data: { match: { apiId: "99999", title: "Some Other Show" } },
			},
		})
		expect(sortifyStreama.matchIdentity.matches).toBe(false)
		expect(codes(flags)).toContain("tmdb_identity_mismatch")
	})

	test("matching ids are not flagged", () => {
		const { flags } = makeTrace({
			jobs: [{ id: "j1", folderName: "detroiters-2017-tmdb69866", claimStatus: "completed" }],
			remoteSortify: { status: "ok", data: { match: { apiId: "69866" } } },
		})
		expect(codes(flags)).not.toContain("tmdb_identity_mismatch")
	})

	// An unreachable agent must read as unknown, never as "verified ok".
	test("an unreported apiId is unverified, not a pass", () => {
		const { sortifyStreama, flags } = makeTrace({
			request: { streamaMediaId: 42 },
			jobs: [{ id: "j1", folderName: "detroiters-2017-tmdb69866", claimStatus: "completed" }],
		})
		expect(sortifyStreama.matchIdentity.matches).toBeNull()
		expect(codes(flags)).toContain("tmdb_identity_unverified")
	})
})

// --- Class 4: duplicate dashboard highlights -------------------------------

describe("class: highlight idempotency", () => {
	test("more than one highlight row for the same media is flagged", () => {
		const { flags } = makeTrace({
			request: { streamaMediaId: 42 },
			remoteSortify: {
				status: "ok",
				data: {
					match: { apiId: "69866" },
					highlights: [
						{ id: 1, videoToPlay: { id: 100 } },
						{ id: 2, videoToPlay: { id: 101 } },
					],
				},
			},
			jobs: [{ id: "j1", folderName: "detroiters-2017-tmdb69866", claimStatus: "completed" }],
		})
		expect(codes(flags)).toContain("duplicate_dashboard_highlights")
	})

	test("a single highlight is not flagged", () => {
		const { flags } = makeTrace({
			request: { streamaMediaId: 42 },
			remoteSortify: {
				status: "ok",
				data: { match: { apiId: "69866" }, highlights: [{ id: 1, videoToPlay: { id: 100 } }] },
			},
			jobs: [{ id: "j1", folderName: "detroiters-2017-tmdb69866", claimStatus: "completed" }],
		})
		expect(codes(flags)).not.toContain("duplicate_dashboard_highlights")
	})

	test("repeated highlighted events alone are not called duplicate rows", () => {
		// The sortify bridge posts `highlighted` on a Streama 409 as well, so N
		// events over one row is indistinguishable from N rows without the agent.
		const { sortifyStreama, flags } = makeTrace({
			request: { streamaMediaId: 42 },
			events: [
				{ type: "highlighted", createdAt: "2026-01-01T00:00:00Z", actor: "sortify" },
				{ type: "highlighted", createdAt: "2026-01-02T00:00:00Z", actor: "sortify" },
				{ type: "highlighted", createdAt: "2026-01-03T00:00:00Z", actor: "sortify" },
			],
		})
		expect(sortifyStreama.highlights.rowCount).toBeNull()
		expect(sortifyStreama.highlights.eventCount).toBe(3)
		expect(codes(flags)).not.toContain("duplicate_dashboard_highlights")
		expect(codes(flags)).toContain("duplicate_highlight_events_unverified")
	})

	test("highlightStatus from the agent turns events into a real row count", () => {
		// Two rows genuinely created plus one 409 re-run over an existing row.
		const { sortifyStreama, flags } = makeTrace({
			request: { streamaMediaId: 42 },
			events: [
				{
					type: "highlighted",
					createdAt: "2026-01-01T00:00:00Z",
					payload: { detail: { highlightStatus: "created", videoToPlayId: 100 } },
				},
				{
					type: "highlighted",
					createdAt: "2026-01-02T00:00:00Z",
					payload: { detail: { highlightStatus: "already_exists", videoToPlayId: 100 } },
				},
				{
					type: "highlighted",
					createdAt: "2026-01-03T00:00:00Z",
					payload: { detail: { highlightStatus: "created", videoToPlayId: 101 } },
				},
			],
		})
		expect(sortifyStreama.highlights.rowCount).toBe(2)
		expect(sortifyStreama.highlights.eventCount).toBe(3)
		expect(sortifyStreama.highlights.countSource).toBe("highlight_status")
		expect(sortifyStreama.highlights.distinctVideoIds).toEqual(["100", "101"])
		expect(codes(flags)).toContain("duplicate_dashboard_highlights")
	})

	test("repeated 409s over one row are not a duplicate", () => {
		const { sortifyStreama, flags } = makeTrace({
			request: { streamaMediaId: 42 },
			events: [
				{
					type: "highlighted",
					createdAt: "2026-01-01T00:00:00Z",
					payload: { detail: { highlightStatus: "created", videoToPlayId: 100 } },
				},
				{
					type: "highlighted",
					createdAt: "2026-01-02T00:00:00Z",
					payload: { detail: { highlightStatus: "already_exists", videoToPlayId: 100 } },
				},
				{
					type: "highlighted",
					createdAt: "2026-01-03T00:00:00Z",
					payload: { detail: { highlightStatus: "already_exists", videoToPlayId: 100 } },
				},
			],
		})
		expect(sortifyStreama.highlights.rowCount).toBe(1)
		expect(codes(flags)).not.toContain("duplicate_dashboard_highlights")
		expect(codes(flags)).not.toContain("duplicate_highlight_events_unverified")
	})

	test("apiId reported inside detail is picked up for the identity check", () => {
		const { sortifyStreama, flags } = makeTrace({
			request: { streamaMediaId: 42 },
			events: [
				{
					type: "pending_approval",
					createdAt: "2026-01-01T00:00:00Z",
					payload: { detail: { apiId: "12345" } },
				},
			],
			jobs: [{ id: "j1", folderName: "detroiters-2017-tmdb69866", claimStatus: "completed" }],
		})
		expect(sortifyStreama.matchIdentity.matcherApiId).toBe("12345")
		expect(sortifyStreama.matchIdentity.matches).toBe(false)
		expect(codes(flags)).toContain("tmdb_identity_mismatch")
	})

	test("distinct videoToPlay ids are reported, since that is what defeats the 409", () => {
		const { sortifyStreama } = makeTrace({
			remoteSortify: {
				status: "ok",
				data: {
					highlights: [{ videoToPlay: { id: 100 } }, { videoToPlay: { id: 101 } }],
				},
			},
		})
		expect(sortifyStreama.highlights.distinctVideoIds).toEqual(["100", "101"])
	})
})

// --- Class 5: Russian subtitles never uploaded -----------------------------

describe("class: Russian subtitles", () => {
	const withSubs = (encodeSubs, uploadSubs) => ({
		request: {
			pipelineStage: "uploaded",
			pipelineArtifacts: {
				encode: {
					files: [{ name: "Show.S01E01_1080p.mp4", kind: "video" }],
					subtitles: encodeSubs.map((name) => ({ name })),
				},
				upload: {
					files: [{ name: "Show.S01E01_1080p.mp4", kind: "video" }],
					subtitles: uploadSubs.map((name) => ({ name })),
				},
			},
		},
	})

	test("English present but Russian missing at upload is flagged", () => {
		const { flags } = makeTrace(
			withSubs(["en_Show.S01E01.srt"], ["en_Show.S01E01.srt"])
		)
		expect(codes(flags)).toContain("russian_subtitles_absent")
	})

	test("Russian produced at encode but lost before upload is a separate flag", () => {
		const { flags } = makeTrace(
			withSubs(["en_Show.S01E01.srt", "ru_Show.S01E01.srt"], ["en_Show.S01E01.srt"])
		)
		expect(codes(flags)).toContain("subtitles_lost_between_encode_and_upload")
	})

	test("both languages reaching upload clears the flags", () => {
		const { flags, encode } = makeTrace(
			withSubs(
				["en_Show.S01E01.srt", "ru_Show.S01E01.srt"],
				["en_Show.S01E01.srt", "ru_Show.S01E01.srt"]
			)
		)
		expect(encode.stages.upload.subtitleLanguages).toEqual(["en", "ru"])
		expect(codes(flags)).not.toContain("russian_subtitles_absent")
		expect(codes(flags)).not.toContain("subtitles_lost_between_encode_and_upload")
	})

	test("Russian available upstream but absent downstream raises severity to error", () => {
		const base = withSubs(["en_Show.srt"], ["en_Show.srt"])
		const { flags } = makeTrace({
			...base,
			request: { ...base.request, mediaType: "movie", magnetLookupStatus: "found" },
			events: [
				{
					id: "e1",
					createdAt: "2026-01-01",
					type: "magnet_lookup_detail",
					payload: {
						outcome: "found",
						attempts: [],
						subtitleLanguages: { Russian: { found: true, url: "https://y/ru.zip" } },
					},
				},
			],
		})
		const ru = flags.find((f) => f.code === "russian_subtitles_absent")
		expect(ru.severity).toBe("error")
	})
})

// --- Class 6: no subtitles at all on English-speaking shows ----------------

describe("class: subtitles on English shows", () => {
	test("video at upload with zero subtitles is flagged", () => {
		const { flags } = makeTrace({
			request: {
				pipelineStage: "uploaded",
				pipelineArtifacts: {
					upload: { files: [{ name: "Show.S01E01_1080p.mp4", kind: "video" }] },
				},
			},
		})
		expect(codes(flags)).toContain("no_subtitles_at_upload")
	})

	test("a source that was never probed for embedded tracks is called out", () => {
		const { flags } = makeTrace({
			request: {
				pipelineStage: "uploaded",
				pipelineArtifacts: {
					upload: {
						files: [{ name: "Show_1080p.mp4", kind: "video" }],
						subtitles: [{ name: "en_Show.srt" }],
					},
				},
			},
		})
		expect(codes(flags)).toContain("embedded_tracks_never_probed")
	})

	test("an encoder probe report clears the never-probed flag", () => {
		const { flags, encode } = makeTrace({
			request: {
				pipelineStage: "uploaded",
				pipelineArtifacts: {
					upload: {
						files: [{ name: "Show_1080p.mp4", kind: "video" }],
						subtitles: [{ name: "en_Show.srt" }],
					},
				},
			},
			events: [
				{
					id: "e1",
					createdAt: "2026-01-01",
					type: "encoding",
					payload: {
						audioLanguage: "eng",
						hardsub: false,
						embeddedSubtitles: {
							embeddedTracks: [{ si: 0, codec: "hdmv_pgs_subtitle", language: "en" }],
							results: [
								{ language: "en", outcome: "skipped", reason: "no text track (codec=hdmv_pgs_subtitle)" },
							],
						},
					},
				},
			],
		})
		expect(encode.embeddedTrackReports).toHaveLength(1)
		expect(codes(flags)).not.toContain("embedded_tracks_never_probed")
	})
})

// --- Fetch plan: what we asked for vs what arrived -------------------------

describe("fetch plan vs actual", () => {
	test("episode codes are recovered from stage file inventories", () => {
		const delivered = deliveredEpisodeCodes(
			{ upload: { files: [{ name: "Show.S02E11.1080p.mp4" }, { name: "Show.S2E12.mp4" }] } },
			[]
		)
		expect(delivered).toEqual(["S02E11", "S02E12"])
	})

	test("planned episodes that never arrived are flagged", () => {
		const { fetchPlan, flags } = makeTrace({
			request: {
				pipelineArtifacts: {
					upload: { files: [{ name: "Detroiters.S02E11_1080p.mp4", kind: "video" }] },
				},
			},
			plan: {
				headline: "2 episodes planned",
				seasonPlan: { plannedMissing: ["S02E11", "S02E12"], libraryStatus: "found" },
				active: { count: 1, plannedMissing: ["S02E11", "S02E12"], remainingMissing: ["S02E12"] },
			},
			jobs: [
				{
					id: "j1",
					folderName: "detroiters-2017-tmdb69866",
					claimStatus: "in_progress",
					detail: { missing: ["S02E11", "S02E12"] },
				},
			],
		})
		expect(fetchPlan.plannedVsActual.plannedNeverDelivered).toEqual(["S02E12"])
		expect(codes(flags)).toContain("planned_episodes_never_delivered")
	})

	test("a whole-season job alongside an episode gap plan is flagged as over-fetching", () => {
		const { flags } = makeTrace({
			plan: {
				seasonPlan: { plannedMissing: ["S02E11"], libraryStatus: "found" },
				active: { plannedMissing: ["S02E11"], remainingMissing: [] },
			},
			jobs: [{ id: "j1", claimStatus: "ready", seasons: [2], detail: {} }],
		})
		expect(codes(flags)).toContain("whole_season_queued_despite_gap_plan")
	})

	test("the library state that produced the plan is carried in the trace", () => {
		const { fetchPlan } = makeTrace({
			plan: {
				seasonPlan: {
					libraryStatus: "found",
					presentSeasons: [1],
					completeSeasons: [1],
					autoSeasons: [2],
					pendingSeasons: [],
					plannedMissing: ["S02E01"],
				},
			},
			request: { streamaMediaId: 42 },
		})
		expect(fetchPlan.libraryState).toMatchObject({
			libraryStatus: "found",
			completeSeasons: [1],
			autoSeasons: [2],
			streamaMediaId: 42,
		})
	})
})

describe("job lease", () => {
	test("an expired lease on an active job is flagged", () => {
		const { flags } = makeTrace({
			request: { pipelineStage: "encoding" },
			jobs: [
				{
					id: "j1",
					claimStatus: "in_progress",
					stage: "encoding",
					infoHash: "A".repeat(40),
					leaseUntil: new Date(Date.now() - 60000).toISOString(),
				},
			],
		})
		expect(codes(flags)).toContain("job_lease_expired")
	})
})

describe("subtitle acquire", () => {
	test("rejected languages become an info flag, not an upload error", () => {
		const { flags, subtitleAcquire } = makeTrace({
			request: { pipelineStage: "available" },
			events: [
				{
					id: "e1",
					createdAt: "2026-09-10",
					type: "acquiring_subtitles",
					payload: {
						detail: {
							subtitleAcquire: {
								video: "detroiters.s01e01.mp4",
								tmdbId: "69866",
								trigger: "manual",
								languages: {
									en: { status: "kept" },
									ru: { status: "rejected", reason: "offset_out_of_range" },
								},
							},
						},
					},
				},
			],
		})
		expect(subtitleAcquire.latest.languages.ru.status).toBe("rejected")
		expect(codes(flags)).toContain("subtitle_acquire_rejected")
		expect(codes(flags)).not.toContain("no_subtitles_at_upload")
		const row = flags.find((f) => f.code === "subtitle_acquire_rejected")
		expect(row.severity).toBe("info")
	})

	test("job detail skip no_library_video is an error flag", () => {
		const { flags, subtitleAcquire } = makeTrace({
			request: { pipelineStage: "acquiring_subtitles" },
			jobs: [
				{
					id: "j1",
					detail: {
						kind: "subtitle_acquire",
						subtitleAcquire: {
							video: null,
							tmdbId: "270476",
							trigger: "manual",
							languages: {
								en: { status: "skipped", reason: "no_library_video" },
								ru: { status: "skipped", reason: "no_library_video" },
							},
						},
					},
				},
			],
		})
		expect(subtitleAcquire.latest.languages.en.reason).toBe("no_library_video")
		expect(codes(flags)).toContain("subtitle_acquire_no_library_video")
	})
})
