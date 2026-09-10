// Markdown + JSON dump of a pipeline dry-run. Meant to be pasted into a
// debug agent: the briefing is the context, the JSON is the full evidence.

const VERDICT_TEXT = {
	would_succeed: "Would succeed",
	would_proceed_with_warnings: "Would proceed, with warnings",
	would_fail: "Would fail",
}

function withoutAgentText(report) {
	if (!report || typeof report !== "object") return report
	const { agentText, ...rest } = report
	return rest
}

function joinNums(arr) {
	return Array.isArray(arr) && arr.length ? arr.join(", ") : "none"
}

function sourceLine(report) {
	if (report.magnetSearch) {
		const m = report.magnetSearch
		if (m.status === "found") {
			return `found${m.magnetQuality ? ` (${m.magnetQuality})` : ""}${
				m.imdbId ? ` · ${m.imdbId}` : ""
			}`
		}
		const miss = m.search && m.search.missReason
		return `no source: ${miss || m.status}`
	}
	const p = report.piratify
	if (!p) return "not evaluated"
	if (p.status === "skipped") return p.reason || "portal would not send piratify a job"
	if (p.status === "pending") return p.reason || "waiting on Prelanflix worker"
	if (p.status === "unavailable") return p.reason || "Prelanflix worker did not finish in time"
	if (p.status === "error") return p.error || "piratify lookup failed"
	const selected = (p.selected || []).length
	if (!selected) return "piratify selected 0 torrents"
	const missing = (p.missing || []).length
	return `${selected} torrent(s) selected${missing ? `, ${missing} episode(s) unresolved` : ""}`
}

function subtitleLine(report) {
	const f = report.subtitleForecast || {}
	const attach = f.wouldAttach || []
	if (report.piratify && report.piratify.status === "pending") {
		return "waiting for source lookup"
	}
	if (!attach.length) {
		if (report.piratify && report.piratify.status === "skipped") {
			return "no download job, so no subtitle attach to forecast"
		}
		if (report.piratify) {
			return "TV jobs never get a subtitle URL; subs only if the torrent or later subify provides them"
		}
		return "no subtitles would be attached"
	}
	return `would attach: ${attach.map((a) => a.language).join(", ")}`
}

function fetchPlanLine(plan) {
	if (!plan) return null
	if (plan.libraryUncertain) {
		return `Streama lookup ${plan.libraryStatus} — portal would not enqueue (fail closed)`
	}
	if (!plan.wouldEnqueueJob) {
		return plan.pendingSeasons && plan.pendingSeasons.length
			? `nothing auto-queued; approval needed: season ${joinNums(plan.pendingSeasons)}`
			: `nothing to fetch; in Streama: ${joinNums(plan.presentSeasons)}`
	}
	return `would send piratify ${(plan.missingEpisodes || []).length} episode(s) in season(s) ${joinNums(
		plan.autoSeasons
	)}`
}

function encodeLine(report) {
	if (report.piratify && report.piratify.status === "pending") {
		return "waiting for a selected torrent"
	}
	const enc = report.encodeForecast || {}
	if (!enc.torrentName) return "skipped — no torrent selected"
	return `${enc.audioLanguageGuess || "audio unknown"}; hardsub ${
		enc.hardsubLikely ? "likely" : "not expected"
	} (${enc.confidence || "unknown"} confidence)`
}

function streamaLine(report) {
	const s = report.streamaMatch || {}
	if (s.matches === true) return `would register under tmdb${s.folderTmdbId}`
	if (s.matches === false) {
		return `would register under apiId ${s.matcherApiId}${
			s.matcherTitle ? ` (${s.matcherTitle})` : ""
		} — wrong media`
	}
	const lib = s.libraryCheck || {}
	if (lib.status === "found") {
		return `already in Streama (id ${lib.streamaId}); filename matcher still unverified`
	}
	if (lib.status === "missing") {
		return "not in Streama yet; filename matcher still unverified at register time"
	}
	return s.reason || "filename match cannot be checked from the portal"
}

function highlightLine(report) {
	const h = report.highlightForecast || {}
	if (h.outcome === "new_highlight") return "would create one dashboard highlight"
	if (h.outcome === "likely_duplicate") return h.reason || "likely duplicate highlight"
	if (h.outcome === "likely_409_treated_as_success") {
		return "existing highlight would 409 (treated as success)"
	}
	return h.reason || "highlight rows cannot be listed from the portal"
}

function bulletList(items) {
	return items.map((line) => `- ${line}`).join("\n")
}

/**
 * Build a paste-ready briefing for a debug agent.
 * @param {Object} report pipeline-dry-run/1 document
 * @returns {string}
 */
