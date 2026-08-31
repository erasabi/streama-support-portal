let express = require("express")
let router = express.Router()
const { Op } = require("sequelize")
let db = require("../database")
const { adminOnly } = require("../services/auth")
const { appendEvent } = require("../services/events")
const jobs = require("../services/jobs")
const { displayStatus } = require("../services/status")
const { normalizeRequestId } = require("../utils/requestId")

router.use(adminOnly)

// Full history including archived + available, filterable.
router.get("/history", async function (req, res) {
	try {
		const { status, user, mediaType, page = 1, pageSize = 50 } = req.query
		const where = {}
		if (user) where.requestUser = user
		if (mediaType) where.mediaType = mediaType
		if (status) where.queueStatus = status

		const limit = Math.min(parseInt(pageSize, 10) || 50, 200)
		const offset = ((parseInt(page, 10) || 1) - 1) * limit

		const { rows, count } = await db.Request.findAndCountAll({
			where,
			order: [["updatedAt", "DESC"]],
			limit,
			offset,
		})
		res.status(200).json({
			total: count,
			page: parseInt(page, 10) || 1,
			pageSize: limit,
			requests: rows.map((r) => {
				const row = r.toJSON()
				delete row.magnetUrl
				delete row.magnetHash
				delete row.subtitleUrl
				delete row.queueEvents
				delete row.pipelineArtifacts
				return { ...row, displayStatus: displayStatus(row) }
			}),
		})
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

// Unlinked pipeline/sortify activity awaiting an admin to attach or ignore.
router.get("/unlinked-jobs", async function (req, res) {
	try {
		const unlinked = await db.RequestEvent.findAll({
			where: { requestId: { [Op.is]: null }, type: "unlinked_activity" },
			order: [["createdAt", "DESC"]],
			limit: 200,
		})
		// Exclude any that were subsequently linked or ignored.
		const resolved = await db.RequestEvent.findAll({
			where: { type: { [Op.in]: ["unlinked_linked", "unlinked_ignored"] } },
		})
		const handledIds = new Set(
			resolved
				.map((e) => e.payload && e.payload.originalEventId)
				.filter(Boolean)
		)
		res.status(200).json(unlinked.filter((e) => !handledIds.has(e.id)))
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

router.post("/unlinked-jobs/:eventId/link", async function (req, res) {
	try {
		const original = await db.RequestEvent.findByPk(req.params.eventId)
		if (!original) return res.status(404).json({ error: "event not found" })
		const requestId = req.body && req.body.requestId
		if (!requestId) return res.status(400).json({ error: "requestId required" })
		const request = await db.Request.findByPk(normalizeRequestId(requestId))
		if (!request) return res.status(404).json({ error: "request not found" })

		const stage = original.payload && original.payload.stage
		await appendEvent({
			requestId: request.id,
			actor: "admin",
			type: "unlinked_linked",
			payload: {
				originalEventId: original.id,
				stage,
				detail: original.payload && original.payload.detail,
			},
		})
		if (stage) {
			await jobs.applyStageToRequest(request.id, stage, null)
		}
		res.status(200).json({ linked: true, requestId })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

router.post("/unlinked-jobs/:eventId/ignore", async function (req, res) {
	try {
		const original = await db.RequestEvent.findByPk(req.params.eventId)
		if (!original) return res.status(404).json({ error: "event not found" })
		await appendEvent({
			requestId: null,
			actor: "admin",
			type: "unlinked_ignored",
			payload: { originalEventId: original.id },
		})
		res.status(200).json({ ignored: true })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

module.exports = router
