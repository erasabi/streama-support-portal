/* eslint-disable react/prop-types */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { blue, green, grey, orange, red } from '@mui/material/colors'
import { dryRunRequest, getDryRun, listDryRuns } from '/src/api'

const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 }

const VERDICT_TEXT = {
	would_succeed: 'Would succeed',
	would_proceed_with_warnings: 'Would proceed, with warnings',
	would_fail: 'Would fail'
}

const POLL_MS = 2000
const POLL_FOR_MS = 180000

function isPiratifyPending(report) {
	return !!(report && report.piratify && report.piratify.status === 'pending')
}

function formatElapsed(ms) {
	const secs = Math.max(0, Math.floor(ms / 1000))
	const m = Math.floor(secs / 60)
	const s = String(secs % 60).padStart(2, '0')
	return `${m}:${s}`
}

function StageRow({ label, state, detail }) {
	return (
		<li className={`dr-stage dr-${state}`}>
			<span className="dr-dot" aria-hidden="true" />
			<div>
				<p className="dr-stage-label">{label}</p>
				<p className="dr-stage-detail">{detail}</p>
			</div>
		</li>
	)
}

function sourceStage(report) {
	if (report.magnetSearch) {
		const m = report.magnetSearch
		if (m.status === 'found') {
			return {
				state: 'ok',
				detail: `Source found${m.magnetQuality ? ` (${m.magnetQuality})` : ''}${
					m.imdbId ? ` · ${m.imdbId}` : ''
				}`
			}
		}
		const miss = m.search && m.search.missReason
		return {
			state: 'bad',
			detail: `No source: ${miss || m.status}`
		}
	}
	if (report.piratify) {
		const p = report.piratify
		if (p.status === 'skipped') {
			return {
				state: 'ok',
				detail: p.reason || 'portal would not send piratify a job'
			}
		}
		if (p.status === 'pending') {
			return {
				state: 'waiting',
				detail: p.reason || 'Waiting on Prelanflix worker (next 1-min tick)…'
			}
		}
		if (p.status === 'unavailable') {
			return {
				state: 'warn',
				detail: p.reason || 'Prelanflix worker did not finish the piratify dry-run in time'
			}
		}
		if (p.status === 'error') {
			return { state: 'bad', detail: p.error || 'piratify lookup failed' }
		}
		const selected = (p.selected || []).length
		if (!selected) return { state: 'bad', detail: 'piratify selected 0 torrents' }
		return {
			state: (p.missing || []).length ? 'warn' : 'ok',
			detail: `${selected} torrent(s) selected${
				(p.missing || []).length ? `, ${p.missing.length} episode(s) unresolved` : ''
			}`
		}
	}
	return { state: 'unknown', detail: 'not evaluated' }
}

function subtitleStage(report) {
	if (isPiratifyPending(report)) {
		return {
			state: 'waiting',
			detail: 'Waiting for Prelanflix source lookup before subtitle forecast'
		}
	}
	const f = report.subtitleForecast || {}
	const attach = f.wouldAttach || []
	if (!attach.length) {
		if (report.piratify && report.piratify.status === 'skipped') {
			return { state: 'skipped', detail: 'No download job, so no subtitle attach to forecast' }
		}
		if (report.piratify) {
			return {
				state: 'warn',
				detail:
					'Known gap, not a dry-run failure: TV jobs never get a subtitle URL. Subs only appear if the torrent or later subify provides them.'
			}
		}
		return { state: 'bad', detail: 'No subtitles would be attached' }
	}
	const langs = attach.map((a) => a.language).join(', ')
	const ru = (f.upstreamIndex || {}).Russian
	if (ru && ru.availableUpstream && !attach.some((a) => a.language === 'ru')) {
		return {
			state: 'warn',
			detail: `Would attach: ${langs}. Russian exists upstream but is dropped.`
		}
	}
	return { state: 'ok', detail: `Would attach: ${langs}` }
}

function joinNums(arr) {
	return (arr || []).length ? arr.join(', ') : 'none'
}

