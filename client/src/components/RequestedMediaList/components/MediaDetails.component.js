/* eslint-disable react/prop-types */
import React, {
	useState,
	useEffect,
	useMemo,
	useRef,
	useContext,
	useCallback
} from 'react'
import { blue, red, grey } from '@mui/material/colors'
import { isEmpty, isEqual, merge } from 'lodash'
import { useSelector } from 'react-redux'
import { useInput, useToggle, useClickOutside } from '/src/hooks'
import styled from 'styled-components'
import {
	Button,
	ModalContext,
	Searchbar,
	Dropdown,
	Card,
	CopyText
} from '/src/styles'
import {
	deleteMediaRequest,
	updateMediaRequest,
	getRequestDetails,
	getRequestEvents,
	saveRequestSources,
	approveRequestSeasons
} from '/src/api'
import { isAdmin, isSuperuser, matchesUser } from '/src/auth'
import { UserContext } from '/src/hooks/userContext.hook'
import {
	STEPPER,
	stageToStep,
	defaultInventoryStep,
	inventoryKeyForStep,
	subtitleLangFromName,
	formatSubtitleLanguage,
	yifySubtitleAttachSummary,
	magnetDisplayName,
	groupEpisodeCodes,
	formatSeasonList,
	FETCH_MODE_LABELS,
} from '/src/utils/pipeline'
import EventTimeline from '/src/components/EventTimeline'
import PipelineTrace, { DryRunModal } from '/src/components/PipelineTrace'

function cleanSources(list) {
	const out = []
	for (const raw of list || []) {
		const url = typeof raw === 'string' ? raw.trim() : ''
		if (url && !out.includes(url)) out.push(url)
	}
	return out
}

