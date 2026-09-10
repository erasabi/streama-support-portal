// Client-side mirror of the server status model for rendering badges + stepper.

// User-facing stepper: high-level phases a request moves through.
export const STEPPER = [
	'Requested',
	'Source',
	'Download',
	'Encode',
	'Upload',
	'Sort',
	'Library',
	'Highlights'
]

// Map a server pipelineStage to a stepper index (0-based).
const STAGE_TO_STEP = {
	requested: 0,
	looking_up_magnet: 1,
	not_yet_available: 1,
	needs_manual_check: 1,
	season_approval: 1,
	magnet_ready: 1,
	claimed: 2,
	downloading: 2,
	paused: 2,
	encoding: 3,
	ready_to_sync: 4,
	syncing: 4,
	uploaded: 4,
	sorting: 5,
	deferred: 5,
	acquiring_subtitles: 5,
	registering: 6,
	pending_approval: 6,
	available: 7,
	failed: 1
}

export function stageToStep(stage) {
	if (stage == null) return 0
	return STAGE_TO_STEP[stage] != null ? STAGE_TO_STEP[stage] : 0
}

// Download / Encode / Upload stepper indices that can show file inventories.
export const INVENTORY_STEPS = [
	{ index: 2, key: 'download', label: 'Download' },
	{ index: 3, key: 'encode', label: 'Encode' },
	{ index: 4, key: 'upload', label: 'Upload' }
]

export function inventoryKeyForStep(idx) {
	const row = INVENTORY_STEPS.find((s) => s.index === idx)
	return row ? row.key : null
}

export function defaultInventoryStep(current) {
	if (current >= 4) return 4
	if (current >= 3) return 3
	if (current >= 2) return 2
	return null
}

export function subtitleLangFromName(name) {
	if (!name) return null
	const base = String(name).split('/').pop()
	const m = String(base).match(/^([a-z]{2}(?:-[a-z]{2,3})?)_/i)
	return m ? m[1].toLowerCase() : null
}

export function magnetDisplayName(url) {
	if (!url || typeof url !== 'string') return null
	const m = url.match(/[?&]dn=([^&]+)/i)
	if (!m) return null
	try {
		return decodeURIComponent(m[1].replace(/\+/g, ' '))
	} catch (err) {
		return m[1]
	}
}

// Badge color by the user-facing displayStatus label.
export function statusColor(label) {
	switch (label) {
		case 'Not Yet Available':
			return '#3939bab0'
		case 'Check Manually':
			return '#c76a00d9'
		case 'Approve Seasons':
			return '#b8860bd9'
		case 'Rolling Episodes':
			return '#0ea100c7'
		case 'Unavailable':
			return '#b90000d9'
		case 'Failed':
			return '#7a0000e0'
		case 'Paused':
			return '#c76a00d9'
		case 'Needs attention':
			return '#c76a00d9'
		case 'Pending Approval':
			return '#b8860bd9'
		case 'Available':
			return '#008a7cd9'
		case 'Archived':
			return '#5a5a5ad9'
		case 'Finding source':
		case 'Queued':
		case 'Downloading':
		case 'Encoding':
		case 'Uploading':
		case 'Arrived':
		case 'Sorting':
		case 'Subtitles':
		case 'Adding to library':
			return '#1f6fd6d9'
		default:
			return '#484856d6'
	}
}

// Event types hidden from all history timelines (noise / deprecated gates).
const HIDDEN_EVENT_TYPES = new Set([
	'pending_approval',
	'progress',
	'lease_expired',
	'library_lookup_failed',
])