function fetchPlanStage(report) {
	const p = report.fetchPlan
	if (!p) return null
	if (p.libraryUncertain) {
		return {
			state: 'bad',
			detail: `Streama lookup ${p.libraryStatus} — portal would not enqueue (fail closed)`
		}
	}
	if (!p.wouldEnqueueJob) {
		return {
			state: 'ok',
			detail: p.pendingSeasons.length
				? `Nothing auto-queued. Needs approval: season ${joinNums(p.pendingSeasons)}. Already in library: ${joinNums(p.presentSeasons)}.`
				: `Nothing to fetch. In Streama: ${joinNums(p.presentSeasons)} (complete: ${joinNums(p.completeSeasons)}).`
		}
	}
	return {
		state: p.pendingSeasons.length ? 'warn' : 'ok',
		detail: `Would send piratify ${p.missingEpisodes.length} episode(s) in season(s) ${joinNums(p.autoSeasons)}${
			p.pendingSeasons.length ? ` · approval needed: ${joinNums(p.pendingSeasons)}` : ''
		}`
	}
}

function FetchPlanBlock({ plan }) {
	if (!plan) return null
	const missing = plan.missingEpisodes || []
	return (
		<>
			<p className="dr-subhead">Portal would tell piratify</p>
			<p className="dr-note">{plan.note}</p>
			<dl className="dr-dl">
				<dt>Already in Streama</dt>
				<dd>seasons {joinNums(plan.presentSeasons)} · complete {joinNums(plan.completeSeasons)}</dd>
				<dt>Auto-queue seasons</dt>
				<dd>{joinNums(plan.autoSeasons)}</dd>
				<dt>Needs admin approval</dt>
				<dd>{joinNums(plan.pendingSeasons)}</dd>
				<dt>Episode codes (missing[])</dt>
				<dd className="dr-break">
					{missing.length ? missing.join(', ') : 'none — worker would not get --episodes'}
				</dd>
				<dt>Fetch New Seasons</dt>
				<dd>{plan.fetchMissing ? 'yes (every incomplete aired season)' : 'no (new-request bookends)'}</dd>
			</dl>
			{plan.workerCommand && (
				<code className="dr-code">{plan.workerCommand.join(' ')}</code>
			)}
		</>
	)
}

function encodeStage(report) {
	if (isPiratifyPending(report)) {
		return {
			state: 'waiting',
			detail: 'Waiting for a selected torrent before encode can be forecast'
		}
	}
	const enc = report.encodeForecast || {}
	if (!enc.torrentName) {
		return {
			state: 'skipped',
			detail: 'Skipped — no torrent was selected, so encode cannot be forecast.'
		}
	}
	const bitmapSkip = (enc.expectedSubtitleSources || []).some((s) =>
		String(s.confidence || '').includes('SKIPPED')
	)
	return {
		state: bitmapSkip ? 'warn' : 'ok',
		detail: `${enc.audioLanguageGuess}; hardsub ${
			enc.hardsubLikely ? 'likely' : 'not expected'
		} (${enc.confidence} confidence)`
	}
}

function streamaStage(report) {
	const s = report.streamaMatch || {}
	if (s.matches === true) {
		return { state: 'ok', detail: `Would register under tmdb${s.folderTmdbId}` }
	}
	if (s.matches === false) {
		return {
			state: 'bad',
			detail: `Would register under apiId ${s.matcherApiId}${
				s.matcherTitle ? ` (${s.matcherTitle})` : ''
			} — wrong media`
		}
	}
	const lib = s.libraryCheck || {}
	if (lib.status === 'found') {
		return {
			state: 'warn',
			detail: `Already in Streama (id ${lib.streamaId}). Filename matcher still unverified.`
		}
	}
	if (lib.status === 'missing') {
		return {
			state: 'ok',
			detail: 'Not in Streama yet. Filename matcher still unverified at register time.'
		}
	}
	return {
		state: 'skipped',
		detail: s.reason || 'Filename match cannot be checked from the portal'
	}
}