export default function MediaDetails(props) {
	const {
		id,
		handleRequestSubmit,
		queueStatus,
		queueMessage,
		requestUser,
		onClosed,
		...restProps
	} = props
	const { user = { username: 'Anonymous' } } = useContext(UserContext)
	const isUserMatch = matchesUser(user, requestUser)
	const isAuth = isAdmin(user) || isSuperuser(user)
	let { handleModal } = useContext(ModalContext)
	const status = useInput(queueStatus ?? '')
	const message = useInput(queueMessage ?? '')
	const showQueueStatusDropdown = useToggle(false)
	const closeDropdown = () => showQueueStatusDropdown.setValue(false)
	const dropdownRef = useClickOutside(closeDropdown)
	const showQueueMessageDropdown = useToggle(false)
	const closeMessageDropdown = () => showQueueMessageDropdown.setValue(false)
	const dropdownMessageRef = useClickOutside(closeMessageDropdown)
	const [details, setDetails] = useState(null)
	const [subtitle, setSubtitle] = useState()
	const [subtitleRu, setSubtitleRu] = useState()
	const [isCopied, setCopied] = useState()
	const [events, setEvents] = useState([])
	const [sources, setSources] = useState([''])
	const [pickedSeasons, setPickedSeasons] = useState([])
	const [dryRunOpen, setDryRunOpen] = useState(false)
	const [dryRunNonce, setDryRunNonce] = useState(0)
	const sourcesHydratedRef = useRef(false)

	// Latest values for the unmount persistence path (dismiss via click/Escape).
	const initialSourcesRef = useRef([])
	const skipPersistRef = useRef(false)
	const persistCtxRef = useRef({})

	const closeModal = () => {
		handleModal()
	}

	const magnetUrls = useMemo(() => {
		if (details && Array.isArray(details.magnetUrls)) return details.magnetUrls
		if (details && details.magnetUrl) return [details.magnetUrl]
		return []
	}, [details])

	const live = useSelector((state) =>
		(state.mediaResults || []).find((row) => String(row.id) === String(id))
	)

	const pendingSeasons = useMemo(() => {
		const raw =
			(live && live.pendingSeasons) ||
			(details && details.pendingSeasons) ||
			props.pendingSeasons ||
			[]
		return Array.isArray(raw)
			? [...new Set(raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))].sort(
					(a, b) => a - b
			  )
			: []
	}, [live, details, props.pendingSeasons])

	const pendingKey = pendingSeasons.join(',')
	useEffect(() => {
		setPickedSeasons(pendingSeasons)
		// Only reset picks when the server set of gap seasons actually changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pendingKey])

	const currentStage =
		(live && live.pipelineStage) ||
		(details && details.pipelineStage) ||
		props.pipelineStage

	// What a re-queue of this request would look like today. Read at click time
	// so edits in the modal (media type, sources) are reflected.
	const dryRunInput = useCallback(() => {
		const releaseDate =
			(details && details.releaseDate) || props.releaseDate || ''
		return {
			tmdbId: id,
			title: (details && details.title) || props.title || '',
			mediaType: (details && details.mediaType) || props.mediaType || 'movie',
			year: String(releaseDate).slice(0, 4) || undefined,
			seasons: pendingSeasons,
			queueMessage: (details && details.queueMessage) || message.value || '',
			requestId: id
		}
	}, [id, details, props.title, props.mediaType, props.releaseDate, pendingSeasons, message.value])

	const onDelete = () => {
		skipPersistRef.current = true
		deleteMediaRequest(id, handleRequestSubmit)
		closeModal()
	}

	const persistSources = async () => {
		if (!isAuth) return
		const next = cleanSources(sources)
		if (isEqual(next, cleanSources(initialSourcesRef.current))) return
		try {
			await saveRequestSources(id, next, user)
			initialSourcesRef.current = next
			if (handleRequestSubmit) handleRequestSubmit()
		} catch (error) {
			console.log('persistSources failed:', error?.message)
		}
	}

	const onUpdate = async () => {
		skipPersistRef.current = true
		await persistSources()
		const body = merge({}, props, {
			queueStatus: status.value,
			queueMessage: message.value
		})
		updateMediaRequest(body)
		closeModal()
	}

	const onCancel = () => {
		// Discard any unsaved source edits.
		skipPersistRef.current = true
		closeModal()
	}

	const handleCopy = async (type, value) => {
		if (!navigator.clipboard || !type || !value) {
			console.error('Clipboard API is not available or missing type/value.')
			return
		}

		try {
			await navigator.clipboard.writeText(value)
			setCopied(type)
			setTimeout(() => {
				setCopied(null)
			}, 2000)
		} catch (error) {
			console.error('Failed to copy text: ', error)
		}
	}

	const updateSource = (idx, value) => {
		setSources((prev) => prev.map((v, i) => (i === idx ? value : v)))
	}
	const addSource = () => setSources((prev) => [...prev, ''])
	const removeSource = (idx) =>
		setSources((prev) => {
			const next = prev.filter((_, i) => i !== idx)
			return next.length ? next : ['']
		})

	const toggleSeason = (n) => {
		setPickedSeasons((prev) =>
			prev.includes(n) ? prev.filter((s) => s !== n) : [...prev, n].sort((a, b) => a - b)
		)
	}

	const onApproveSeasons = async () => {
		if (!pickedSeasons.length) return
		try {
			await approveRequestSeasons(id, pickedSeasons, user)
			await fetchDetails()
			if (handleRequestSubmit) handleRequestSubmit()
		} catch (error) {
			console.log('approve seasons failed:', error?.message)
		}
	}

	Searchbar.StatusDropdown = useMemo(() => {
		const QueueStatusOptions = [
			'Not Yet Available',
			'Check Manually',
			'Rolling Episodes',
			'Unavailable',
			'Complete Collection'
		]

		const getOptions = (value, options) => {
			try {
				return options.filter(
					(option) =>
						option.toLowerCase().includes(value.toLowerCase()) &&
						!isEqual(option.toLowerCase(), value.toLowerCase())
				)
			} catch (error) {
				console.log(error)
				return false
			}
		}
		const onDropdownSelect = (option) => {
			status.setValue(option)
			showQueueStatusDropdown.toggleValue()
		}
		const options = getOptions(status.value, QueueStatusOptions)

		return (
			!isEmpty(options) && (
				<Dropdown>
					<Dropdown.Options ref={dropdownRef} style={{ maxHeight: '240px' }}>
						{options.map((option) => (
							<Dropdown.Option
								key={option}
								className="dropdown-option"
								onClick={() => onDropdownSelect(option)}
							>
								{option}
							</Dropdown.Option>
						))}
					</Dropdown.Options>
				</Dropdown>
			)
		)
	}, [status.value])

	Searchbar.MessageDropdown = useMemo(() => {
		const RequestDetailsOptions = [
			'Fetch New Seasons',
			'Video Not Working',
			'Wrong Video',
			'Add Subtitles',
			'Fix Subtitles'
		]
		const getOptions = (value, options) => {
			try {
				return options.filter(
					(option) =>
						option.toLowerCase().includes(value.toLowerCase()) &&
						!isEqual(option.toLowerCase(), value.toLowerCase())
				)
			} catch (error) {
				console.log(error)
				return false
			}
		}
		const onDropdownSelect = (option) => {
			message.setValue(option)
			showQueueMessageDropdown.toggleValue()
		}
		const options = getOptions(message.value, RequestDetailsOptions)

		return (
			!isEmpty(options) && (
				<Dropdown>
					<Dropdown.Options ref={dropdownMessageRef} style={{ maxHeight: '240px' }}>
						{options.map((option) => (
							<Dropdown.Option
								key={option}
								className="dropdown-option"
								onClick={() => onDropdownSelect(option)}
							>
								{option}
							</Dropdown.Option>
						))}
					</Dropdown.Options>
				</Dropdown>
			)
		)
	}, [message.value])

	const DaysAgo = useMemo(() => {
		function getDaysDifference(originalTimeString) {
			const targetDate = new Date(originalTimeString)
			const currentDate = new Date()
			const timeDifference = targetDate - currentDate
			const daysDifference = Math.floor(timeDifference / (1000 * 60 * 60 * 24))
			return daysDifference
		}
		const daysAgo = Math.abs(getDaysDifference(props.createdAt))
		return (
			<span>
				<span style={daysAgo > 7 ? { color: 'red', fontWeight: 500 } : {}}>
					{daysAgo}
				</span>
				{` ${daysAgo > 1 ? 'days' : 'day'} ago`}
			</span>
		)
	}, [props.createdAt])

	const fetchDetails = useCallback(async () => {
		try {
			const data = await getRequestDetails(id, user)
			setDetails(data)
			setSubtitle(data.subtitleUrl)
			setSubtitleRu(data.subtitleUrlRu)
			if (!sourcesHydratedRef.current) {
				const initial =
					Array.isArray(data.magnetUrls) && data.magnetUrls.length
						? data.magnetUrls
						: data.magnetUrl
						? [data.magnetUrl]
						: []
				initialSourcesRef.current = initial
				setSources(initial.length ? initial : [''])
				sourcesHydratedRef.current = true
			}
		} catch (error) {
			console.log(error)
		}
		if (isAuth) {
			const evts = await getRequestEvents(id, user)
			setEvents(evts || [])
		}
	}, [id, user, isAuth])

	useEffect(() => {
		fetchDetails()
	}, [fetchDetails, currentStage])

	useEffect(() => {
		const timer = setInterval(() => {
			fetchDetails()
		}, 15000)
		return () => clearInterval(timer)
	}, [fetchDetails])

	// Keep the latest edit state available to the unmount persistence path.
	useEffect(() => {
		persistCtxRef.current = { sources, isAuth, id, user }
	}, [sources, isAuth, id, user])

	// Persist source edits when the modal is dismissed via click-outside/Escape
	// (Cancel/Delete/Update set skipPersistRef and handle their own save).
	useEffect(() => {
		return () => {
			if (!skipPersistRef.current) {
				const ctx = persistCtxRef.current
				if (ctx.isAuth) {
					const next = cleanSources(ctx.sources)
					if (!isEqual(next, cleanSources(initialSourcesRef.current))) {
						saveRequestSources(ctx.id, next, ctx.user)
							.then(() => handleRequestSubmit && handleRequestSubmit())
							.catch((e) => console.log('dismiss persist failed:', e?.message))
					}
				}
			}
			if (typeof onClosed === 'function') {
				setTimeout(onClosed, 0)
			}
		}
	}, [])

	const showSources =
		(isAuth || isUserMatch) &&
		(magnetUrls.length > 0 || subtitle || isAuth)
	const showQueue = isUserMatch || isAuth

	return (
		<Wrapper {...restProps}>
			<Card className="card">
				<header className="details-header">
					<CardTitle className="details-title" text={props.title} />
					<button
						type="button"
						className="details-close"
						onClick={onCancel}
						aria-label="Close details"
					>
						×
					</button>
				</header>
				<ProgressTracker
					current={stageToStep(currentStage)}
					canView={isAuth || isUserMatch}
					artifacts={details && details.pipelineArtifacts}
					magnetQuality={
						(details && details.magnetQuality) || props.magnetQuality
					}
					subtitleUrl={subtitle}
					subtitleUrlRu={subtitleRu}
					magnetUrls={magnetUrls}
				/>
				<div className="card-scroll">
					<DetailsSection title="Overview">
						<div className="meta-grid">
							<MetaItem label="Requested">{DaysAgo}</MetaItem>
							{(isUserMatch || isAuth) && (
								<MetaItem label="Requested by">
									<CopyText
										text={props.requestUser}
										copyValue={
											!isEmpty(props.requestUser)
												? `Requested by ${
														props.requestUser.charAt(0).toUpperCase() +
														props.requestUser.slice(1)
												  }`
												: props.requestUser
										}
									/>
								</MetaItem>
							)}
							<MetaItem label="Released">
								{props.releaseDate || '—'}
							</MetaItem>
							<MetaItem label="Media type">
								{props.mediaType || '—'}
							</MetaItem>
						</div>
					</DetailsSection>

					{showQueue && (
						<DetailsSection
							title="Queue"
							hint="Status and notes for this request"
						>
							<div className="form-stack">
								{isAuth && (
									<FormField label="Queue status">
										<div className="form-control">
											<Searchbar>
												<Searchbar.TextInput
													className="searchbar-text-input"
													placeholder="Queue Status"
													value={status.value}
													onChange={status.onChange}
													onFocus={() => showQueueStatusDropdown.setValue(true)}
												/>
											</Searchbar>
											{showQueueStatusDropdown.value && Searchbar.StatusDropdown}
										</div>
									</FormField>
								)}
								<FormField label="Request details">
									<div className="form-control">
										<Searchbar>
											<Searchbar.TextInput
												className="searchbar-text-input"
												placeholder="Choose or Write Anything"
												value={message.value}
												onChange={message.onChange}
												onFocus={() => showQueueMessageDropdown.setValue(true)}
											/>
										</Searchbar>
										{showQueueMessageDropdown.value && Searchbar.MessageDropdown}
									</div>
								</FormField>
							</div>
						</DetailsSection>
					)}

					{showSources && (
						<DetailsSection title="Sources">
							{(isAuth || isUserMatch) && magnetUrls.length > 0 && (
								<div className="source-block">
									<p className="block-label">
										{magnetUrls.length > 1 ? 'Magnet URLs' : 'Magnet URL'}
									</p>
									<div className="magnet-copies">
										{magnetUrls.map((u, i) => (
											<MagnetLinkBtn
												key={u}
												onClick={() => handleCopy(`magnet${i}`, u)}
											>
												{isCopied === `magnet${i}`
													? 'Copied!'
													: magnetUrls.length > 1
													? `Copy #${i + 1}`
													: 'Copy Magnet Link'}
											</MagnetLinkBtn>
										))}
									</div>
								</div>
							)}
							{(isAuth || isUserMatch) && subtitle && (
								<div className="source-block">
									<p className="block-label">Subtitle URL</p>
									<MagnetLinkBtn onClick={() => handleCopy('subtitle', subtitle)}>
										{isCopied === 'subtitle' ? 'Copied!' : 'Copy Subtitle Link'}
									</MagnetLinkBtn>
								</div>
							)}
							{isAuth && (
								<div className="source-block">
									<p className="block-label">Attach source</p>
									<SourceEditor>
										{sources.map((val, idx) => (
											<div className="source-row" key={idx}>
												<Searchbar className="searchbar">
													<Searchbar.TextInput
														className="searchbar-text-input"
														placeholder="magnet:?... or URL"
														value={val}
														onChange={(e) => updateSource(idx, e.target.value)}
													/>
												</Searchbar>
												<button
													type="button"
													className="src-remove"
													title="Remove source"
													onClick={() => removeSource(idx)}
												>
													×
												</button>
											</div>
										))}
										<button
											type="button"
											className="src-add"
											onClick={addSource}
										>
											+ Add source
										</button>
									</SourceEditor>
								</div>
							)}
						</DetailsSection>
					)}

					{isAuth && pendingSeasons.length > 0 && (
						<DetailsSection
							title="Approve seasons"
							hint="First and latest were queued automatically. Choose which in-between seasons to download."
						>
							<SeasonPicker>
								<div className="season-chips">
									{pendingSeasons.map((n) => (
										<label key={n} className="season-chip">
											<input
												type="checkbox"
												checked={pickedSeasons.includes(n)}
												onChange={() => toggleSeason(n)}
											/>
											S{String(n).padStart(2, '0')}
										</label>
									))}
								</div>
								<div className="season-actions">
									<button
										type="button"
										className="src-add"
										onClick={() => setPickedSeasons(pendingSeasons)}
									>
										Select all
									</button>
									<button
										type="button"
										className="season-queue"
										disabled={!pickedSeasons.length}
										onClick={onApproveSeasons}
									>
										Queue selected
									</button>
								</div>
							</SeasonPicker>
						</DetailsSection>
					)}

					{isAuth && details && details.pipelinePlan && (
						<DetailsSection title="Planned fetch">
							<PipelinePlanPanel plan={details.pipelinePlan} />
						</DetailsSection>
					)}

					{isAuth && (
						<DetailsSection
							title="Diagnostics"
							hint="Rehearse a re-queue or inspect what already happened"
						>
							<div className="diag-stack">
								<div className="diag-block">
									<p className="block-label">Pipeline trace</p>
									<PipelineTrace requestId={id} user={user} />
								</div>
								<div className="diag-block">
									<p className="block-label">Dry run</p>
									<p className="details-section-hint">
										Rehearse a re-queue without creating a job.
									</p>
									<button
										type="button"
										className="dry-run-open"
										onMouseDown={(event) => {
											event.preventDefault()
											event.stopPropagation()
											setDryRunNonce((n) => n + 1)
											setDryRunOpen(true)
										}}
									>
										Open dry run
									</button>
								</div>
							</div>
						</DetailsSection>
					)}

					{isAuth && (
						<DetailsSection title="History">
							<EventTimeline events={events} />
						</DetailsSection>
					)}
				</div>
				<DryRunModal
					key={dryRunNonce}
					open={dryRunOpen}
					onClose={() => setDryRunOpen(false)}
					user={user}
					getInput={dryRunInput}
					heading={`Dry run · ${props.title || 'this title'}`}
				/>
				<Button.Group className="button-group">
					<Button className="cancel" onClick={onCancel}>
						Cancel
					</Button>
					<Button
						className="delete"
						disabled={!(isUserMatch || isAuth)}
						onClick={onDelete}
					>
						Delete
					</Button>
					<Button
						className="update"
						disabled={!(isUserMatch || isAuth)}
						onClick={onUpdate}
					>
						Update
					</Button>
				</Button.Group>
			</Card>
		</Wrapper>
	)
}

function DetailsSection({ title, hint, children }) {
	return (
		<section className="details-section">
			<header className="details-section-head">
				<h3 className="details-section-title">{title}</h3>
				{hint && <p className="details-section-hint">{hint}</p>}
			</header>
			<div className="details-section-body">{children}</div>
		</section>
	)
}

function MetaItem({ label, children }) {
	if (children == null || children === false) return null
	return (
		<div className="meta-item">
			<p className="meta-label">{label}</p>
			<div className="meta-value">{children}</div>
		</div>
	)
}

function FormField({ label, children }) {
	return (
		<div className="form-field">
			<label>{label}</label>
			{children}
		</div>
	)
}

function EpisodeGroups({ codes, className = '' }) {
	const groups = groupEpisodeCodes(codes)
	if (!groups.length) {
		return <p className={`plan-muted ${className}`.trim()}>None</p>
	}
	return (
		<ul className={`plan-episodes ${className}`.trim()}>
			{groups.map(({ season, episodes }) => (
				<li key={season}>
					<span className="plan-season">S{String(season).padStart(2, '0')}</span>
					<span className="plan-eps">
						E{episodes.map((e) => String(e).padStart(2, '0')).join(', E')}
					</span>
				</li>
			))}
		</ul>
	)
}

function PipelinePlanPanel({ plan }) {
	if (!plan) return null
	const { headline, seasonPlan, active, jobs = [] } = plan
	const plannedFromPlan = seasonPlan && seasonPlan.plannedMissing
	const activePlanned = active && active.plannedMissing
	const activeRemaining = active && active.remainingMissing

	return (
		<PlanPanel>
			{headline && <p className="plan-headline">{headline}</p>}
			{seasonPlan && (
				<div className="plan-block">
					<p className="plan-subhead">Library vs plan</p>
					<dl className="plan-dl">
						<dt>Auto-queued seasons</dt>
						<dd>{formatSeasonList(seasonPlan.autoSeasons)}</dd>
						<dt>In library (partial)</dt>
						<dd>{formatSeasonList(seasonPlan.presentSeasons)}</dd>
						<dt>Complete in library</dt>
						<dd>{formatSeasonList(seasonPlan.completeSeasons)}</dd>
						<dt>Awaiting approval</dt>
						<dd>{formatSeasonList(seasonPlan.pendingSeasons)}</dd>
					</dl>
					<p className="plan-subhead">Episodes to fetch (from Streama diff)</p>
					<EpisodeGroups codes={plannedFromPlan} />
				</div>
			)}
			{active && active.count > 0 && (
				<div className="plan-block">
					<p className="plan-subhead">Active worker queue</p>
					<dl className="plan-dl">
						<dt>Jobs</dt>
						<dd>{active.count}</dd>
						<dt>Planned episodes</dt>
						<dd>
							<EpisodeGroups codes={activePlanned} />
						</dd>
						<dt>Still missing</dt>
						<dd>
							<EpisodeGroups codes={activeRemaining} />
						</dd>
					</dl>
				</div>
			)}
			{jobs.length > 0 && (
				<div className="plan-block">
					<p className="plan-subhead">Pipeline jobs</p>
					<ul className="plan-jobs">
						{jobs.map((job) => (
							<li key={job.id} className="plan-job">
								<div className="plan-job-head">
									<span className="plan-job-status">{job.claimStatus}</span>
									<span className="plan-job-mode">
										{FETCH_MODE_LABELS[job.fetchMode] || job.fetchMode}
									</span>
									{job.seasons && job.seasons.length > 0 && (
										<span className="plan-job-seasons">
											{formatSeasonList(job.seasons)}
										</span>
									)}
								</div>
								{job.folderName && (
									<p className="plan-muted plan-folder">{job.folderName}</p>
								)}
								{job.plannedMissing && job.plannedMissing.length > 0 && (
									<div className="plan-job-eps">
										<span className="plan-label">Planned:</span>
										<EpisodeGroups codes={job.plannedMissing} />
									</div>
								)}
								{job.remainingMissing &&
									job.remainingMissing.length > 0 &&
									!isEqual(job.remainingMissing, job.plannedMissing) && (
										<div className="plan-job-eps">
											<span className="plan-label">Remaining:</span>
											<EpisodeGroups codes={job.remainingMissing} />
										</div>
									)}
							</li>
						))}
					</ul>
				</div>
			)}
		</PlanPanel>
	)
}

function formatBytes(n) {
	const bytes = Number(n)
	if (!Number.isFinite(bytes) || bytes <= 0) return ''
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function ProgressTracker({
	current,
	canView,
	artifacts,
	magnetQuality,
	subtitleUrl,
	subtitleUrlRu,
	magnetUrls
}) {
	const [picked, setPicked] = useState(false)
	const [selected, setSelected] = useState(null)
	const shown =
		picked && selected != null ? selected : defaultInventoryStep(current)
	const key = inventoryKeyForStep(shown)
	const bucket = key && artifacts && artifacts[key]
	const showPanel = canView && shown != null

	const onPick = (idx) => {
		setPicked(true)
		setSelected(idx)
	}

	return (
		<TrackerWrap>
			<div className="track">
				{STEPPER.map((label, idx) => {
					const done = idx <= current
					const active = idx === current
					const inventory = inventoryKeyForStep(idx)
					const clickable = canView && inventory && current >= idx
					return (
						<div
							key={label}
							className={`step ${done ? 'done' : ''} ${active ? 'active' : ''} ${
								shown === idx && clickable ? 'selected' : ''
							} ${clickable ? 'clickable' : ''}`}
							onClick={clickable ? () => onPick(idx) : undefined}
							onKeyDown={
								clickable
									? (e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault()
												onPick(idx)
											}
									  }
									: undefined
							}
							role={clickable ? 'button' : undefined}
							tabIndex={clickable ? 0 : undefined}
						>
							{idx > 0 && <span className="line" />}
							<span className="dot" />
							<span className="step-label">{label}</span>
						</div>
					)
				})}
			</div>
			{showPanel && (
				<StageInventory
					stepKey={key}
					bucket={bucket}
					magnetQuality={magnetQuality}
					subtitleUrl={subtitleUrl}
					subtitleUrlRu={subtitleUrlRu}
					magnetUrls={magnetUrls}
				/>
			)}
		</TrackerWrap>
	)
}

const EMPTY_COPY = {
	download: 'No downloaded files were recorded for this request.',
	encode: 'No encoded files yet. They appear here while ffmpeg is writing them.',
	upload: 'No uploaded files yet. They appear here as each file is copied to PRE-SORT.'
}

function StageInventory({
	stepKey,
	bucket,
	magnetQuality,
	subtitleUrl,
	subtitleUrlRu,
	magnetUrls
}) {
	const yifyAttach = yifySubtitleAttachSummary(subtitleUrl, subtitleUrlRu)
	const files = (bucket && Array.isArray(bucket.files) ? bucket.files : []).filter(
		(f) => f && f.name
	)
	const subs = (
		bucket && Array.isArray(bucket.subtitles) ? bucket.subtitles : []
	).filter((f) => f && f.name)
	const fileSubs = files.filter((f) => f.kind === 'subtitle')
	const videos = files.filter((f) => f.kind !== 'subtitle')
	const allSubs = [...subs, ...fileSubs.filter((s) => !subs.some((x) => x.name === s.name))]
	const hasFiles = videos.length > 0 || allSubs.length > 0
	const folderName = bucket && bucket.folderName
	const torrentName =
		(bucket && bucket.torrentName) ||
		(Array.isArray(magnetUrls)
			? magnetUrls.map(magnetDisplayName).find(Boolean)
			: null)
	const heading =
		stepKey === 'download' ? 'Downloaded' : stepKey === 'encode' ? 'Encoded' : 'Uploaded'

	return (
		<div className="inventory">
			<p className="inv-heading">{heading}</p>
			{torrentName && <p className="inv-meta">{torrentName}</p>}
			{folderName && folderName !== torrentName && (
				<p className="inv-meta muted">{folderName}</p>
			)}
					{!hasFiles && (
				<div className="inv-empty">
					<p>{EMPTY_COPY[stepKey] || 'No file inventory captured for this stage.'}</p>
					{stepKey === 'download' && (magnetQuality || yifyAttach) && (
						<p className="inv-fallback">
							{magnetQuality ? `Source quality: ${magnetQuality}` : ''}
							{magnetQuality && yifyAttach ? ' · ' : ''}
							{yifyAttach || ''}
						</p>
					)}
				</div>
			)}
			{videos.length > 0 && (
				<ul className="inv-list">
					{videos.map((f) => (
						<li key={f.name}>
							<span className="inv-name">{f.name}</span>
							{formatBytes(f.bytes) && (
								<span className="inv-size">{formatBytes(f.bytes)}</span>
							)}
						</li>
					))}
				</ul>
			)}
			{(allSubs.length > 0 || (yifyAttach && !hasFiles && stepKey === 'download')) && (
				<div className="inv-subs">
					<p className="inv-subhead">Subtitles</p>
					{allSubs.length > 0 ? (
						<ul className="inv-list">
							{allSubs.map((f) => {
								const langCode = f.language || subtitleLangFromName(f.name)
								const langLabel = formatSubtitleLanguage(langCode) || langCode
								return (
									<li key={f.name}>
										<span className="inv-name">{f.name}</span>
										{langLabel && <span className="inv-lang">{langLabel}</span>}
									</li>
								)
							})}
						</ul>
					) : (
						<p className="inv-fallback">{yifyAttach}</p>
					)}
				</div>
			)}
		</div>
	)
}

const TrackerWrap = styled.div`
	border-bottom: 1px solid ${grey[800]};
	border-top: 1px solid ${grey[800]};
	flex-shrink: 0;
	margin: 8px 0 4px;
	padding: 16px 4px;
	width: 100%;

	.track {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 10px 0;
		width: 100%;
	}

	.step {
		align-items: center;
		display: flex;
		flex: 1 1 25%;
		flex-direction: column;
		opacity: 0.45;
		position: relative;
		min-width: 70px;

		@media only screen and (min-width: 600px) {
			flex: 1 1 0;
		}
	}
	.step.done {
		opacity: 1;
	}

	.line {
		background: ${grey[700]};
		height: 3px;
		left: calc(-50% + 9px);
		pointer-events: none;
		position: absolute;
		top: 8px;
		width: calc(100% - 18px);
		z-index: 0;
	}
	.step.done .line {
		background: ${blue[500]};
	}

	.dot {
		background: ${grey[600]};
		border-radius: 50%;
		height: 18px;
		width: 18px;
		z-index: 1;
	}
	.step.done .dot {
		background: ${blue[400]};
	}
	.step.active .dot {
		background: ${blue[500]};
		box-shadow: 0 0 0 4px ${blue[900]};
		height: 22px;
		width: 22px;
	}
	.step.clickable {
		cursor: pointer;
	}
	.step.selected .dot {
		box-shadow: 0 0 0 4px ${blue[900]};
	}
	.step.selected .step-label {
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.step-label {
		color: white;
		font-size: 11px;
		margin-top: 8px;
		text-align: center;

		@media only screen and (min-width: 600px) {
			font-size: 13px;
		}
	}

	.inventory {
		margin: 12px 8px 0;
		max-height: 180px;
		overflow-y: auto;
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 6px;
	}
	.inv-heading {
		color: white;
		font-size: 13px;
		font-weight: 600;
		margin: 0 0 6px;
	}
	.inv-meta {
		color: white;
		font-size: 12px;
		margin: 0 0 6px;
		word-break: break-all;
	}
	.inv-meta.muted,
	.inv-empty,
	.inv-fallback {
		color: ${grey[400]};
		font-size: 12px;
		margin: 0;
	}
	.inv-empty p {
		margin: 0 0 4px;
	}
	.inv-subhead {
		color: ${grey[300]};
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		margin: 8px 0 4px;
		text-transform: uppercase;
	}
	.inv-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.inv-list li {
		align-items: baseline;
		color: white;
		display: flex;
		font-size: 12px;
		gap: 8px;
		padding: 2px 0;
		word-break: break-all;
	}
	.inv-name {
		flex: 1;
	}
	.inv-size,
	.inv-lang {
		color: ${grey[400]};
		flex-shrink: 0;
		font-size: 11px;
	}
`

export const CardTitle = styled(CopyText)`
	display: flex;
	flex-shrink: 0;
	justify-content: center;

	.text {
		font-size: 25px;
		color: red;

		@media only screen and (min-width: ${(props) =>
				props.theme.breakpoints.tablet}) {
			font-size: 50px;
		}
	}

	.icon {
		width: 15px;

		@media only screen and (min-width: ${(props) =>
				props.theme.breakpoints.tablet}) {
			width: 35px;
		}
	}
`

export const CardField = styled(Card.Field)``

const MagnetLinkBtn = styled(Button)`
	width: 150px;
`

const SourceEditor = styled.div`
	display: flex;
	flex-direction: column;
	gap: 8px;

	.source-row {
		align-items: center;
		display: flex;
		gap: 6px;
		width: 100%;
	}

	.source-row .searchbar {
		flex: 1;
		width: 100%;
		min-width: 180px;
	}

	.src-remove {
		background: ${red[500]};
		border: none;
		border-radius: 4px;
		color: white;
		cursor: pointer;
		font-size: 16px;
		height: 28px;
		line-height: 1;
		width: 28px;
	}

	.src-add {
		align-self: flex-start;
		background: rgba(255, 255, 255, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.25);
		border-radius: 4px;
		color: white;
		cursor: pointer;
		font-size: 13px;
		padding: 6px 12px;

		&:hover {
			background: rgba(255, 255, 255, 0.2);
		}
	}
`

const SeasonPicker = styled.div`
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 100%;

	.season-hint {
		color: ${grey[400]};
		font-size: 12px;
		margin: 0;
		max-width: 420px;
	}

	.season-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.season-chip {
		align-items: center;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		color: white;
		cursor: pointer;
		display: flex;
		font-size: 13px;
		gap: 6px;
		padding: 4px 8px;
	}

	.season-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.src-add {
		background: rgba(255, 255, 255, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.25);
		border-radius: 4px;
		color: white;
		cursor: pointer;
		font-size: 13px;
		padding: 6px 12px;
	}

	.season-queue {
		background: ${blue[500]};
		border: none;
		border-radius: 4px;
		color: white;
		cursor: pointer;
		font-size: 13px;
		padding: 6px 12px;

		&:disabled {
			cursor: not-allowed;
			opacity: 0.45;
		}
	}
`

const PlanPanel = styled.div`
	display: flex;
	flex-direction: column;
	gap: 12px;
	width: 100%;

	.plan-headline {
		color: white;
		font-size: 13px;
		font-weight: 600;
		margin: 0;
	}

	.plan-block {
		background: rgba(255, 255, 255, 0.06);
		border-radius: 6px;
		padding: 10px 12px;
	}

	.plan-subhead {
		color: ${grey[300]};
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		margin: 0 0 6px;
		text-transform: uppercase;
	}

	.plan-dl {
		display: grid;
		gap: 4px 12px;
		grid-template-columns: max-content 1fr;
		margin: 0 0 10px;

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

	.plan-muted {
		color: ${grey[400]};
		font-size: 12px;
		margin: 0;
	}

	.plan-folder {
		word-break: break-all;
	}

	.plan-episodes {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.plan-episodes li {
		color: white;
		display: flex;
		font-size: 12px;
		gap: 8px;
		padding: 1px 0;
	}

	.plan-season {
		color: ${blue[300]};
		font-weight: 600;
		min-width: 2.5rem;
	}

	.plan-eps {
		word-break: break-word;
	}

	.plan-jobs {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.plan-job {
		border-top: 1px solid ${grey[800]};
		padding: 8px 0;

		&:first-child {
			border-top: none;
			padding-top: 0;
		}
	}

	.plan-job-head {
		display: flex;
		flex-wrap: wrap;
		font-size: 12px;
		gap: 8px;
	}

	.plan-job-status {
		color: ${blue[300]};
		font-weight: 600;
		text-transform: capitalize;
	}

	.plan-job-mode,
	.plan-job-seasons {
		color: white;
	}

	.plan-job-eps {
		margin-top: 4px;
	}

	.plan-label {
		color: ${grey[400]};
		display: block;
		font-size: 11px;
		margin-bottom: 2px;
	}
`

const Wrapper = styled.div`
	display: flex;
	flex-direction: column;
	max-height: 100%;
	min-height: 0;
	overflow: hidden;
	width: 100%;

	.card {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		gap: 12px;
		max-height: 100%;
		min-height: 0;
		overflow: hidden;
		width: 100%;
	}

	.details-header {
		align-items: flex-start;
		display: flex;
		flex-shrink: 0;
		gap: 12px;
		justify-content: space-between;
	}

	.details-title {
		flex: 1;
		justify-content: flex-start;
		min-width: 0;

		.text {
			font-size: 22px;
			line-height: 1.15;
			text-align: left;

			@media only screen and (min-width: ${(props) =>
					props.theme.breakpoints.tablet}) {
				font-size: 32px;
			}
		}

		.icon {
			width: 16px;

			@media only screen and (min-width: ${(props) =>
					props.theme.breakpoints.tablet}) {
				width: 22px;
			}
		}
	}

	.details-close {
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

	.card-scroll {
		flex: 1 1 auto;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		padding-right: 4px;
		-webkit-overflow-scrolling: touch;
	}

	.details-section {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid ${grey[800]};
		border-radius: 10px;
		margin-bottom: 12px;
		padding: 12px 14px 14px;
	}

	.details-section-head {
		margin-bottom: 10px;
	}

	.details-section-title {
		color: ${grey[300]};
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		margin: 0;
		text-transform: uppercase;
	}

	.details-section-hint {
		color: ${grey[500]};
		font-size: 12px;
		margin: 4px 0 0;
	}

	.details-section-body {
		width: 100%;
	}

	.meta-grid {
		display: grid;
		gap: 10px 20px;
		grid-template-columns: 1fr;
		margin: 0;

		@media only screen and (min-width: ${(props) =>
				props.theme.breakpoints.tablet}) {
			grid-template-columns: 1fr 1fr;
		}
	}

	.meta-item {
		.meta-label {
			color: ${grey[500]};
			font-size: 11px;
			font-weight: 600;
			letter-spacing: 0.04em;
			margin: 0 0 3px;
			text-transform: uppercase;
		}

		.meta-value {
			color: white;
			font-size: 14px;
			margin: 0;
			overflow-wrap: anywhere;
		}
	}

	.form-stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 6px;

		> label {
			color: ${grey[400]};
			font-size: 12px;
			font-weight: 600;
		}
	}

	.form-control {
		max-width: 420px;
		position: relative;
		width: 100%;

		.searchbar,
		.searchbar > div {
			width: 100%;
		}
	}

	.block-label {
		color: ${grey[400]};
		font-size: 12px;
		font-weight: 600;
		margin: 0 0 6px;
	}

	.source-block + .source-block,
	.diag-block + .diag-block {
		border-top: 1px solid ${grey[800]};
		margin-top: 12px;
		padding-top: 12px;
	}

	.diag-stack {
		display: flex;
		flex-direction: column;
	}

	.dry-run-open {
		background: ${grey[800]};
		border: 1px solid ${grey[600]};
		border-radius: 4px;
		color: white;
		cursor: pointer;
		font-size: 13px;
		margin-top: 8px;
		padding: 8px 12px;

		&:hover {
			background: ${grey[700]};
		}

		&:disabled {
			cursor: default;
			opacity: 0.65;
		}
	}

	.magnet-copies {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.searchbar-text-input {
		--background-color: ${grey[700]};
		width: 100%;
		::placeholder {
			color: white;
			opacity: 0.5;
		}
	}

	.dropdown-option {
		--background-color: ${grey[700]};
		fontsize: 20px;
	}

	.button-group {
		background: #222121;
		border-top: 1px solid ${grey[800]};
		flex-shrink: 0;
		padding-top: 12px;
	}

	.button-group > button {
		border-radius: 0px;

		&.cancel {
			--background-color: ${grey[700]};
		}

		&.delete {
			--background-color: ${red[500]};
		}

		&.update {
			--background-color: ${blue[500]};
		}
	}
`