function formatDryRunForAgent(report) {
	if (!report || typeof report !== "object") return ""
	const doc = withoutAgentText(report)
	const input = doc.input || {}
	const pending = !!(doc.piratify && doc.piratify.status === "pending")
	const lines = []

	lines.push("# Pipeline dry-run")
	lines.push("")
	lines.push("Rehearsal only — no Request, PipelineJob, or torrent was created.")
	lines.push(`schema: ${doc.schema || "pipeline-dry-run/1"}`)
	if (doc.generatedAt) lines.push(`generatedAt: ${doc.generatedAt}`)
	if (doc.ticketId) lines.push(`ticketId: ${doc.ticketId}`)
	lines.push(`verdict: ${VERDICT_TEXT[doc.verdict] || doc.verdict || (pending ? "pending" : "unknown")}`)
	lines.push("")

	const title = input.title || "(untitled)"
	const year = input.year ? ` (${input.year})` : ""
	const mediaType = input.mediaType || "unknown"
	const tmdbId = input.tmdbId || "?"
	lines.push("## Title")
	lines.push(`${title}${year} · ${mediaType} · tmdb${tmdbId}`)
	if (doc.expectedFolderName) lines.push(`folder: ${doc.expectedFolderName}`)
	if (input.requestId && String(input.requestId) !== String(tmdbId)) {
		lines.push(`requestId: ${input.requestId}`)
	}
	if (pending) {
		lines.push("")
		lines.push(
			"Status: incomplete — waiting on Prelanflix `piratify add --dry-run`. Fetch plan below is still valid."
		)
	}
	lines.push("")

	lines.push("## Stages")
	const stages = []
	const fetch = fetchPlanLine(doc.fetchPlan)
	if (fetch) stages.push(`Fetch plan: ${fetch}`)
	stages.push(`Source: ${sourceLine(doc)}`)
	stages.push(`Subtitles: ${subtitleLine(doc)}`)
	stages.push(`Encode: ${encodeLine(doc)}`)
	stages.push(`Streama match: ${streamaLine(doc)}`)
	stages.push(`Dashboard highlight: ${highlightLine(doc)}`)
	lines.push(bulletList(stages))
	lines.push("")

	const plan = doc.fetchPlan
	if (plan) {
		lines.push("## Fetch plan")
		if (plan.note) lines.push(plan.note)
		lines.push(`- Already in Streama: seasons ${joinNums(plan.presentSeasons)} · complete ${joinNums(plan.completeSeasons)}`)
		lines.push(`- Auto-queue seasons: ${joinNums(plan.autoSeasons)}`)
		lines.push(`- Needs admin approval: ${joinNums(plan.pendingSeasons)}`)
		lines.push(
			`- missing[]: ${
				plan.missingEpisodes && plan.missingEpisodes.length
					? plan.missingEpisodes.join(", ")
					: "none — worker would not get --episodes"
			}`
		)
		lines.push(
			`- Fetch New Seasons: ${plan.fetchMissing ? "yes (every incomplete aired season)" : "no (new-request bookends)"}`
		)
		if (plan.workerCommand && plan.workerCommand.length) {
			lines.push(`- Worker command: \`${plan.workerCommand.join(" ")}\``)
		}
		lines.push("")
	}

	const selected = (doc.piratify && doc.piratify.selected) || []
	if (selected.length) {
		lines.push("## Piratify selected")
		lines.push(
			bulletList(
				selected.slice(0, 12).map((t) => {
					const bits = [
						t.name || t.info_hash || "torrent",
						t.quality && `${t.quality}p`,
						t.seeders != null && `${t.seeders} seeders`,
						t.kind,
					].filter(Boolean)
					return bits.join(" · ")
				})
			)
		)
		lines.push("")
	}

	const queries = (doc.piratify && doc.piratify.searchQueries) || []
	if (queries.length) {
		lines.push("## Search strings")
		lines.push(
			bulletList(
				queries.slice(0, 30).map((q) => {
					const query = typeof q === "string" ? q : q.query || JSON.stringify(q)
					const extra = []
					if (q && q.result_count != null) extra.push(`${q.result_count} results`)
					if (q && q.indexer_cat) extra.push(`cat ${q.indexer_cat}`)
					return extra.length ? `${query} (${extra.join(" · ")})` : query
				})
			)
		)
		lines.push("")
	}

	const command = (plan && plan.workerCommand) || (doc.piratify && doc.piratify.command)
	if (command && command.length && !(plan && plan.workerCommand)) {
		lines.push("## Reproduce on the box")
		lines.push(`\`${command.join(" ")}\``)
		lines.push("")
	}

	const flags = Array.isArray(doc.flags) ? doc.flags : []
	if (flags.length) {
		lines.push("## Findings")
		lines.push(
			bulletList(
				flags.map((f) => {
					const msg = f.message ? `: ${f.message}` : ""
					return `${f.severity || "info"} \`${f.code}\`${msg}`
				})
			)
		)
		lines.push("")
	} else if (!pending) {
		lines.push("## Findings")
		lines.push("None.")
		lines.push("")
	}

	lines.push("## Full report JSON")
	lines.push("```json")
	try {
		lines.push(JSON.stringify(doc, null, 2))
	} catch (err) {
		lines.push(`{"ok":false,"error":"could not serialize report: ${err.message}"}`)
	}
	lines.push("```")
	lines.push("")
	return lines.join("\n")
}

module.exports = {
	formatDryRunForAgent,
	withoutAgentText,
	VERDICT_TEXT,
}
