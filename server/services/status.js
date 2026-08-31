// Central mapping of pipeline stages to user-facing labels + display rules.
// This is the single source of truth for how a request's status is shown.

const { shouldDisplayNotYetAvailable } = require("./availability")

// Alternative "no source" outcomes — not a progression. Streama fail-closed
// must not permanently upgrade Not Yet Available to Check Manually.
const SOURCE_MISS_STAGES = new Set(["not_yet_available", "needs_manual_check"])

// Derived pipeline stages, in monotonically increasing order. The order is
// used to (a) render the stepper and (b) avoid regressing a request to an
// earlier stage from a late/out-of-order event.
const STAGE_ORDER = [
	"requested",
	"looking_up_magnet",
	"not_yet_available",
	"needs_manual_check",
	"season_approval",
	"magnet_ready",
	"claimed",
	"downloading",
	"encoding",
	"ready_to_sync",
	"syncing",
	"uploaded",
	"sorting",
	"deferred",
	"registering",
	"pending_approval",
	"available",
]

const STAGE_LABELS = {
	requested: "Requested",
	looking_up_magnet: "Finding source",
	not_yet_available: "Not Yet Available",
	needs_manual_check: "Check Manually",
	season_approval: "Approve Seasons",
	magnet_ready: "Queued",
	claimed: "Downloading",
	downloading: "Downloading",
	encoding: "Encoding",
	ready_to_sync: "Uploading",
	syncing: "Uploading",
	uploaded: "Arrived",
	sorting: "Sorting",
	deferred: "Needs attention",
	registering: "Adding to library",
	// Approval is fully automated now; treat it as still "adding to library"
	// rather than a distinct user-facing gate.
	pending_approval: "Adding to library",
	available: "Available",
	failed: "Failed",
	archived: "Archived",
}

// Admin-set labels that take precedence over derived stages when
// queueStatusSource === "admin".
const ADMIN_LABELS = [
	"Unavailable",
	"Rolling Episodes",
	"Complete Collection",
	"Request Update",
	"Report Issue",
	"Not Yet Available",
	"Check Manually",
]

// "failed" can happen at any point and is not part of the linear order.
const TERMINAL_FAILED = "failed"

function stageIndex(stage) {
	return STAGE_ORDER.indexOf(stage)
}

function stageLabel(stage) {
	return STAGE_LABELS[stage] || stage || "Requested"
}

/**
 * Whether a new stage should overwrite the currently stored stage. Prevents
 * out-of-order/late pipeline events from regressing progress, while always
 * allowing a move to "failed" and always allowing recovery out of "failed".
 */
function shouldAdvance(currentStage, nextStage) {
	if (!nextStage) return false
	if (nextStage === currentStage) return true
	if (nextStage === TERMINAL_FAILED) return true
	if (currentStage === TERMINAL_FAILED) return true // allow retry recovery
	if (SOURCE_MISS_STAGES.has(currentStage) && SOURCE_MISS_STAGES.has(nextStage)) {
		return true
	}
	const cur = stageIndex(currentStage)
	const next = stageIndex(nextStage)
	if (next === -1) return false
	if (cur === -1) return true
	return next >= cur
}

// Sortify posts uploaded/available per promoted file. Incremental TV sync
// registers one episode while rentify is still downloading/encoding the rest.
const SORTIFY_COMPLETION_STAGES = new Set([
	"uploaded",
	"sorting",
	"deferred",
	"registering",
	"pending_approval",
	"available",
])

const RENTIFY_IN_FLIGHT_STAGES = new Set([
	"claimed",
	"downloading",
	"encoding",
	"ready_to_sync",
	"syncing",
])

/**
 * Like shouldAdvance, but rentify in-flight stages may recover a request that
 * sortify already marked Arrived/Available from a single episode.
 */
function shouldApplyDerivedStage(currentStage, nextStage) {
	if (shouldAdvance(currentStage, nextStage)) return true
	if (
		SORTIFY_COMPLETION_STAGES.has(currentStage) &&
		(RENTIFY_IN_FLIGHT_STAGES.has(nextStage) || nextStage === "magnet_ready")
	) {
		return true
	}
	return false
}

/**
 * Compute the user-facing status label for a request row, honoring an admin
 * override.
 */
function noTorrentsDetail(detail) {
	if (!detail || typeof detail !== "object") return false
	const err = detail.error || (detail.detail && detail.detail.error) || ""
	return /0 torrent\(s\) selected|no torrents were added/i.test(String(err))
}

const ACTIVE_PIPELINE = new Set([
	"claimed",
	"downloading",
	"encoding",
	"ready_to_sync",
	"syncing",
	"sorting",
	"registering",
])

function hasPendingSeasons(request) {
	const raw = request && request.pendingSeasons
	return Array.isArray(raw) && raw.length > 0
}

function displayStatus(request, now = new Date()) {
	if (!request) return "Requested"
	// Archived is terminal for display and wins over everything else.
	if (request.archivedAt) return "Archived"
	const isAdminOverride =
		request.queueStatusSource === "admin" &&
		ADMIN_LABELS.includes(request.queueStatus)
	if (isAdminOverride) return request.queueStatus
	if (
		hasPendingSeasons(request) &&
		!ACTIVE_PIPELINE.has(request.pipelineStage)
	) {
		return STAGE_LABELS.season_approval
	}
	if (request.pipelineStage === "needs_manual_check") {
		if (shouldDisplayNotYetAvailable(request, now)) {
			return STAGE_LABELS.not_yet_available
		}
		return STAGE_LABELS.needs_manual_check
	}
	if (request.pipelineStage === "not_yet_available") {
		return STAGE_LABELS.not_yet_available
	}
	// Legacy rows: piratify posted `failed` with a zero-torrent error before
	// we classified unreleased vs released. Only unreleased titles stay NYA.
	if (
		request.pipelineStage === TERMINAL_FAILED &&
		noTorrentsDetail(request.pipelineStageDetail)
	) {
		if (shouldDisplayNotYetAvailable(request, now)) {
			return STAGE_LABELS.not_yet_available
		}
		return STAGE_LABELS.needs_manual_check
	}
	if (request.pipelineStage === TERMINAL_FAILED) return "Failed"
	if (request.pipelineStage) return stageLabel(request.pipelineStage)
	// Fall back to whatever was set on the row (legacy / update-issue rows).
	return request.queueStatus || "Requested"
}

module.exports = {
	STAGE_ORDER,
	STAGE_LABELS,
	ADMIN_LABELS,
	SOURCE_MISS_STAGES,
	TERMINAL_FAILED,
	stageIndex,
	stageLabel,
	shouldAdvance,
	shouldApplyDerivedStage,
	SORTIFY_COMPLETION_STAGES,
	RENTIFY_IN_FLIGHT_STAGES,
	displayStatus,
	noTorrentsDetail,
	hasPendingSeasons,
}