function highlightStage(report) {
	const h = report.highlightForecast || {}
	if (h.outcome === 'new_highlight') {
		return { state: 'ok', detail: 'Would create one dashboard highlight' }
	}
	if (h.outcome === 'likely_duplicate') {
		return { state: 'bad', detail: h.reason }
	}
	if (h.outcome === 'likely_409_treated_as_success') {
		return { state: 'ok', detail: 'Existing highlight would 409 (treated as success)' }
	}
	return {
		state: 'skipped',
		detail: h.reason || 'Highlight rows cannot be listed from the portal'
	}
}

function formatWhen(iso) {
	if (!iso) return 'unknown time'
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return String(iso)
	return date.toLocaleString()
}

function HistoryList({ items, activeId, onOpen }) {
	if (!items || !items.length) return null
	return (
		<div className="dr-history">
			<p className="dr-subhead">Saved dry runs</p>
			<ul>
				{items.map((item) => {
					const active = item.id === activeId
					const verdict = VERDICT_TEXT[item.verdict] || item.verdict || item.status
					return (
						<li key={item.id}>
							<button
								type="button"
								className={`dr-history-item${active ? ' is-active' : ''}`}
								onClick={() => onOpen(item.id)}
							>
								<span className="dr-history-when">{formatWhen(item.createdAt)}</span>
								<span className="dr-history-verdict">
									{verdict}
									{item.pending ? ' · pending' : ''}
								</span>
							</button>
						</li>
					)
				})}
			</ul>
		</div>
	)
}

function CopyBar({ report, waiting, copied, onCopy }) {
	if (!report) return null
	const incomplete = waiting || isPiratifyPending(report)
	return (
		<div className="dr-copy">
			<button type="button" className="dr-btn" onClick={onCopy}>
				{copied ? 'Copied!' : incomplete ? 'Copy for agent (incomplete)' : 'Copy for agent'}
			</button>
			<p className="dr-note">
				Markdown briefing plus the full JSON — paste into a debug agent.
			</p>
		</div>
	)
}

function WaitBanner({ elapsedMs, reason, started }) {
	return (
		<div className="dr-wait" role="status" aria-live="polite" aria-busy="true">
			<span className="dr-spinner" aria-hidden="true" />
			<div>
				<p className="dr-wait-title">
					{started ? 'Waiting for Prelanflix' : 'Starting dry run'}
				</p>
				<p className="dr-wait-detail">
					{started
						? reason ||
						  'Fetch plan is ready. Source lookup (piratify --dry-run) runs on the next worker tick, about every 1 minute. Nothing is queued.'
						: 'Sending the title to the portal for a rehearsal lookup.'}
				</p>
				{started && (
					<p className="dr-wait-elapsed">
						Elapsed {formatElapsed(elapsedMs)} · polling every 2s · typically
						under 1 min, up to 3 min
					</p>
				)}
			</div>
		</div>
	)
}

