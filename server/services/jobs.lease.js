// Lease / stall policy for pipeline jobs. Pure helpers so we can unit-test
// TTLs without a database.

const DEFAULT_LEASE_MS = 5 * 60 * 1000 // 5 minutes

const STUCK_DOWNLOAD_MS =
	Number(process.env.LEASE_STUCK_DOWNLOAD_MS) || 6 * 60 * 60 * 1000
const STUCK_ENCODE_MS =
	Number(process.env.LEASE_STUCK_ENCODE_MS) || 2 * 60 * 60 * 1000

// Stages at/after which a torrent may already be downloading in uTorrent.
// Reclaiming these to "ready" risks a double `rentify add`.
const PAST_DOWNLOAD = new Set([
	"downloading",
	"encoding",
	"ready_to_sync",
	"syncing",
	"uploaded",
	"sorting",
	"acquiring_subtitles",
	"registering",
	"pending_approval",
])

function stuckTtlMs(stage) {
	if (stage === "downloading") return STUCK_DOWNLOAD_MS
	return STUCK_ENCODE_MS
}

/**
 * After the worker stops heartbeating, the first reap records stalledSince.
 * Later reaps fail the job once the stage TTL has elapsed.
 */
function shouldFailStalledLease(stage, stalledSince, now = Date.now()) {
	if (!stalledSince) return false
	const start = new Date(stalledSince).getTime()
	if (!Number.isFinite(start)) return false
	return now - start >= stuckTtlMs(stage)
}

module.exports = {
	DEFAULT_LEASE_MS,
	STUCK_DOWNLOAD_MS,
	STUCK_ENCODE_MS,
	PAST_DOWNLOAD,
	stuckTtlMs,
	shouldFailStalledLease,
}
