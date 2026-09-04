const db = require("../database")
const { isTvMedia, normalizeSeasons } = require("./tvSeasons")

function asObject(value) {
	return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

function asStringArray(value) {
	if (!Array.isArray(value)) return []
	return value
		.map((item) => String(item == null ? "" : item).trim())
		.filter(Boolean)
}

function asEpisodeCodes(value) {
	return asStringArray(value)
		.map((c) => c.toUpperCase())
		.filter((c) => /^S\d+E\d+$/.test(c))
}

function jobFetchMode(job) {
	if (job.sourceUrl) return "magnet"
	const detail = asObject(job.detail)
	const missing = asEpisodeCodes(detail.missing)
	if (missing.length) return "episodes"
	if (Array.isArray(job.seasons) && job.seasons.length) return "seasons_legacy"
	return "unknown"
}

function jobRemainingMissing(job) {
	if (["completed", "cancelled", "failed"].includes(job.claimStatus)) return []
	const ledger = asObject(job.ledger)
	const detail = asObject(job.detail)
	const fromLedger = asEpisodeCodes(ledger.missing)
	if (fromLedger.length) return fromLedger
	const leftover = asEpisodeCodes(detail.leftoverMissing)
	if (leftover.length) return leftover
	return asEpisodeCodes(detail.missing)
}

function summarizeJob(job) {
	const detail = asObject(job.detail)
	const plannedMissing = asEpisodeCodes(detail.missing)
	return {
		id: job.id,
		claimStatus: job.claimStatus,
		stage: job.stage,
		folderName: job.folderName,
		fetchMode: jobFetchMode(job),
		seasons: normalizeSeasons(job.seasons),
		plannedMissing,
		remainingMissing: jobRemainingMissing(job),
		hasSourceUrl: !!job.sourceUrl,
		claimedBy: job.claimedBy || null,
		updatedAt: job.updatedAt,
		createdAt: job.createdAt,
	}
}

function seasonPlanFromEvent(event) {
	if (!event || event.type !== "season_plan") return null
	const payload = asObject(event.payload)
	return {
		at: event.createdAt,
		libraryStatus: payload.libraryStatus || null,
		autoSeasons: normalizeSeasons(payload.auto) || [],
		pendingSeasons: normalizeSeasons(payload.pending) || [],
		presentSeasons: normalizeSeasons(payload.present) || [],
		completeSeasons: normalizeSeasons(payload.complete) || [],
		plannedMissing: asEpisodeCodes(payload.missing),
	}
}

function activeJobsSummary(jobs) {
	const active = jobs.filter((j) =>
		["ready", "claimed", "in_progress"].includes(j.claimStatus)
	)
	const planned = []
	const remaining = []
	for (const job of active) {
		planned.push(...asEpisodeCodes(asObject(job.detail).missing))
		remaining.push(...jobRemainingMissing(job))
	}
	return {
		count: active.length,
		plannedMissing: [...new Set(planned)].sort(),
		remainingMissing: [...new Set(remaining)].sort(),
	}
}

/**
 * Build a read-only snapshot of what the portal planned / queued for a request.
 * Used on GET /requests/:id for admins (and owners with magnet access).
 */
async function loadPipelinePlanView(request) {
	if (!request) return null
	const requestId = request.id
	const [seasonPlanEvent, jobRows] = await Promise.all([
		db.RequestEvent.findOne({
			where: { requestId, type: "season_plan" },
			order: [["createdAt", "DESC"]],
		}),
		db.PipelineJob.findAll({
			where: { requestId },
			order: [["updatedAt", "DESC"]],
			limit: 25,
		}),
	])

	const jobs = jobRows.map(summarizeJob)
	const seasonPlan = seasonPlanFromEvent(seasonPlanEvent)
	const pendingSeasons = normalizeSeasons(request.pendingSeasons) || []
	const tv = isTvMedia(request.mediaType)

	let headline = null
	if (!tv) {
		headline = jobs.some((j) => j.hasSourceUrl)
			? "Movie magnet queued for rentify"
			: jobs.length
				? "Pipeline job queued"
				: "No active pipeline job"
	} else if (seasonPlan && seasonPlan.plannedMissing.length) {
		headline = `${seasonPlan.plannedMissing.length} episode(s) planned from Streama diff`
	} else if (activeJobsSummary(jobRows).remainingMissing.length) {
		headline = `${activeJobsSummary(jobRows).remainingMissing.length} episode(s) still to fetch`
	} else if (pendingSeasons.length) {
		headline = `Seasons awaiting approval: S${pendingSeasons.map((n) => String(n).padStart(2, "0")).join(", S")}`
	} else {
		headline = "No episode plan recorded yet"
	}

	return {
		headline,
		mediaType: request.mediaType,
		pendingSeasons,
		seasonPlan,
		active: activeJobsSummary(jobRows),
		jobs,
	}
}

module.exports = {
	loadPipelinePlanView,
	summarizeJob,
	seasonPlanFromEvent,
	jobFetchMode,
	jobRemainingMissing,
}
