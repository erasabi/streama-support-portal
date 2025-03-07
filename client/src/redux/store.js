// import createStore
import { createStore, applyMiddleware } from 'redux'
import thunk from 'redux-thunk'
import axios from 'axios'
import { API_ENDPOINT, API_REQUEST_CONFIG, MOVIEDB } from '../constants'
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

// handles changes to searchbar input
export const handleRequestedMedia = () => {
	return (dispatch) => {
		axios
			.get(`${API_ENDPOINT}/requests/all`, API_REQUEST_CONFIG)
			.then((res) => {
				dispatch({ type: 'UPDATE_REQUESTED_MEDIA', mediaResults: res.data })
			})
			.catch(() => {
				dispatch({ type: 'UPDATE_REQUESTED_MEDIA', mediaResults: [] })
			})
	}
}

// handles changes to searchbar input
export const handleSuggestedMediaSelected = (value) => {
	return (dispatch) => {
		dispatch({ type: 'SELECT_MEDIA_SUGGESTION', value: value })
	}
}

// handles changes to searchbar input
export const handleRequestSubmit = () => {
	return async (dispatch) => {
		try {
			const res = await getRequestedMedia()
			dispatch({ type: 'REFRESH_PORTAL', mediaResults: res.data })
		} catch (error) {
			dispatch({ type: 'REFRESH_PORTAL', mediaResults: [] })
		}
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
