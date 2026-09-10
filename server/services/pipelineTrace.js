// Cross-hop pipeline trace for one request.
//
// The recurring pipeline bugs (portal says Downloading while rentify is idle,
// right magnet but Sortify registers the wrong title, Russian subs never
// uploaded, duplicate dashboard highlights) all live in the *seams* between
// hops. Each hop has its own log, so nobody could ever see the whole path at
// once and fixes landed on whichever hop was being looked at.
//
// This assembles one document keyed by request id: identity, every magnet
// search string, what the portal told the downloader to fetch vs what actually
// arrived, subtitle inventory per language per stage, Streama match identity,
// and highlight rows -- plus explicit flags for the known mismatch patterns.
//
// Local-first: everything here comes from portal DB rows (Request, PipelineJob,
// RequestEvent) that agents already post. Remote agent calls only add live
// uTorrent/Streama state and fail soft.

const db = require("../database")
const status = require("./status")
const { loadPipelinePlanView } = require("./pipelinePlanView")
const { subtitlesByLanguage } = require("./subtitleInventory")
const { fetchPrelanflixView, fetchSortifyView } = require("./remoteAgents")
const { tmdbFromFolder, buildFolderName } = require("./requestPipeline")
const { canonicalTmdbId } = require("../utils/requestId")

const ARTIFACT_STAGES = ["download", "encode", "upload"]
const MAX_EVENTS = 400

// Stages where the user-facing badge claims active download work.
const DOWNLOAD_CLAIM_STAGES = new Set(["claimed", "downloading"])
const ACTIVE_CLAIM_STATUSES = new Set(["ready", "claimed", "in_progress"])