// Human-friendly labels for append-only event types shown in history.
const EVENT_LABELS = {
	requested: 'Requested',
	re_requested: 'Re-requested',
	update_requested: 'Update requested',
	not_yet_available: 'Not yet available',
	needs_manual_check: 'Check manually',
	magnet_found: 'Magnet found',
	subtitle_lookup: 'Subtitle lookup',
	subtitle_found: 'Subtitle found',
	subtitle_missing: 'Subtitle missing',
	subtitle_upload: 'Subtitle uploaded',
	subtitle_upload_failed: 'Subtitle upload failed',
	acquiring_subtitles: 'Subtitles',
	source_attached: 'Source attached',
	job_created: 'Queued for pipeline',
	claimed: 'Downloading started',
	downloading: 'Downloading',
	encoding: 'Encoding',
	ready_to_sync: 'Ready to upload',
	syncing: 'Uploading',
	uploaded: 'Arrived',
	sorting: 'Sorting',
	deferred: 'Needs attention',
	registering: 'Adding to library',
	available: 'Available',
	highlighted: 'Highlighted',
	failed: 'Failed',
	paused: 'Paused (capacity)',
	released: 'Requeued',
	lease_expired: 'Lease expired',
	cancelled: 'Cancelled',
	archived: 'Archived',
	admin_status_change: 'Status changed',
	no_new_seasons: 'No new seasons to fetch',
	season_approval: 'Seasons need approval',
	seasons_approved: 'Seasons approved',
	season_plan: 'Season plan',
	already_in_library: 'Already in library',
}

export function eventLabel(evtOrType) {
	if (!evtOrType) return 'Event'
	const type = typeof evtOrType === 'string' ? evtOrType : evtOrType.type
	if (type === 'season_plan') {
		const st =
			typeof evtOrType === 'object' &&
			evtOrType.payload &&
			evtOrType.payload.libraryStatus
		if (st === 'error' || st === 'unconfigured') {
			return 'Season plan failed (Streama unreachable)'
		}
	}
	if (type === 'subtitle_lookup') {
		const found =
			typeof evtOrType === 'object' && evtOrType.payload && evtOrType.payload.found
		return found ? 'Subtitle found' : 'Subtitle missing'
	}
	if (type === 'claimed') {
		const kind =
			typeof evtOrType === 'object' && evtOrType.payload && evtOrType.payload.kind
		if (kind === 'subtitle_acquire') return 'Subtitle job claimed'
	}
	return EVENT_LABELS[type] || String(type).replace(/_/g, ' ')
}

// Filter + collapse consecutive duplicate events for display.
export function prepareEvents(events = []) {
	const filtered = (events || []).filter(
		(evt) => evt && !HIDDEN_EVENT_TYPES.has(evt.type)
	)
	const collapsed = []
	for (const evt of filtered) {
		const prev = collapsed[collapsed.length - 1]
		if (prev && prev.type === evt.type && prev.actor === evt.actor) {
			// Keep the most recent timestamp for a run of identical events.
			continue
		}
		collapsed.push(evt)
	}
	return collapsed
}

// Stages that should be hidden from the default "Coming Soon" grid.
export function groupEpisodeCodes(codes) {
	const map = new Map()
	for (const raw of codes || []) {
		const m = /^S(\d+)E(\d+)$/i.exec(String(raw).trim())
		if (!m) continue
		const season = Number(m[1])
		const episode = Number(m[2])
		if (!map.has(season)) map.set(season, [])
		map.get(season).push(episode)
	}
	return [...map.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([season, episodes]) => ({
			season,
			episodes: [...new Set(episodes)].sort((a, b) => a - b)
		}))
}

export function formatSeasonList(nums) {
	if (!Array.isArray(nums) || !nums.length) return '—'
	return nums.map((n) => `S${String(n).padStart(2, '0')}`).join(', ')
}

export const FETCH_MODE_LABELS = {
	episodes: 'Missing episodes (piratify)',
	magnet: 'Magnet / URL',
	seasons_legacy: 'Whole season(s)',
	unknown: 'Not specified'
}

export function isHiddenFromComingSoon(request) {
	if (!request) return false
	if (request.archivedAt) return true
	if (Array.isArray(request.pendingSeasons) && request.pendingSeasons.length) {
		return false
	}
	if (request.pipelineStage && request.pipelineStage !== 'available') {
		return false
	}
	return request.displayStatus === 'Available'
}
