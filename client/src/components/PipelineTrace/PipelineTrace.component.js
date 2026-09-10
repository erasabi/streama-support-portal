/* eslint-disable react/prop-types */
import React, { useCallback, useMemo, useState } from 'react'
import styled from 'styled-components'
import { blue, green, grey, orange, red } from '@mui/material/colors'
import { getRequestTrace } from '/src/api'

const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 }

function Section({ title, subtitle, defaultOpen = false, children }) {
	const [open, setOpen] = useState(defaultOpen)
	return (
		<div className="trace-section">
			<button
				type="button"
				className="trace-section-head"
				onClick={() => setOpen((v) => !v)}
			>
				<span className="trace-caret">{open ? '▾' : '▸'}</span>
				<span className="trace-section-title">{title}</span>
				{subtitle && <span className="trace-section-sub">{subtitle}</span>}
			</button>
			{open && <div className="trace-section-body">{children}</div>}
		</div>
	)
}

function Rows({ items }) {
	const rows = (items || []).filter((row) => row && row.length)
	if (!rows.length) return <p className="trace-muted">Nothing recorded</p>
	return (
		<dl className="trace-dl">
			{rows.map(([label, value]) => (
				<React.Fragment key={label}>
					<dt>{label}</dt>
					<dd>{value == null || value === '' ? '—' : value}</dd>
				</React.Fragment>
			))}
		</dl>
	)
}

function yesNo(value) {
	if (value === true) return 'yes'
	if (value === false) return 'no'
	return 'unknown'
}

function joinList(list) {
	const arr = Array.isArray(list) ? list.filter(Boolean) : []
	return arr.length ? arr.join(', ') : null
}

// --- Magnet lookup ---------------------------------------------------------

function MagnetSection({ magnetLookup }) {
	const m = magnetLookup || {}
	const latest = m.latestSearch
	if (!m.autoLookupApplies) {
		return (
			<Section
				title="Magnet Lookup"
				subtitle="not applicable (TV goes to piratify)"
			>
				<p className="trace-muted">
					TV requests never auto-look up a magnet. Sources come from piratify on
					the box, or an admin-attached URL.
				</p>
				<Rows
					items={[
						['Lookup status', m.magnetLookupStatus],
						['Attached sources', String((m.magnetUrls || []).length)]
					]}
				/>
			</Section>
		)
	}
	return (
		<Section
			title="Magnet Lookup"
			subtitle={`${m.searchCount || 0} recorded search${
				m.searchCount === 1 ? '' : 'es'
			}${latest && latest.outcome ? ` · ${latest.outcome}` : ''}`}
		>
			<Rows
				items={[
					['Lookup status', m.magnetLookupStatus],
					['IMDB id', latest && latest.attempts && (latest.attempts.find((a) => a.imdbId) || {}).imdbId],
					['Quality', m.magnetQuality],
					['Magnet hash', m.magnetHash],
					['Miss reason', latest && latest.missReason],
					[
						'Stored hash excluded',
						m.storedHashWasExcluded ? 'yes — may re-queue a known-bad source' : 'no'
					]
				]}
			/>

			{m.searchCount === 0 && (
				<p className="trace-muted">
					No search log yet. Lookups now record every endpoint they call; re-run
					the lookup to capture it.
				</p>
			)}

			{(m.searches || []).map((search, idx) => (
				<div className="trace-block" key={`${search.startedAt || idx}`}>
					<p className="trace-subhead">
						Search {idx + 1} — {search.outcome || 'unknown'}
						{search.at ? ` · ${new Date(search.at).toLocaleString()}` : ''}
					</p>
					<table className="trace-table">
						<thead>
							<tr>
								<th>Source</th>
								<th>Query / endpoint</th>
								<th>Result</th>
							</tr>
						</thead>
						<tbody>
							{(search.attempts || []).map((a, i) => (
								<tr key={i} className={a.ok ? '' : 'row-bad'}>
									<td>
										{a.source}
										{a.language ? ` (${a.language})` : ''}
									</td>
									<td className="trace-break">{a.query}</td>
									<td>
										{a.error
											? `error: ${a.error}`
											: a.source === 'yts'
											? `movie.id=${a.movieId == null ? '—' : a.movieId}, ${
													a.resultCount || 0
											  } torrent(s)${a.movieTitle ? ` · ${a.movieTitle}` : ''}`
											: a.source === 'yifysubtitles'
											? a.found
												? 'found'
												: 'not found'
											: a.imdbId || (a.found ? 'found' : 'no result')}
									</td>
								</tr>
							))}
						</tbody>
					</table>

					{(search.attempts || []).some((a) => (a.torrents || []).length) && (
						<>
							<p className="trace-subhead">Torrents returned</p>
							<table className="trace-table">
								<thead>
									<tr>
										<th>Quality</th>
										<th>Codec</th>
										<th>Seeds</th>
										<th>Hash</th>
									</tr>
								</thead>
								<tbody>
									{(search.attempts || [])
										.flatMap((a) => a.torrents || [])
										.map((t, i) => {
											const picked =
												search.pick && search.pick.hash === t.hash
											const excluded = (search.excludeHashes || []).includes(
												t.hash
											)
											return (
												<tr
													key={`${t.hash}-${i}`}
													className={picked ? 'row-picked' : excluded ? 'row-bad' : ''}
												>
													<td>
														{t.quality}
														{picked ? ' ← picked' : ''}
														{excluded ? ' (excluded)' : ''}
													</td>
													<td>{t.videoCodec || '—'}</td>
													<td>{t.seeds == null ? '—' : t.seeds}</td>
													<td className="trace-break">{t.hash}</td>
												</tr>
											)
										})}
								</tbody>
							</table>
						</>
					)}

					{search.pick && search.pick.reason && (
						<Rows items={[['Pick reason', search.pick.reason]]} />
					)}

					{search.subtitleLanguages &&
						Object.keys(search.subtitleLanguages).length > 0 && (
							<>
								<p className="trace-subhead">Subtitle index</p>
								<Rows
									items={Object.entries(search.subtitleLanguages).map(
										([lang, row]) => [
											lang,
											row.found
												? `available${row.url ? '' : ' (no url)'}`
												: `not available${row.error ? ` — ${row.error}` : ''}`
										]
									)}
								/>
							</>
						)}
				</div>
			))}
		</Section>
	)
}

