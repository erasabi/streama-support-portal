const { Op } = require("sequelize")
const db = require("../database")
const { runMagnetLookup, promoteOrphanTvSeasonUpdates } = require("./requestPipeline")
const { reapExpiredLeases } = require("./jobs")

// Hourly magnet retry for movies still awaiting a source, plus lease reaping so
// crashed pipeline agents don't hold a job forever. Runs in-process (no extra
// container / cron unit). Uses setInterval rather than node-cron to avoid a new
// dependency; cadence is hourly with small startup jitter.

const HOUR_MS = 60 * 60 * 1000
const LEASE_REAP_MS = 60 * 1000
const BATCH_SIZE = 25

async function runMagnetSweep() {
	try {
		const due = await db.Request.findAll({
			where: {
				mediaType: "movie",
				archivedAt: { [Op.is]: null },
				magnetLookupStatus: { [Op.in]: ["pending", "not_found", "error"] },
			},
			order: [["magnetLookedUpAt", "ASC"]],
			limit: BATCH_SIZE,
		})
		for (const request of due) {
			try {
				await runMagnetLookup(request)
			} catch (err) {
				console.error(`magnet sweep failed for ${request.id}:`, err.message)
			}
		}
		if (due.length) {
			console.log(`magnet sweep: processed ${due.length} request(s)`)
		}
	} catch (err) {
		console.error("magnet sweep error:", err.message)
	}
}

function start() {
	// Stagger the first run so a boot storm doesn't hammer TMDB/YTS.
	const jitter = Math.floor(Math.random() * 30000)
	setTimeout(() => {
		promoteOrphanTvSeasonUpdates().catch((err) =>
			console.error("tv season update backfill:", err.message)
		)
		runMagnetSweep()
		setInterval(runMagnetSweep, HOUR_MS)
	}, jitter)

	setInterval(() => {
		reapExpiredLeases().catch((err) =>
			console.error("lease reap error:", err.message)
		)
	}, LEASE_REAP_MS)

	console.log("portal poller started (hourly magnet sweep + lease reaper)")
}

module.exports = { start, runMagnetSweep }
