const db = require("../database")

/**
 * Append a single immutable history event. This is the ONLY place that writes
 * to RequestEvents. Events are never updated or deleted.
 *
 * @param {Object} opts
 * @param {string} opts.requestId
 * @param {string} [opts.jobId]
 * @param {string} [opts.actor] user | admin | portal | pipeline | sortify
 * @param {string} opts.type   short machine event name (e.g. "magnet_found")
 * @param {Object} [opts.payload]
 */
async function appendEvent({ requestId, jobId, actor = "portal", type, payload }) {
	if (!type) throw new Error("appendEvent requires a type")
	try {
		return await db.RequestEvent.create({
			requestId: requestId || null,
			jobId: jobId || null,
			actor,
			type,
			payload: payload || null,
		})
	} catch (err) {
		// History must never break the primary flow, but surface the failure.
		console.error("appendEvent failed:", err.message)
		return null
	}
}

function isUnchangedEvent(last, type, actor) {
	return !!(last && last.type === type && last.actor === actor)
}

/**
 * Append a stage/progress event only if it differs from the most recent event
 * for the same request. Prevents repeated heartbeat stages (e.g. many
 * "downloading" ticks) from flooding the timeline while still recording real
 * transitions. Payload-only changes are intentionally NOT timeline-worthy.
 */
async function appendEventIfChanged({ requestId, jobId, actor = "portal", type, payload }) {
	if (!type) throw new Error("appendEventIfChanged requires a type")
	try {
		if (requestId) {
			const last = await db.RequestEvent.findOne({
				where: { requestId },
				order: [
					["createdAt", "DESC"],
					["id", "DESC"],
				],
			})
			if (isUnchangedEvent(last, type, actor)) {
				return null
			}
		}
	} catch (err) {
		// If the dedupe read fails, fall through and still record the event.
		console.error("appendEventIfChanged read failed:", err.message)
	}
	return appendEvent({ requestId, jobId, actor, type, payload })
}

module.exports = { appendEvent, appendEventIfChanged, isUnchangedEvent }