// --- Fetch plan ------------------------------------------------------------

function FetchPlanSection({ fetchPlan }) {
	const p = fetchPlan || {}
	const lib = p.libraryState || {}
	const pva = p.plannedVsActual || {}
	return (
		<Section
			title="Fetch Plan"
			subtitle={p.headline || 'what the portal told the downloader to get'}
			defaultOpen
		>
			<p className="trace-subhead">Existing library vs plan</p>
			<Rows
				items={[
					['Library status', lib.libraryStatus],
					['Streama media id', lib.streamaMediaId],
					['Already present (partial)', joinList(lib.presentSeasons)],
					['Complete in library', joinList(lib.completeSeasons)],
					['Auto-queued seasons', joinList(lib.autoSeasons)],
					['Awaiting approval', joinList(lib.pendingSeasons)]
				]}
			/>

			<p className="trace-subhead">Planned vs actual</p>
			<Rows
				items={[
					['Requested episodes', joinList(pva.requestedEpisodes)],
					['Delivered episodes', joinList(pva.deliveredEpisodes)],
					['Planned but never delivered', joinList(pva.plannedNeverDelivered)],
					['Delivered but not planned', joinList(pva.deliveredNotPlanned)],
					['Still remaining', joinList(pva.stillRemaining)]
				]}
			/>

			{(p.jobIntents || []).length > 0 && (
				<>
					<p className="trace-subhead">Per-job fetch intent</p>
					<table className="trace-table">
						<thead>
							<tr>
								<th>Mode</th>
								<th>Status</th>
								<th>Asked for</th>
							</tr>
						</thead>
						<tbody>
							{p.jobIntents.map((j) => (
								<tr key={j.jobId}>
									<td>{j.fetchMode}</td>
									<td>{j.claimStatus}</td>
									<td className="trace-break">
										{j.fetchMode === 'magnet'
											? 'single source url'
											: joinList(j.plannedMissing) ||
											  (j.seasons.length
													? `whole season(s) ${j.seasons.join(', ')}`
													: '—')}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			)}
		</Section>
	)
}

// --- Jobs ------------------------------------------------------------------

function JobsSection({ jobs }) {
	const rows = jobs || []
	return (
		<Section title="Pipeline Jobs" subtitle={`${rows.length} job(s)`}>
			{!rows.length && <p className="trace-muted">No jobs created</p>}
			{rows.map((job) => (
				<div className="trace-block" key={job.jobId}>
					<p className="trace-subhead trace-break">{job.folderName || job.jobId}</p>
					<Rows
						items={[
							['Claim status', job.claimStatus],
							['Stage', `${job.stage || '—'}${job.stageLabel ? ` (${job.stageLabel})` : ''}`],
							['Claimed by', job.claimedBy],
							['Lease', job.leaseExpired ? 'EXPIRED' : job.leaseUntil],
							['Progress', job.progressPct == null ? null : `${job.progressPct}%`],
							['Info hash', job.infoHash],
							['Folder tmdb id', job.folderTmdbId],
							[
								'Downloader evidence',
								job.downloaderEvidence && job.downloaderEvidence.hasEvidence
									? job.downloaderEvidence.reasons.join(', ')
									: 'NONE — nothing proves a downloader ever had this'
							],
							['Last error', job.ledger && job.ledger.lastError]
						]}
					/>
				</div>
			))}
		</Section>
	)
}

// --- Encode + subs ---------------------------------------------------------

function EncodeSection({ encode }) {
	const stages = (encode && encode.stages) || {}
	const order = ['download', 'encode', 'upload']
	return (
		<Section
			title="Encode + Subtitles"
			subtitle="file inventory and subtitle languages per stage"
			defaultOpen
		>
			<table className="trace-table">
				<thead>
					<tr>
						<th>Stage</th>
						<th>Videos</th>
						<th>Subs</th>
						<th>Languages</th>
					</tr>
				</thead>
				<tbody>
					{order.map((key) => {
						const s = stages[key] || {}
						const langs = joinList(s.subtitleLanguages)
						const bad = s.videoCount > 0 && !s.subtitleCount
						return (
							<tr key={key} className={bad ? 'row-bad' : ''}>
								<td>{key}</td>
								<td>{s.videoCount || 0}</td>
								<td>{s.subtitleCount || 0}</td>
								<td>{langs || (s.videoCount ? 'none' : '—')}</td>
							</tr>
						)
					})}
				</tbody>
			</table>

			{order.map((key) => {
				const s = stages[key] || {}
				const byLang = s.subtitlesByLanguage || {}
				const names = Object.entries(byLang)
				if (!names.length && !(s.videoFiles || []).length) return null
				return (
					<div className="trace-block" key={key}>
						<p className="trace-subhead">{key}</p>
						{(s.videoFiles || []).length > 0 && (
							<ul className="trace-files">
								{s.videoFiles.map((f) => (
									<li key={f.name} className="trace-break">
										{f.name}
									</li>
								))}
							</ul>
						)}
						{names.length > 0 && (
							<Rows items={names.map(([lang, files]) => [lang, files.join(', ')])} />
						)}
						{(s.subtitlesUnknownLanguage || []).length > 0 && (
							<Rows
								items={[
									['unknown language', s.subtitlesUnknownLanguage.join(', ')]
								]}
							/>
						)}
					</div>
				)
			})}

			<p className="trace-subhead">Embedded track reports</p>
			{(encode && encode.embeddedTrackReports || []).length ? (
				<table className="trace-table">
					<thead>
						<tr>
							<th>Audio</th>
							<th>Hardsub</th>
							<th>Embedded / skip</th>
						</tr>
					</thead>
					<tbody>
						{encode.embeddedTrackReports.map((r, i) => (
							<tr key={i}>
								<td>{r.audioLanguage || '—'}</td>
								<td>{yesNo(r.hardsub)}</td>
								<td className="trace-break">
									{JSON.stringify(r.embeddedSubtitles || r.subtitleSkip || '—')}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				<p className="trace-muted">
					None. The encoder never reported which subtitle tracks the source had,
					so a skipped bitmap (PGS) track is invisible.
				</p>
			)}
		</Section>
	)
}

// --- Sortify / Streama -----------------------------------------------------

function StreamaSection({ sortifyStreama }) {
	const s = sortifyStreama || {}
	const match = s.matchIdentity || {}
	const highlights = s.highlights || {}
	const mismatch = match.matches === false
	return (
		<Section
			title="Sortify + Streama"
			subtitle={
				mismatch
					? 'identity mismatch'
					: highlights.rowCount === null || highlights.rowCount === undefined
					? `${highlights.eventCount || 0} highlight event(s), rows unknown`
					: `${highlights.rowCount} highlight row(s)`
			}
			defaultOpen
		>
			<p className="trace-subhead">Identity</p>
			<table className="trace-table">
				<tbody>
					<tr>
						<td>Portal folder tmdb id</td>
						<td className="trace-break">{match.folderTmdbId || '—'}</td>
					</tr>
					<tr className={mismatch ? 'row-bad' : ''}>
						<td>Streama matcher apiId</td>
						<td className="trace-break">
							{match.matcherApiId || 'not reported'}
							{match.matcherTitle ? ` (${match.matcherTitle})` : ''}
						</td>
					</tr>
					<tr className={mismatch ? 'row-bad' : ''}>
						<td>Match</td>
						<td>
							{match.matches === null
								? 'unverified — Sortify agent not reachable'
								: match.matches
								? 'ok'
								: 'MISMATCH — wrong media would be/was assigned'}
						</td>
					</tr>
				</tbody>
			</table>

			<Rows
				items={[
					['Streama media id', s.streamaMediaId],
					['Streama video id', s.streamaVideoId],
					['Highlighted at', s.highlightedAt],
					[
						'Highlight rows (Streama)',
						highlights.rowCount === null || highlights.rowCount === undefined
							? 'unknown — sortify agent did not report'
							: highlights.rowCount
					],
					['"highlighted" events posted', highlights.eventCount],
					['Distinct videoToPlay ids', joinList(highlights.distinctVideoIds)]
				]}
			/>

			{(highlights.events || []).length > 0 && (
				<>
					<p className="trace-subhead">Highlight events</p>
					<ul className="trace-files">
						{highlights.events.map((h, i) => (
							<li key={i}>
								{h.at ? new Date(h.at).toLocaleString() : '—'} · {h.actor || 'agent'}
							</li>
						))}
					</ul>
				</>
			)}
		</Section>
	)
}

function SubtitleAcquireSection({ subtitleAcquire }) {
	const attempts = (subtitleAcquire && subtitleAcquire.attempts) || []
	if (!attempts.length) {
		return (
			<Section title="Subtitle acquire" subtitle="no post-sort attempts">
				<p className="trace-muted">
					No acquiring_subtitles events yet. Missing en/ru files are fetched on
					ElanFlix after sort, or via Add subtitles.
				</p>
			</Section>
		)
	}
	return (
		<Section
			title="Subtitle acquire"
			subtitle={`${attempts.length} attempt(s)`}
			defaultOpen
		>
			{attempts.map((attempt, i) => (
				<div key={`${attempt.at || i}`}>
					<p className="trace-subhead">
						{attempt.trigger || 'sort'}
						{attempt.video ? ` · ${attempt.video}` : ''}
					</p>
					<table className="trace-table">
						<tbody>
							{Object.entries(attempt.languages || {}).map(([lang, row]) => (
								<tr key={lang}>
									<td>{lang}</td>
									<td className="trace-break">
										{(row && row.status) || '—'}
										{row && row.reason ? ` (${row.reason})` : ''}
										{row && row.offsetMs != null ? ` · ${row.offsetMs}ms` : ''}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			))}
		</Section>
	)
}

// --- Flags -----------------------------------------------------------------

function FlagList({ flags }) {
	const rows = [...(flags || [])].sort(
		(a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
	)
	if (!rows.length) {
		return <p className="trace-ok">No mismatches detected.</p>
	}
	return (
		<ul className="trace-flags">
			{rows.map((f, i) => (
				<li key={`${f.code}-${i}`} className={`flag-${f.severity}`}>
					<span className="flag-badge">{f.severity}</span>
					<div>
						<p className="flag-code">{f.code}</p>
						<p className="flag-msg">{f.message}</p>
					</div>
				</li>
			))}
		</ul>
	)
}

// --- Panel -----------------------------------------------------------------

export default function PipelineTrace({ requestId, user }) {
	const [trace, setTrace] = useState(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState(null)
	const [copied, setCopied] = useState(false)

	const load = useCallback(
		async ({ remote = true } = {}) => {
			setLoading(true)
			setError(null)
			try {
				setTrace(await getRequestTrace(requestId, user, { remote }))
			} catch (err) {
				setError(err?.response?.data?.error || err?.message || 'trace failed')
			} finally {
				setLoading(false)
			}
		},
		[requestId, user]
	)

	const json = useMemo(
		() => (trace ? JSON.stringify(trace, null, 2) : ''),
		[trace]
	)

	const copyJson = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(json)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		} catch (err) {
			setError('copy failed: ' + err.message)
		}
	}, [json])

	const summary = trace && trace.flagSummary

	return (
		<Panel>
			<div className="trace-actions">
				{!trace && (
					<button type="button" className="trace-btn" onClick={() => load()} disabled={loading}>
						{loading ? 'Tracing…' : 'Run Pipeline Trace'}
					</button>
				)}
				{trace && (
					<>
						<button
							type="button"
							className="trace-btn"
							onClick={() => load()}
							disabled={loading}
						>
							{loading ? 'Refreshing…' : 'Refresh'}
						</button>
						<button type="button" className="trace-btn" onClick={copyJson}>
							{copied ? 'Copied!' : 'Copy Trace JSON'}
						</button>
					</>
				)}
			</div>

			{error && <p className="trace-error">{error}</p>}

			{trace && (
				<>
					<p className="trace-headline">
						{summary && summary.error
							? `${summary.error} error flag(s)`
							: 'No error flags'}
						{summary && summary.warn ? ` · ${summary.warn} warning(s)` : ''}
						{trace.remote && trace.remote.sortify && trace.remote.sortify.status !== 'ok'
							? ' · Sortify agent not reachable'
							: ''}
					</p>
					<p className="trace-hint">
						Copy the JSON into a debug agent — it carries identity, every search
						string, stage inventories and flags in one document.
					</p>

					<Section title="Flags" subtitle="known mismatch patterns" defaultOpen>
						<FlagList flags={trace.flags} />
					</Section>
					<MagnetSection magnetLookup={trace.magnetLookup} />
					<FetchPlanSection fetchPlan={trace.fetchPlan} />
					<JobsSection jobs={trace.jobs} />
					<EncodeSection encode={trace.encode} />
					<SubtitleAcquireSection subtitleAcquire={trace.subtitleAcquire} />
					<StreamaSection sortifyStreama={trace.sortifyStreama} />
					<Section
						title="Live agent views"
						subtitle="Prelanflix / Sortify (optional)"
					>
						<Rows
							items={[
								[
									'Prelanflix',
									trace.remote?.prelanflix?.status === 'ok'
										? 'ok'
										: `${trace.remote?.prelanflix?.status} — ${
												trace.remote?.prelanflix?.reason ||
												trace.remote?.prelanflix?.error ||
												''
										  }`
								],
								[
									'Sortify',
									trace.remote?.sortify?.status === 'ok'
										? 'ok'
										: `${trace.remote?.sortify?.status} — ${
												trace.remote?.sortify?.reason ||
												trace.remote?.sortify?.error ||
												''
										  }`
								]
							]}
						/>
					</Section>
				</>
			)}
		</Panel>
	)
}

const Panel = styled.div`
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 100%;

	.trace-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.trace-btn {
		background: ${grey[800]};
		border: 1px solid ${grey[700]};
		border-radius: 4px;
		color: white;
		cursor: pointer;
		font-size: 12px;
		padding: 5px 10px;

		&:hover:not(:disabled) {
			background: ${grey[700]};
		}
		&:disabled {
			cursor: default;
			opacity: 0.6;
		}
	}

	.trace-headline {
		color: white;
		font-size: 13px;
		font-weight: 600;
		margin: 0;
	}

	.trace-hint,
	.trace-muted {
		color: ${grey[400]};
		font-size: 12px;
		margin: 0;
	}

	.trace-ok {
		color: ${green[300]};
		font-size: 12px;
		margin: 0;
	}

	.trace-error {
		color: ${red[300]};
		font-size: 12px;
		margin: 0;
	}

	.trace-section {
		background: rgba(255, 255, 255, 0.06);
		border-radius: 6px;
	}

	.trace-section-head {
		align-items: center;
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		display: flex;
		gap: 8px;
		padding: 8px 10px;
		text-align: left;
		width: 100%;
	}

	.trace-caret {
		color: ${grey[500]};
		font-size: 10px;
	}

	.trace-section-title {
		font-size: 12px;
		font-weight: 600;
	}

	.trace-section-sub {
		color: ${grey[400]};
		font-size: 11px;
		margin-left: auto;
		text-align: right;
	}

	.trace-section-body {
		border-top: 1px solid ${grey[800]};
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px 10px 10px;
	}

	.trace-block {
		border-top: 1px solid ${grey[800]};
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 8px;

		&:first-of-type {
			border-top: none;
			padding-top: 0;
		}
	}

	.trace-subhead {
		color: ${grey[300]};
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		margin: 0;
		text-transform: uppercase;
	}

	.trace-dl {
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
			word-break: break-word;
		}
	}

	.trace-table {
		border-collapse: collapse;
		font-size: 12px;
		width: 100%;

		th {
			color: ${grey[400]};
			font-size: 10px;
			font-weight: 600;
			letter-spacing: 0.04em;
			padding: 2px 6px 4px 0;
			text-align: left;
			text-transform: uppercase;
		}
		td {
			border-top: 1px solid ${grey[900]};
			color: white;
			padding: 4px 6px 4px 0;
			vertical-align: top;
		}
		.row-bad td {
			color: ${red[200]};
		}
		.row-picked td {
			color: ${green[200]};
		}
	}

	.trace-break {
		word-break: break-all;
	}

	.trace-files {
		list-style: none;
		margin: 0;
		padding: 0;

		li {
			color: white;
			font-size: 12px;
			padding: 1px 0;
		}
	}

	.trace-flags {
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