function asObject(value) {
	return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

function asArray(value) {
	return Array.isArray(value) ? value : []
}

function plain(row) {
	if (!row) return null
	return row.toJSON ? row.toJSON() : row
}

function yearOf(request) {
	const year = String(request.releaseDate || "").slice(0, 4)
	return /^\d{4}$/.test(year) ? year : null
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * The join keys every later stage depends on. `folderName` is the contract that
 * carries the request id through download/encode/sync; if a job's folder loses
 * `tmdb{id}` the whole chain downstream is guessing.
 */
function buildIdentity(request, jobs) {
	const expectedFolder = buildFolderName(request, null)
	const jobFolders = jobs
		.map((job) => job.folderName)
		.filter(Boolean)
		.filter((name, i, list) => list.indexOf(name) === i)
	return {
		requestId: request.id,
		tmdbId: canonicalTmdbId(request.id) || request.id,
		mediaType: request.mediaType || null,
		title: request.title || null,
		year: yearOf(request),
		imdbId: request.imdbId || null,
		requestUser: request.requestUser || null,
		expectedFolderName: expectedFolder,
		jobFolderNames: jobFolders,
		folderTmdbIds: jobFolders
			.map((name) => tmdbFromFolder(name))
			.filter(Boolean)
			.filter((id, i, list) => list.indexOf(id) === i),
		pipelineStage: request.pipelineStage || null,
		displayStatus: status.displayStatus(request),
		stageLabel: status.stageLabel(request.pipelineStage),
		queueStatus: request.queueStatus || null,
		queueStatusSource: request.queueStatusSource || null,
		adminOverride:
			request.queueStatusSource === "admin" ? request.queueStatus || null : null,
		archivedAt: request.archivedAt || null,
		createdAt: request.createdAt || null,
	}
}

// ---------------------------------------------------------------------------
// Magnet lookup
// ---------------------------------------------------------------------------

/**
 * Every search the portal ran, newest first, with the raw YTS torrent list and
 * the pick reason. Answers "the magnet exists, why did the portal miss it".
 */
function buildMagnetLookup(request, events) {
	const searches = events
		.filter((e) => e.type === "magnet_lookup_detail")
		.map((e) => ({ at: e.createdAt, ...asObject(e.payload) }))
	const latest = searches[0] || null
	const subtitleLookups = events
		.filter((e) => e.type === "subtitle_lookup")
		.map((e) => ({ at: e.createdAt, ...asObject(e.payload) }))

	const excluded = new Set(asArray(latest && latest.excludeHashes))
	const storedHash = String(request.magnetHash || "").toUpperCase()

	return {
		magnetLookupStatus: request.magnetLookupStatus || null,
		magnetUrl: request.magnetUrl || null,
		magnetUrls: asArray(request.magnetUrls),
		magnetHash: request.magnetHash || null,
		magnetQuality: request.magnetQuality || null,
		subtitleUrl: request.subtitleUrl || null,
		magnetLookedUpAt: request.magnetLookedUpAt || null,
		magnetFoundAt: request.magnetFoundAt || null,
		// Movies only. TV never auto-looks up a magnet -- it goes to piratify --
		// so an empty search list on a TV row is expected, not a bug.
		autoLookupApplies: request.mediaType === "movie",
		searchCount: searches.length,
		latestSearch: latest,
		searches,
		subtitleLookups,
		subtitleLanguages: asObject(latest && latest.subtitleLanguages),
		storedHashWasExcluded: !!storedHash && excluded.has(storedHash),
	}
}

// ---------------------------------------------------------------------------
// Fetch plan: what the portal told the downloader to get
// ---------------------------------------------------------------------------

function episodeCodes(value) {
	return asArray(value)
		.map((c) => String(c || "").trim().toUpperCase())
		.filter((c) => /^S\d+E\d+$/.test(c))
}

/** Episode codes the pipeline reported as actually present on disk/in library. */
function deliveredEpisodeCodes(artifacts, events) {
	const codes = new Set()
	const fromName = (name) => {
		const m = String(name || "").toUpperCase().match(/S(\d+)[\s._-]?E(\d+)/)
		if (!m) return null
		return `S${String(Number(m[1])).padStart(2, "0")}E${String(Number(m[2])).padStart(2, "0")}`
	}
	for (const stage of ARTIFACT_STAGES) {
		for (const file of asArray(asObject(asObject(artifacts)[stage]).files)) {
			const code = fromName(file && file.name)
			if (code) codes.add(code)
		}
	}
	for (const event of events) {
		const payload = asObject(event.payload)
		for (const code of episodeCodes(payload.registered || payload.episodes)) {
			codes.add(code)
		}
	}
	return [...codes].sort()
}

/**
 * The portal's plan (from the Streama diff) next to what the pipeline actually
 * produced. "Entire season queued when only gaps were needed" and "episode
 * planned but never downloaded" are both visible here.
 */
function buildFetchPlan(request, plan, jobs, artifacts, events) {
	const seasonPlan = asObject(plan && plan.seasonPlan)
	const planned = episodeCodes(seasonPlan.plannedMissing)
	const activePlanned = episodeCodes(asObject(plan && plan.active).plannedMissing)
	const remaining = episodeCodes(asObject(plan && plan.active).remainingMissing)
	const delivered = deliveredEpisodeCodes(artifacts, events)
	const deliveredSet = new Set(delivered)
	const requested = [...new Set([...planned, ...activePlanned])].sort()

	const jobIntents = jobs.map((job) => {
		const detail = asObject(job.detail)
		const ledger = asObject(job.ledger)
		return {
			jobId: job.id,
			folderName: job.folderName || null,
			claimStatus: job.claimStatus,
			stage: job.stage || null,
			fetchMode: job.sourceUrl
				? "magnet"
				: episodeCodes(detail.missing).length
				? "episodes"
				: asArray(job.seasons).length
				? "seasons_legacy"
				: "unknown",
			sourceUrl: job.sourceUrl || null,
			seasons: asArray(job.seasons),
			plannedMissing: episodeCodes(detail.missing),
			leftoverMissing: episodeCodes(detail.leftoverMissing),
			ledgerMissing: episodeCodes(ledger.missing),
			presentSeasons: asArray(detail.presentSeasons),
			allowPresentSeasons: !!detail.allowPresentSeasons,
		}
	})

	// A legacy seasons job alongside a known episode gap list means the worker
	// was told to fetch whole seasons the library already partly had.
	const wholeSeasonQueued = jobIntents.filter(
		(j) => j.fetchMode === "seasons_legacy" && j.seasons.length > 0
	)

	return {
		headline: (plan && plan.headline) || null,
		mediaType: request.mediaType || null,
		pendingSeasons: asArray(plan && plan.pendingSeasons),
		seasonPlan: plan && plan.seasonPlan ? plan.seasonPlan : null,
		libraryState: {
			// Inputs to planTvSeasons: what Streama already had when we planned.
			libraryStatus: seasonPlan.libraryStatus || null,
			presentSeasons: asArray(seasonPlan.presentSeasons),
			completeSeasons: asArray(seasonPlan.completeSeasons),
			autoSeasons: asArray(seasonPlan.autoSeasons),
			pendingSeasons: asArray(seasonPlan.pendingSeasons),
			streamaMediaId: request.streamaMediaId || null,
		},
		active: (plan && plan.active) || null,
		jobIntents,
		plannedVsActual: {
			requestedEpisodes: requested,
			deliveredEpisodes: delivered,
			plannedNeverDelivered: requested.filter((c) => !deliveredSet.has(c)),
			deliveredNotPlanned: delivered.filter((c) => !requested.includes(c)),
			stillRemaining: remaining,
			wholeSeasonQueuedWithGapPlan: wholeSeasonQueued.map((j) => ({
				jobId: j.jobId,
				seasons: j.seasons,
			})),
		},
	}
}

// ---------------------------------------------------------------------------
// Jobs + downloader evidence
// ---------------------------------------------------------------------------

/**
 * Does anything prove a downloader ever had this job? The portal marks a
 * request "Downloading" the moment a worker claims it, before `rentify add`
 * runs, so the badge alone is not evidence.
 */
function downloaderEvidence(job, artifacts) {
	const ledger = asObject(job.ledger)
	const paths = asObject(ledger.paths)
	const download = asObject(asObject(artifacts).download)
	const reasons = []
	if (job.infoHash) reasons.push("job.infoHash")
	if (ledger.infoHash) reasons.push("ledger.infoHash")
	if (asArray(paths.download).length) reasons.push("ledger.paths.download")
	if (asArray(download.files).length) reasons.push("artifacts.download.files")
	if (download.torrentName) reasons.push("artifacts.download.torrentName")
	if (job.progressPct != null && job.progressPct > 0) reasons.push("progressPct>0")
	return { hasEvidence: reasons.length > 0, reasons }
}

function buildJobs(jobs, artifacts) {
	return jobs.map((job) => {
		const evidence = downloaderEvidence(job, artifacts)
		return {
			jobId: job.id,
			requestId: job.requestId,
			mediaType: job.mediaType || null,
			folderName: job.folderName || null,
			folderTmdbId: tmdbFromFolder(job.folderName),
			sourceUrl: job.sourceUrl || null,
			infoHash: job.infoHash || null,
			claimStatus: job.claimStatus,
			claimedBy: job.claimedBy || null,
			claimedAt: job.claimedAt || null,
			leaseUntil: job.leaseUntil || null,
			leaseExpired: !!(
				job.leaseUntil &&
				ACTIVE_CLAIM_STATUSES.has(job.claimStatus) &&
				new Date(job.leaseUntil).getTime() < Date.now()
			),
			stage: job.stage || null,
			stageLabel: status.stageLabel(job.stage),
			progressPct: job.progressPct,
			etaSeconds: job.etaSeconds,
			seasons: asArray(job.seasons),
			detail: asObject(job.detail),
			ledger: asObject(job.ledger),
			downloaderEvidence: evidence,
			createdAt: job.createdAt,
			updatedAt: job.updatedAt,
		}
	})
}

// ---------------------------------------------------------------------------
// Encode + subtitle inventory
// ---------------------------------------------------------------------------

/**
 * Per-stage file lists with subtitles bucketed by language, plus any embedded
 * track / hardsub decisions the encoder reported. This is where "no subs on
 * English shows" and "Russian never uploaded" become visible: video files
 * present at upload with an empty subtitle bucket.
 */
function buildEncode(artifacts, events) {
	const stages = {}
	for (const stage of ARTIFACT_STAGES) {
		const bucket = asObject(asObject(artifacts)[stage])
		const files = asArray(bucket.files)
		const declaredSubs = asArray(bucket.subtitles)
		// Subtitles can arrive either in `subtitles` or mixed into `files`.
		const subs = subtitlesByLanguage([...declaredSubs, ...files])
		stages[stage] = {
			folderName: bucket.folderName || null,
			torrentName: bucket.torrentName || null,
			videoFiles: files
				.filter((f) => (f.kind || "video") === "video")
				.map((f) => ({ name: f.name, bytes: f.bytes != null ? f.bytes : null })),
			videoCount: files.filter((f) => (f.kind || "video") === "video").length,
			subtitleCount: subs.count,
			subtitlesByLanguage: subs.languages,
			subtitleLanguages: Object.keys(subs.languages).sort(),
			subtitlesUnknownLanguage: subs.unknown,
		}
	}

	// Encoder-side decisions the worker posts in progress detail.
	const encodeEvents = events
		.filter((e) => {
			const payload = asObject(e.payload)
			return (
				payload.embeddedSubtitles != null ||
				payload.hardsub != null ||
				payload.audioLanguage != null ||
				payload.subtitleSkip != null
			)
		})
		.map((e) => {
			const payload = asObject(e.payload)
			return {
				at: e.createdAt,
				type: e.type,
				audioLanguage: payload.audioLanguage || null,
				hardsub: payload.hardsub != null ? payload.hardsub : null,
				embeddedSubtitles: payload.embeddedSubtitles || null,
				subtitleSkip: payload.subtitleSkip || null,
			}
		})

	const subtitleEvents = events
		.filter((e) => String(e.type || "").startsWith("subtitle_"))
		.map((e) => ({ at: e.createdAt, type: e.type, ...asObject(e.payload) }))

	return {
		stages,
		// Reported by the encoder when it probes the source container. Empty
		// means we never learned which tracks existed, which is itself a gap.
		embeddedTrackReports: encodeEvents,
		subtitleEvents,
		failures: events
			.filter((e) => e.type === "failed")
			.map((e) => ({ at: e.createdAt, ...asObject(e.payload) })),
	}
}

// ---------------------------------------------------------------------------
// Sortify / Streama / highlights
// ---------------------------------------------------------------------------

/**
 * Identity comparison across the split: the portal's folder `tmdb{id}` vs the
 * `apiId` Streama's matcher assigned (filename -> TMDB search first hit). A
 * mismatch is the wrong-media bug.
 */
function buildSortifyStreama(request, events, identity, remoteSortify) {
	const highlightEvents = events
		.filter((e) => e.type === "highlighted" || e.type === "highlight")
		.map((e) => ({ at: e.createdAt, actor: e.actor, ...asObject(e.payload) }))
	const registerEvents = events
		.filter((e) =>
			["registering", "pending_approval", "available", "already_in_library", "sorting", "deferred"].includes(
				e.type
			)
		)
		.map((e) => ({ at: e.createdAt, type: e.type, actor: e.actor, ...asObject(e.payload) }))

	// apiId the agents reported, from whichever event carried it. The agent
	// route whitelists top-level payload fields, so `detail` is where the
	// sortify bridge can add anything new without a portal route change.
	const reportedApiIds = [
		...new Set(
			events
				.map((e) => asObject(e.payload))
				.map(
					(p) =>
						p.apiId ||
						p.streamaApiId ||
						asObject(p.match).apiId ||
						asObject(p.detail).apiId ||
						asObject(asObject(p.detail).match).apiId
				)
				.filter((v) => v != null)
				.map(String)
		),
	]

	// Streama returns 201 on a new highlight row and 409 when one already
	// exists, but the bridge treats both as success. When it reports which it
	// was, "created" is a real row and "already_exists" is a re-run over an
	// existing one -- that distinction is the only way to count rows without
	// querying Streama directly.
	const highlightStatuses = highlightEvents
		.map((h) => asObject(h.detail).highlightStatus || h.highlightStatus)
		.filter(Boolean)
		.map(String)
	const createdFromEvents = highlightStatuses.filter((s) => s === "created").length

	const remoteSortifyOk = Boolean(remoteSortify && remoteSortify.status === "ok")
	const remote = asObject(remoteSortify && remoteSortify.data)
	const remoteHighlights = asArray(remote.highlights)
	const remoteMatch = asObject(remote.match)

	const folderTmdb = identity.folderTmdbIds[0] || String(request.id)
	const matcherApiId =
		(remoteMatch.apiId != null ? String(remoteMatch.apiId) : null) ||
		reportedApiIds[0] ||
		null

	return {
		streamaMediaId: request.streamaMediaId || null,
		streamaVideoId: request.streamaVideoId || null,
		highlightedAt: request.highlightedAt || null,
		matchIdentity: {
			folderTmdbId: folderTmdb,
			matcherApiId,
			matcherTitle: remoteMatch.title || null,
			matcherMediaType: remoteMatch.mediaType || null,
			// null = unknown (agent not reachable / never reported), not "ok".
			matches:
				matcherApiId == null ? null : String(matcherApiId) === String(folderTmdb),
			reportedApiIds,
		},
		highlights: {
			// Streama only 409s on (media + videoToPlay), so a second highlight
			// for another episode of the same show is allowed today.
			//
			// rowCount is the only authoritative count. Event count is NOT a row
			// count: the sortify bridge posts `highlighted` on a 409 too, because
			// it treats "already highlighted" as success. Three re-runs of one
			// title therefore emit three events over a single Streama row.
			rowCount: remoteSortifyOk
				? remoteHighlights.length
				: highlightStatuses.length
				? createdFromEvents
				: null,
			eventCount: highlightEvents.length,
			countSource: remoteSortifyOk
				? "agent"
				: highlightStatuses.length
				? "highlight_status"
				: "events",
			statuses: highlightStatuses,
			rows: remoteHighlights,
			events: highlightEvents,
			distinctVideoIds: [
				...new Set(
					[
						...remoteHighlights.map((h) => asObject(h.videoToPlay).id || h.videoId),
						...highlightEvents.map(
							(h) => asObject(h.detail).videoToPlayId || h.streamaVideoId
						),
					]
						.filter((v) => v != null)
						.map(String)
				),
			],
		},
		registerEvents,
		subify: remote.subify || null,
		history: remote.history || null,
	}
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

function flag(code, severity, message, detail) {
	return { code, severity, message, detail: detail === undefined ? null : detail }
}

/**
 * The known recurrence patterns, checked explicitly so a trace says what is
 * wrong instead of leaving it to be spotted by eye.
 */
function buildSubtitleAcquire(events, jobs) {
	const attempts = events
		.filter((e) => e.type === "acquiring_subtitles")
		.map((e) => {
			const payload = asObject(e.payload)
			const detail = asObject(payload.detail)
			const acquire = asObject(detail.subtitleAcquire)
			return {
				at: e.createdAt,
				trigger: acquire.trigger || null,
				video: acquire.video || null,
				tmdbId: acquire.tmdbId || null,
				languages: asObject(acquire.languages),
			}
		})
		.filter((a) => a.video || Object.keys(a.languages).length)
	if (!attempts.length) {
		for (const job of asArray(jobs)) {
			const acquire = asObject(asObject(job.detail).subtitleAcquire)
			const languages = asObject(acquire.languages)
			if (!acquire.video && !Object.keys(languages).length) continue
			attempts.push({
				at: job.updatedAt || job.createdAt || null,
				trigger: acquire.trigger || null,
				video: acquire.video || null,
				tmdbId: acquire.tmdbId || null,
				languages,
			})
		}
	}
	return { attempts, latest: attempts[0] || null }
}

function buildFlags({ request, identity, magnetLookup, fetchPlan, jobs, encode, sortifyStreama, subtitleAcquire }) {
	const flags = []
	const stage = request.pipelineStage

	// 1. Portal claims download work with nothing to back it.
	if (DOWNLOAD_CLAIM_STAGES.has(stage)) {
		const activeJobs = jobs.filter((j) => ACTIVE_CLAIM_STATUSES.has(j.claimStatus))
		const withEvidence = activeJobs.filter((j) => j.downloaderEvidence.hasEvidence)
		if (activeJobs.length === 0) {
			flags.push(
				flag(
					"download_stage_without_active_job",
					"error",
					`Request stage is "${stage}" (shows as ${status.stageLabel(stage)}) but no job is ready/claimed/in_progress.`,
					{ stage, jobCount: jobs.length }
				)
			)
		} else if (withEvidence.length === 0) {
			flags.push(
				flag(
					"download_stage_without_downloader_evidence",
					"error",
					`Request shows ${status.stageLabel(stage)} but no job has an infoHash, downloaded file, or progress. The portal marks "claimed" as Downloading before rentify add runs.`,
					{
						stage,
						jobs: activeJobs.map((j) => ({
							jobId: j.jobId,
							claimStatus: j.claimStatus,
							stage: j.stage,
							claimedBy: j.claimedBy,
							infoHash: j.infoHash,
						})),
					}
				)
			)
		}
	}

	// Lease expired while still holding the job.
	for (const job of jobs.filter((j) => j.leaseExpired)) {
		flags.push(
			flag("job_lease_expired", "warn", `Job ${job.jobId} lease expired while ${job.claimStatus}.`, {
				jobId: job.jobId,
				leaseUntil: job.leaseUntil,
				claimedBy: job.claimedBy,
			})
		)
	}

	// 2. Magnet miss taxonomy.
	if (magnetLookup.autoLookupApplies) {
		if (magnetLookup.searchCount === 0) {
			flags.push(
				flag(
					"magnet_search_not_recorded",
					"info",
					"No magnet_lookup_detail event recorded yet, so a miss cannot be explained. Re-run the lookup to capture search strings.",
					{ magnetLookupStatus: magnetLookup.magnetLookupStatus }
				)
			)
		}
		const latest = magnetLookup.latestSearch
		if (latest && latest.outcome === "not_found") {
			flags.push(
				flag(
					"magnet_reported_not_found",
					"warn",
					`Latest lookup missed: ${latest.missReason || "no reason recorded"}. Only the YTS mirror is searched for movies.`,
					{ missReason: latest.missReason, attempts: asArray(latest.attempts).length }
				)
			)
		}
		if (magnetLookup.storedHashWasExcluded) {
			flags.push(
				flag(
					"stored_magnet_hash_excluded",
					"warn",
					"The stored magnet hash is in the exclude list from a previous failure, so it may be re-queueing a known-bad source.",
					{ magnetHash: magnetLookup.magnetHash }
				)
			)
		}
	}

	// 3. Identity split: folder tmdb vs Streama matcher apiId.
	const match = sortifyStreama.matchIdentity
	if (match.matches === false) {
		flags.push(
			flag(
				"tmdb_identity_mismatch",
				"error",
				`Folder tmdb${match.folderTmdbId} does not match the Streama apiId ${match.matcherApiId}${
					match.matcherTitle ? ` (${match.matcherTitle})` : ""
				}. Streama matches by filename TMDB search, not the folder id.`,
				match
			)
		)
	} else if (match.matches === null && request.streamaMediaId) {
		flags.push(
			flag(
				"tmdb_identity_unverified",
				"info",
				"Registered in Streama but no matcher apiId was ever reported, so folder-vs-library identity is unverified.",
				{ streamaMediaId: request.streamaMediaId }
			)
		)
	}

	// 4. Duplicate dashboard highlights.
	const hl = sortifyStreama.highlights
	if (hl.rowCount > 1) {
		flags.push(
			flag(
				"duplicate_dashboard_highlights",
				"error",
				`${hl.rowCount} dashboard highlights exist for this media. Streama only rejects a duplicate when media AND videoToPlay match, so re-runs and new episodes create extra rows.`,
				{ rowCount: hl.rowCount, distinctVideoIds: hl.distinctVideoIds }
			)
		)
	} else if (hl.rowCount === null && hl.eventCount > 1) {
		// Cannot confirm duplicates from events alone: the sortify bridge posts
		// `highlighted` on a 409 as well, so repeats may be one row re-reported.
		flags.push(
			flag(
				"duplicate_highlight_events_unverified",
				"warn",
				`${hl.eventCount} "highlighted" events were posted for this media, but the agent reported no highlight rows, so this cannot be confirmed as duplicate dashboard rows. The sortify bridge posts "highlighted" on a 409 too, so re-runs of a single row look identical to real duplicates from the portal side.`,
				{ eventCount: hl.eventCount }
			)
		)
	}

	// 5 + 6. Subtitle gaps.
	const uploadStage = asObject(encode.stages.upload)
	const encodeStage = asObject(encode.stages.encode)
	const uploadLangs = asArray(uploadStage.subtitleLanguages)
	if (uploadStage.videoCount > 0 && uploadStage.subtitleCount === 0) {
		flags.push(
			flag(
				"no_subtitles_at_upload",
				"error",
				`${uploadStage.videoCount} video file(s) reached upload with zero subtitles. Hardsub only runs for foreign audio and TV jobs never receive a subtitle URL, so English-speaking shows can ship with none.`,
				{ videoCount: uploadStage.videoCount }
			)
		)
	}
	if (uploadStage.videoCount > 0 && uploadLangs.length && !uploadLangs.includes("ru")) {
		const ruUpstream = asObject(magnetLookup.subtitleLanguages).Russian
		flags.push(
			flag(
				"russian_subtitles_absent",
				ruUpstream && ruUpstream.found ? "error" : "warn",
				ruUpstream && ruUpstream.found
					? "Russian subtitles were available upstream but no ru file reached upload. The portal only attaches the English URL."
					: "No Russian subtitles reached upload. Only embedded Russian text tracks are ever extracted; nothing fetches them.",
				{
					uploadLanguages: uploadLangs,
					russianUpstream: ruUpstream || null,
				}
			)
		)
	}
	// Encode produced subs but upload lost them.
	const encodeLangs = asArray(encodeStage.subtitleLanguages)
	const lostLangs = encodeLangs.filter((l) => !uploadLangs.includes(l))
	if (uploadStage.videoCount > 0 && lostLangs.length) {
		flags.push(
			flag(
				"subtitles_lost_between_encode_and_upload",
				"error",
				`Subtitle language(s) ${lostLangs.join(", ")} existed after encode but are missing from upload.`,
				{ encodeLanguages: encodeLangs, uploadLanguages: uploadLangs }
			)
		)
	}
	const acquireAttempts = asArray(subtitleAcquire && subtitleAcquire.attempts)
	const rejectedLangs = []
	for (const attempt of acquireAttempts) {
		const languages = asObject(attempt.languages)
		for (const [language, row] of Object.entries(languages)) {
			if (row && row.status === "rejected") {
				rejectedLangs.push({
					video: attempt.video || null,
					language,
					reason: row.reason || null,
				})
			}
		}
	}
	if (rejectedLangs.length) {
		flags.push(
			flag(
				"subtitle_acquire_rejected",
				"info",
				`OpenSubtitles file(s) were downloaded then discarded by the sync gate (${rejectedLangs.length}).`,
				{ rejected: rejectedLangs }
			)
		)
	}
	const skippedNoVideo = []
	for (const attempt of acquireAttempts) {
		const languages = asObject(attempt.languages)
		for (const [language, row] of Object.entries(languages)) {
			if (row && row.status === "skipped" && row.reason === "no_library_video") {
				skippedNoVideo.push({ language, tmdbId: attempt.tmdbId || null })
			}
		}
	}
	if (skippedNoVideo.length) {
		flags.push(
			flag(
				"subtitle_acquire_no_library_video",
				"error",
				"Add Subtitles found no library video files. Sorted STORAGE folders usually omit tmdb{id}; sortify must resolve paths from Streama.",
				{ skipped: skippedNoVideo }
			)
		)
	}

	if (encode.embeddedTrackReports.length === 0 && uploadStage.videoCount > 0) {
		flags.push(
			flag(
				"embedded_tracks_never_probed",
				"info",
				"No encoder report of embedded subtitle tracks. Bitmap (PGS) tracks are skipped silently, so a show with English subs in the source can still arrive with none.",
				null
			)
		)
	}

	// 7. Fetch plan vs actual.
	const pva = fetchPlan.plannedVsActual
	if (asArray(pva.plannedNeverDelivered).length) {
		flags.push(
			flag(
				"planned_episodes_never_delivered",
				"warn",
				`${pva.plannedNeverDelivered.length} planned episode(s) never appeared in any stage inventory.`,
				{ episodes: pva.plannedNeverDelivered }
			)
		)
	}
	if (asArray(pva.wholeSeasonQueuedWithGapPlan).length && asArray(pva.requestedEpisodes).length) {
		flags.push(
			flag(
				"whole_season_queued_despite_gap_plan",
				"warn",
				"A job was queued by whole season while an episode-level gap plan existed, so the worker may re-fetch episodes already in the library.",
				pva.wholeSeasonQueuedWithGapPlan
			)
		)
	}

	return flags
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Build the full trace for a request.
 *
 * Read-only. Remote agent lookups are best-effort and skipped when
 * `{ includeRemote: false }`.
 *
 * @param {Object} request Sequelize Request row (or plain object)
 * @returns {Promise<Object>} trace document
 */
async function loadPipelineTrace(request, opts = {}) {
	if (!request) return null
	const models = opts.db || db
	const includeRemote = opts.includeRemote !== false
	const row = plain(request)

	const [jobRows, eventRows, plan] = await Promise.all([
		models.PipelineJob.findAll({
			where: { requestId: row.id },
			order: [["createdAt", "ASC"]],
		}),
		models.RequestEvent.findAll({
			where: { requestId: row.id },
			order: [["createdAt", "DESC"]],
			limit: MAX_EVENTS,
		}),
		opts.planView !== undefined
			? Promise.resolve(opts.planView)
			: loadPipelinePlanView(request).catch((err) => {
					console.error("trace: plan view failed:", err.message)
					return null
			  }),
	])

	const jobsPlain = jobRows.map(plain)
	const events = eventRows.map(plain)
	const artifacts = asObject(row.pipelineArtifacts)

	const identity = buildIdentity(row, jobsPlain)
	const magnetLookup = buildMagnetLookup(row, events)
	const fetchPlan = buildFetchPlan(row, plan, jobsPlain, artifacts, events)
	const jobs = buildJobs(jobsPlain, artifacts)
	const encode = buildEncode(artifacts, events)

	let remotePrelanflix = { status: "skipped", reason: "remote lookups disabled" }
	let remoteSortify = { status: "skipped", reason: "remote lookups disabled" }
	if (includeRemote) {
		const folderName = identity.jobFolderNames[0] || identity.expectedFolderName
		;[remotePrelanflix, remoteSortify] = await Promise.all([
			fetchPrelanflixView(folderName, opts).catch((err) => ({
				status: "unreachable",
				error: err.message,
			})),
			fetchSortifyView(
				{
					folderName,
					tmdbId: canonicalTmdbId(row.id) || row.id,
					streamaMediaId: row.streamaMediaId,
				},
				opts
			).catch((err) => ({ status: "unreachable", error: err.message })),
		])
	}

	const sortifyStreama = buildSortifyStreama(row, events, identity, remoteSortify)
	const subtitleAcquire = buildSubtitleAcquire(events, jobsPlain)

	const flags = buildFlags({
		request: row,
		identity,
		magnetLookup,
		fetchPlan,
		jobs,
		encode,
		sortifyStreama,
		subtitleAcquire,
	})

	return {
		// Self-contained by design: paste the whole document into a debug agent
		// and it has identity, every search, inventories and flags in one place.
		schema: "pipeline-trace/1",
		generatedAt: new Date().toISOString(),
		requestId: row.id,
		identity,
		magnetLookup,
		fetchPlan,
		jobs,
		encode,
		sortifyStreama,
		subtitleAcquire,
		flags,
		flagSummary: {
			error: flags.filter((f) => f.severity === "error").length,
			warn: flags.filter((f) => f.severity === "warn").length,
			info: flags.filter((f) => f.severity === "info").length,
		},
		remote: {
			prelanflix: remotePrelanflix,
			sortify: remoteSortify,
		},
		events: events.map((e) => ({
			id: e.id,
			at: e.createdAt,
			actor: e.actor,
			type: e.type,
			jobId: e.jobId || null,
			payload: e.payload || null,
		})),
		eventCount: events.length,
		eventsTruncated: events.length >= MAX_EVENTS,
	}
}

module.exports = {
	MAX_EVENTS,
	loadPipelineTrace,
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
}