function ReportBody({ report, waiting }) {
	const flags = [...(report.flags || [])]
		.filter((f) => !(waiting && f.code === 'waiting_on_prelanflix'))
		.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))

	return (
		<>
			{!waiting && (
				<p className={`dr-verdict dr-verdict-${report.verdict}`}>
					{VERDICT_TEXT[report.verdict] || report.verdict}
				</p>
			)}
			<p className="dr-note">
				TV: first the portal diffs Streama vs aired episodes, then Prelanflix
				runs piratify --dry-run on the next worker tick (nothing is queued).
				Movies look up YTS here. Orange is a known pipeline gap. Red is a real
				miss.
			</p>
			<ul className="dr-stages">
				{fetchPlanStage(report) && (
					<StageRow label="Fetch plan" {...fetchPlanStage(report)} />
				)}
				<StageRow label="Source" {...sourceStage(report)} />
				<StageRow label="Subtitles" {...subtitleStage(report)} />
				<StageRow label="Encode" {...encodeStage(report)} />
				<StageRow label="Streama match" {...streamaStage(report)} />
				<StageRow label="Dashboard highlight" {...highlightStage(report)} />
			</ul>

			<FetchPlanBlock plan={report.fetchPlan} />

			<dl className="dr-dl">
				<dt>Folder name</dt>
				<dd className="dr-break">{report.expectedFolderName}</dd>
			</dl>

			{report.piratify && (report.piratify.selected || []).length > 0 && (
				<>
					<p className="dr-subhead">Piratify selected</p>
					<ul className="dr-flags">
						{(report.piratify.selected || []).slice(0, 8).map((t, i) => (
							<li key={i}>
								<div>
									<p className="flag-code">{t.name || t.info_hash || 'torrent'}</p>
									<p className="flag-msg">
										{[
											t.quality && `${t.quality}p`,
											t.seeders != null && `${t.seeders} seeders`,
											t.kind
										]
											.filter(Boolean)
											.join(' · ')}
									</p>
								</div>
							</li>
						))}
					</ul>
				</>
			)}

			{report.piratify && (report.piratify.searchQueries || []).length > 0 && (
				<>
					<p className="dr-subhead">Search strings</p>
					<ul className="dr-flags">
						{(report.piratify.searchQueries || []).slice(0, 20).map((q, i) => (
							<li key={i}>
								<div>
									<p className="flag-code">{q.query || q}</p>
									<p className="flag-msg">
										{q.result_count != null ? `${q.result_count} results` : ''}
										{q.indexer_cat ? ` · cat ${q.indexer_cat}` : ''}
									</p>
								</div>
							</li>
						))}
					</ul>
				</>
			)}

			{report.piratify && report.piratify.ranOn === 'prelanflix' && (
				<p className="dr-note">
					Lookup ran on Prelanflix (piratify --dry-run, no torrent queued).
				</p>
			)}

			{report.piratify &&
				report.piratify.command &&
				!(report.fetchPlan && report.fetchPlan.workerCommand) && (
				<>
					<p className="dr-subhead">Reproduce on the box</p>
					<code className="dr-code">{report.piratify.command.join(' ')}</code>
				</>
			)}

			{flags.length > 0 && (
				<>
					<p className="dr-subhead">Findings</p>
					<ul className="dr-flags">
						{flags.map((f, i) => (
							<li key={`${f.code}-${i}`} className={`flag-${f.severity}`}>
								<span className="flag-badge">{f.severity}</span>
								<div>
									<p className="flag-code">{f.code}</p>
									<p className="flag-msg">{f.message}</p>
								</div>
							</li>
						))}
					</ul>
				</>
			)}
		</>
	)
}

/**
 * Admin-only rehearsal. `getInput` returns the request shape to test, so the
 * same panel serves a new submission and an existing stuck request.
 *
 * When `onClose` is set the panel is a dialog: header close, footer Close,
 * and Escape. `autoRun` starts the lookup as soon as it mounts.
 */
