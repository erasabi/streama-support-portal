// Queue a TV indexer lookup on Prelanflix. The portal never runs piratify.
//
// portal-worker claims a PipelineDryRun row and runs
// `piratify add --dry-run --json` (rentify add is skipped). This file only
// creates the ticket. The admin UI polls; the HTTP request does not wait
// for the worker (nginx 504s if it does).

const db = require("../database")

const DEFAULT_WAIT_MS = 170000
const POLL_MS = 500

function sleep(ms, deps) {
	const wait = deps.sleep || ((t) => new Promise((r) => setTimeout(r, t)))
	return wait(ms)
}

function commandFromInput(input = {}) {
	const folderName = input.folderName || "folder"
	const title = String(input.title || "").trim()
	const year = input.year ? String(input.year) : ""
	const episodes = Array.isArray(input.episodes) ? input.episodes : []
	const seasons = Array.isArray(input.seasons) ? input.seasons : []
	return [
		"piratify",
		"add",
		"--dry-run",
		"--json",
		"-f",
		folderName,
		...(episodes.length ? ["--episodes", episodes.join(",")] : []),
		...(!episodes.length && seasons.length ? ["--seasons", seasons.join(",")] : []),
		...(year ? ["--year", year] : []),
		title,
	]
}

function fromRow(row, command) {
	if (!row) {
		return { status: "error", error: "dry-run ticket disappeared", command }
	}
	if (row.status === "done") {
		const result = row.result && typeof row.result === "object" ? row.result : {}
		return {
			status: "ok",
			ticketId: row.id,
			command,
			selected: result.selected || [],
			missing: result.missing || [],
			rejected: result.rejected || [],
			qualityWarning: result.qualityWarning || null,
			searchQueries: result.searchQueries || [],
			winningQueries: result.winningQueries || [],
			exitCode: result.exitCode,
			raw: result,
			ranOn: "prelanflix",
		}
	}
	if (row.status === "failed") {
		return {
			status: "error",
			ticketId: row.id,
			command,
			error: row.error || "piratify dry-run failed on Prelanflix",
			ranOn: "prelanflix",
		}
	}
	return {
		status: "pending",
		ticketId: row.id,
		command,
		ranOn: "prelanflix",
		workerStatus: row.status,
		reason: `Waiting on Prelanflix (status=${row.status}). portal-worker claims dry-runs on the next tick.`,
	}
}

/**
 * Create a ticket for portal-worker. Does not wait unless deps.wait is true
 * (nginx 504s if the portal holds the request for the 1-min worker tick).
 */
async function runPiratifyOnPrelanflix(input = {}, deps = {}) {
	const command = commandFromInput(input)
	const models = deps.db || db
	const wait = deps.wait === true
	const waitMs = deps.timeoutMs || Number(process.env.PIRATIFY_DRY_RUN_WAIT_MS) || DEFAULT_WAIT_MS
	const pollMs = deps.pollMs || POLL_MS
	const nowFn = deps.now || (() => Date.now())

	const row = await models.PipelineDryRun.create({
		status: "ready",
		tmdbId: input.tmdbId ? String(input.tmdbId) : null,
		mediaType: input.mediaType || "tv",
		requestId: input.requestId ? String(input.requestId) : null,
		payload: {
			folderName: input.folderName || null,
			title: input.title || null,
			year: input.year || null,
			episodes: input.episodes || [],
			seasons: input.seasons || [],
			tmdbId: input.tmdbId || null,
			requestId: input.requestId || null,
		},
	})

	if (!wait) {
		return {
			status: "pending",
			ticketId: row.id,
			command,
			ranOn: "prelanflix",
			reason: "Waiting on Prelanflix. portal-worker claims dry-runs on the next tick.",
		}
	}

	const deadline = nowFn() + waitMs
	while (nowFn() < deadline) {
		const latest = await models.PipelineDryRun.findByPk(row.id)
		if (latest && (latest.status === "done" || latest.status === "failed")) {
			return fromRow(latest, command)
		}
		await sleep(pollMs, deps)
	}
	const latest = await models.PipelineDryRun.findByPk(row.id)
	if (latest && (latest.status === "done" || latest.status === "failed")) {
		return fromRow(latest, command)
	}
	return {
		status: "unavailable",
		ticketId: row.id,
		command,
		ranOn: "prelanflix",
		reason: `Prelanflix worker did not finish (status=${latest ? latest.status : "missing"}). It claims dry-runs on the next portal-worker tick.`,
	}
}

async function loadPiratifyTicket(id, deps = {}) {
	const models = deps.db || db
	const row = await models.PipelineDryRun.findByPk(id)
	if (!row) return null
	const command = commandFromInput(row.payload || {})
	return { row, piratify: fromRow(row, command) }
}

module.exports = {
	DEFAULT_WAIT_MS,
	commandFromInput,
	fromRow,
	loadPiratifyTicket,
	runPiratifyOnPrelanflix,
	runPiratifyResolve: runPiratifyOnPrelanflix,
}
