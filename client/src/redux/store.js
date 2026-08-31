// import createStore
import { createStore, applyMiddleware } from 'redux'
import thunk from 'redux-thunk'
import axios from 'axios'
import { MOVIEDB } from '../constants'
import { getRequestedMedia } from '/src/api'

// CREATE THE ACTION
// - actions describe the reason to change the state

// handles changes to searchbar input
export const handleSearchInput = (value) => {
	return (dispatch) => {
		if (value.length > 2) {
			axios
				.get(
					`${MOVIEDB.ENDPOINT.MULTI}?api_key=${MOVIEDB.API_KEY}&language=en-US&include_adult=false&sort_by="vote_count.desc"&query=${value}`
				)
				.then((res) => {
					dispatch({
						type: 'SEARCH_MEDIA_SUGGESTIONS',
						value: value,
						queryResults: res.data.results
					})
				})
				.catch(() => {
					dispatch({
						type: 'SEARCH_MEDIA_SUGGESTIONS',
						value: value,
						queryResults: []
					})
				})
		} else {
			dispatch({ type: 'UPDATE_SEARCH', value: value })
		}
	}
}

export const REQUESTED_MEDIA_POLL_MS = 60 * 1000

const FOLLOW_UP_REFRESH_MS = [2000, 8000]
let followUpRefreshTimers = []

function scheduleFollowUpRefresh(dispatch) {
	followUpRefreshTimers.forEach(clearTimeout)
	followUpRefreshTimers = FOLLOW_UP_REFRESH_MS.map((ms) =>
		setTimeout(() => dispatch(handleRequestedMedia()), ms)
	)
}

// Refresh Coming Soon labels without wiping the search bar.
export const handleRequestedMedia = () => {
	return async (dispatch) => {
		try {
			const res = await getRequestedMedia()
			dispatch({ type: 'UPDATE_REQUESTED_MEDIA', mediaResults: res.data })
		} catch {
			// Keep the last good list so a failed poll does not blank Coming Soon.
		}
	}
}

// Immediate list refresh plus short follow-ups for async enqueue/lookup.
export const refreshRequestedMediaSoon = () => {
	return (dispatch) => {
		dispatch(handleRequestedMedia())
		scheduleFollowUpRefresh(dispatch)
	}
}

// handles changes to searchbar input
export const handleSuggestedMediaSelected = (value) => {
	return (dispatch) => {
		dispatch({ type: 'SELECT_MEDIA_SUGGESTION', value: value })
	}
}

// After a new request: refresh Coming Soon and reset search-bar redux state.
export const handleRequestSubmit = () => {
	return async (dispatch) => {
		try {
			const res = await getRequestedMedia()
			dispatch({ type: 'REFRESH_PORTAL', mediaResults: res.data })
		} catch (error) {
			dispatch({ type: 'REFRESH_PORTAL', mediaResults: [] })
		}
		scheduleFollowUpRefresh(dispatch)
	}
}

function mergeRequestedMedia(list, incoming) {
	if (!incoming || incoming.id == null) return list || []
	const rows = Array.isArray(list) ? [...list] : []
	const id = String(incoming.id)
	const idx = rows.findIndex((row) => String(row.id) === id)
	if (idx >= 0) {
		rows[idx] = { ...rows[idx], ...incoming }
	} else {
		rows.unshift(incoming)
	}
	return rows
}

// Optimistic Coming Soon row + background refresh (search bar reset is separate).
export const submitRequestSuccess = (created) => {
	return (dispatch, getState) => {
		if (created && created.id != null) {
			const merged = mergeRequestedMedia(getState().mediaResults, created)
			dispatch({ type: 'UPDATE_REQUESTED_MEDIA', mediaResults: merged })
		}
		dispatch(handleRequestedMedia())
		scheduleFollowUpRefresh(dispatch)
	}
}

// CREATE REDUCER
// reducers modify the state based on what action was given
// given:
// - initial state of store value
// - the action that occured
// result:
// - reducer makes a change to the state

// create initial state
const initialState = {
	input: '',
	value: {},
	suggestionSelected: false,
	queryResults: [],
	mediaResults: [],
	buttonSelected: false,
	buttonDisabled: true
}

// create reducer
export const portalReducer = (state = initialState, action) => {
	switch (action.type) {
		case 'SEARCH_MEDIA_SUGGESTIONS':
			return {
				...state,
				input: action.value || '',
				value: {},
				queryResults: action.queryResults || [],
				suggestionSelected: false,
				buttonDisabled: true
			}
		case 'UPDATE_REQUESTED_MEDIA':
			return {
				...state,
				mediaResults: action.mediaResults || []
			}
		case 'SELECT_MEDIA_SUGGESTION':
			return {
				...state,
				input: action.value.title || action.value.name,
				value: action.value,
				queryResults: [],
				suggestionSelected: true,
				buttonDisabled: false
			}
		case 'REFRESH_PORTAL':
			return {
				...initialState,
				mediaResults: action.mediaResults || []
			}
		default:
			return state
	}
}

export default portalReducer

// create & export default store
export const store = createStore(portalReducer, applyMiddleware(thunk))