export default function DryRunPanel({
	getInput,
	user,
	label = 'Dry Run',
	heading,
	autoRun = false,
	onClose
}) {
	const [report, setReport] = useState(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState(null)
	const [elapsedMs, setElapsedMs] = useState(0)
	const [history, setHistory] = useState([])
	const [copied, setCopied] = useState(false)
	const pollGen = useRef(0)
	const waitStarted = useRef(null)
	const isDialog = typeof onClose === 'function'
	const waiting = loading && isPiratifyPending(report)
	const starting = loading && !report && !error

	const refreshHistory = useCallback(async () => {
		const input = typeof getInput === 'function' ? getInput() : getInput
		if (!input || (!input.tmdbId && !input.requestId)) return
		try {
			const data = await listDryRuns(
				{ tmdbId: input.tmdbId, requestId: input.requestId },
				user
			)
			setHistory((data && data.dryRuns) || [])
		} catch (err) {
			// History is optional; a failed list should not block the rehearsal.
		}
	}, [getInput, user])

	const pollUntilDone = useCallback(
		async (start, gen) => {
			let next = start
			const ticketId = next.ticketId || (next.piratify && next.piratify.ticketId)
			if (isPiratifyPending(next)) {
				waitStarted.current = Date.now()
			}
			const deadline = Date.now() + POLL_FOR_MS
			while (
				ticketId &&
				next.piratify &&
				next.piratify.status === 'pending' &&
				Date.now() < deadline
			) {
				await new Promise((resolve) => setTimeout(resolve, POLL_MS))
				if (gen !== pollGen.current) return
				next = await getDryRun(ticketId, user)
				if (gen !== pollGen.current) return
				setReport(next)
			}
		},
		[user]
	)

	const run = useCallback(async () => {
		const gen = ++pollGen.current
		waitStarted.current = null
		setElapsedMs(0)
		setLoading(true)
		setError(null)
		try {
			const input = typeof getInput === 'function' ? getInput() : getInput
			if (!input || !input.tmdbId) {
				setError('No TMDB id available to test')
				return
			}
			let next = await dryRunRequest(input, user)
			if (gen !== pollGen.current) return
			setReport(next)
			await refreshHistory()
			await pollUntilDone(next, gen)
			if (gen === pollGen.current) await refreshHistory()
		} catch (err) {
			if (gen !== pollGen.current) return
			setError(err?.response?.data?.error || err?.message || 'dry run failed')
		} finally {
			if (gen === pollGen.current) setLoading(false)
		}
	}, [getInput, user, pollUntilDone, refreshHistory])

	const loadSaved = useCallback(
		async (id) => {
			const gen = ++pollGen.current
			waitStarted.current = null
			setElapsedMs(0)
			setLoading(true)
			setError(null)
			try {
				let next = await getDryRun(id, user)
				if (gen !== pollGen.current) return
				setReport(next)
				if (isPiratifyPending(next)) {
					await pollUntilDone(next, gen)
				}
			} catch (err) {
				if (gen !== pollGen.current) return
				setError(err?.response?.data?.error || err?.message || 'could not load saved dry run')
			} finally {
				if (gen === pollGen.current) setLoading(false)
			}
		},
		[user, pollUntilDone]
	)

	const copyForAgent = useCallback(async () => {
		if (!report) return
		const { agentText, ...rest } = report
		const text = agentText || JSON.stringify(rest, null, 2)
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		} catch (err) {
			setError('copy failed: ' + err.message)
		}
	}, [report])

	useEffect(() => {
		refreshHistory()
		if (autoRun) run()
		return () => {
			pollGen.current += 1
		}
		// Start once on mount when autoRun is set; closing cancels in-flight polls.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoRun])

	useEffect(() => {
		if (!waiting) return undefined
		const tick = () => {
			setElapsedMs(Date.now() - (waitStarted.current || Date.now()))
		}
		tick()
		const id = setInterval(tick, 500)
		return () => clearInterval(id)
	}, [waiting])

	useEffect(() => {
		if (!isDialog) return undefined
		function onKey(event) {
			if (event.key !== 'Escape') return
			event.preventDefault()
			event.stopPropagation()
			onClose()
		}
		document.addEventListener('keydown', onKey, true)
		return () => document.removeEventListener('keydown', onKey, true)
	}, [isDialog, onClose])

	const title = heading || label
	const runLabel = loading
		? waiting
			? 'Waiting on Prelanflix…'
			: 'Running…'
		: report
		? `Re-run ${label}`
		: label
	const activeId = (report && report.ticketId) || (report && report.piratify && report.piratify.ticketId)

	return (
		<Panel
			className={isDialog ? 'dr-dialog' : ''}
			role={isDialog ? 'dialog' : undefined}
			aria-modal={isDialog ? 'true' : undefined}
			aria-labelledby={isDialog ? 'dry-run-title' : undefined}
		>
			{isDialog && (
				<header className="dr-dialog-head">
					<div>
						<h2 id="dry-run-title" className="dr-dialog-title">
							{title}
						</h2>
						<p className="dr-note">Creates nothing — lookup and checks only</p>
					</div>
					<button
						type="button"
						className="dr-close"
						onClick={onClose}
						aria-label="Close dry run"
					>
						×
					</button>
				</header>
			)}

			{!isDialog && (
				<div className="dr-actions">
					<button type="button" className="dr-btn" onClick={run} disabled={loading}>
						{runLabel}
					</button>
					{report && (
						<button type="button" className="dr-btn" onClick={copyForAgent}>
							{copied ? 'Copied!' : 'Copy for agent'}
						</button>
					)}
					<span className="dr-note">Creates nothing — lookup and checks only</span>
				</div>
			)}

			<div className="dr-body">
				<HistoryList items={history} activeId={activeId} onOpen={loadSaved} />

				{(starting || waiting) && (
					<WaitBanner
						elapsedMs={elapsedMs}
						started={waiting}
						reason={report && report.piratify && report.piratify.reason}
					/>
				)}

				{error && <p className="dr-error">{error}</p>}

				{report && <ReportBody report={report} waiting={waiting} />}

				<CopyBar report={report} waiting={waiting} copied={copied} onCopy={copyForAgent} />
			</div>

			{isDialog && (
				<footer className="dr-dialog-foot">
					<span className="dr-note">Esc or click outside also closes</span>
					<button
						type="button"
						className="dr-btn"
						onClick={copyForAgent}
						disabled={!report}
					>
						{copied ? 'Copied!' : 'Copy for agent'}
					</button>
					<button
						type="button"
						className="dr-btn"
						onClick={run}
						disabled={loading}
					>
						{runLabel}
					</button>
					<button type="button" className="dr-btn dr-btn-close" onClick={onClose}>
						Close
					</button>
				</footer>
			)}
		</Panel>
	)
}

const Panel = styled.div`
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-height: 0;
	width: 100%;

	&.dr-dialog {
		flex: 1 1 auto;
		gap: 12px;
		max-height: 100%;
	}

	.dr-dialog-head {
		align-items: flex-start;
		display: flex;
		flex-shrink: 0;
		gap: 12px;
		justify-content: space-between;
	}

	.dr-dialog-title {
		color: white;
		font-size: 18px;
		font-weight: 600;
		margin: 0 0 4px;
	}

	.dr-close {
		align-items: center;
		background: ${grey[800]};
		border: 1px solid ${grey[600]};
		border-radius: 6px;
		color: white;
		cursor: pointer;
		display: inline-flex;
		flex-shrink: 0;
		font-size: 22px;
		height: 36px;
		justify-content: center;
		line-height: 1;
		width: 36px;

		&:hover {
			background: ${grey[700]};
		}
	}

	.dr-body {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		padding-right: 4px;
		user-select: text;
	}

	.dr-dialog-foot {
		align-items: center;
		border-top: 1px solid ${grey[800]};
		display: flex;
		flex-shrink: 0;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
		padding-top: 12px;

		.dr-note {
			margin-right: auto;
		}
	}

	.dr-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.dr-copy {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding-top: 4px;
	}

	.dr-history {
		display: flex;
		flex-direction: column;
		gap: 6px;

		ul {
			display: flex;
			flex-direction: column;
			gap: 4px;
			list-style: none;
			margin: 0;
			padding: 0;
		}
	}

	.dr-history-item {
		align-items: baseline;
		background: ${grey[900]};
		border: 1px solid ${grey[800]};
		border-radius: 4px;
		color: white;
		cursor: pointer;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 6px 8px;
		text-align: left;
		width: 100%;

		&:hover {
			background: ${grey[800]};
		}

		&.is-active {
			border-color: ${blue[600]};
			background: rgba(33, 150, 243, 0.12);
		}
	}

	.dr-history-when {
		color: ${grey[300]};
		font-size: 11px;
	}

	.dr-history-verdict {
		color: ${grey[400]};
		font-size: 11px;
	}

	.dr-btn {
		background: ${grey[800]};
		border: 1px solid ${grey[700]};
		border-radius: 4px;
		color: white;
		cursor: pointer;
		font-size: 12px;
		padding: 8px 12px;

		&:hover:not(:disabled) {
			background: ${grey[700]};
		}
		&:disabled {
			cursor: default;
			opacity: 0.6;
		}
	}

	.dr-btn-close {
		background: ${blue[700]};
		border-color: ${blue[600]};
		font-weight: 600;
		min-width: 88px;

		&:hover:not(:disabled) {
			background: ${blue[600]};
		}
	}

	.dr-note,
	.dr-stage-detail {
		color: ${grey[400]};
		font-size: 11px;
		margin: 0;
	}

	.dr-error {
		color: ${red[300]};
		font-size: 12px;
		margin: 0;
	}

	.dr-wait {
		align-items: flex-start;
		background: rgba(33, 150, 243, 0.12);
		border: 1px solid ${blue[800]};
		border-radius: 8px;
		display: flex;
		gap: 12px;
		padding: 12px;
	}

	.dr-wait-title {
		color: ${blue[100]};
		font-size: 14px;
		font-weight: 600;
		margin: 0 0 4px;
	}

	.dr-wait-detail,
	.dr-wait-elapsed {
		color: ${blue[200]};
		font-size: 12px;
		margin: 0;
	}

	.dr-wait-elapsed {
		margin-top: 6px;
	}

	.dr-spinner {
		animation: dr-spin 0.9s linear infinite;
		border: 2px solid ${blue[900]};
		border-radius: 50%;
		border-top-color: ${blue[200]};
		flex-shrink: 0;
		height: 18px;
		margin-top: 2px;
		width: 18px;
	}

	@keyframes dr-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.dr-verdict {
		font-size: 13px;
		font-weight: 600;
		margin: 0;
	}
	.dr-verdict-would_succeed {
		color: ${green[300]};
	}
	.dr-verdict-would_proceed_with_warnings {
		color: ${orange[300]};
	}
	.dr-verdict-would_fail {
		color: ${red[300]};
	}

	.dr-stages {
		display: flex;
		flex-direction: column;
		gap: 6px;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.dr-stage {
		display: flex;
		gap: 8px;
	}

	.dr-dot {
		border-radius: 50%;
		flex-shrink: 0;
		height: 8px;
		margin-top: 4px;
		width: 8px;
	}
	.dr-ok .dr-dot {
		background: ${green[400]};
	}
	.dr-warn .dr-dot {
		background: ${orange[400]};
	}
	.dr-bad .dr-dot {
		background: ${red[400]};
	}
	.dr-waiting .dr-dot {
		animation: dr-pulse 1.2s ease-in-out infinite;
		background: ${blue[400]};
	}
	.dr-unknown .dr-dot,
	.dr-skipped .dr-dot {
		background: transparent;
		border: 2px solid ${grey[500]};
		box-sizing: border-box;
	}

	@keyframes dr-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.25;
		}
	}

	.dr-stage-label {
		color: white;
		font-size: 12px;
		font-weight: 600;
		margin: 0;
	}

	.dr-subhead {
		color: ${grey[300]};
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		margin: 0;
		text-transform: uppercase;
	}

	.dr-dl {
		display: grid;
		gap: 3px 10px;
		grid-template-columns: max-content 1fr;
		margin: 0;

		dt {
			color: ${grey[400]};
			font-size: 12px;
		}
		dd {
			color: white;
			font-size: 12px;
			margin: 0;
		}
	}

	.dr-break {
		word-break: break-all;
	}

	.dr-code {
		background: #1b1a1a;
		border: 1px solid ${grey[800]};
		border-radius: 4px;
		color: ${blue[100]};
		display: block;
		font-size: 11px;
		padding: 6px 8px;
		word-break: break-all;
	}

	.dr-flags {
		display: flex;
		flex-direction: column;
		gap: 6px;
		list-style: none;
		margin: 0;
		padding: 0;

		li {
			display: flex;
			gap: 8px;
		}
	}

	.flag-badge {
		border-radius: 10px;
		flex-shrink: 0;
		font-size: 10px;
		font-weight: 600;
		height: fit-content;
		letter-spacing: 0.3px;
		padding: 2px 8px;
		text-transform: uppercase;
	}
	.flag-error .flag-badge {
		background: #d61f1f33;
		color: ${red[200]};
	}
	.flag-warn .flag-badge {
		background: #c76a0033;
		color: ${orange[200]};
	}
	.flag-info .flag-badge {
		background: #1f6fd633;
		color: ${blue[200]};
	}

	.flag-code {
		color: white;
		font-size: 12px;
		font-weight: 600;
		margin: 0;
	}

	.flag-msg {
		color: ${grey[400]};
		font-size: 12px;
		margin: 0;
	}
`
