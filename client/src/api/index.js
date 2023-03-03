import axios from 'axios'
import {
	API_ENDPOINT,
	API_REQUEST_CONFIG,
	STREAMA_ENDPOINT,
	MOVIEDB_ENDPOINT
} from '../constants'

export async function getRequestedMedia() {
	return await axios.get(`${API_ENDPOINT}/requests/all`, API_REQUEST_CONFIG)
}

export async function getUser() {
	try {
		const { data } = await axios.get(
			`${STREAMA_ENDPOINT}/user/current.json`,
			{ withCredentials: true },
			API_REQUEST_CONFIG
		)
		return data.profiles[0]
	} catch (err) {
		console.log(err)
	}
}

export async function searchMediaSuggestions(searchValue) {
	return await axios.get(MOVIEDB_ENDPOINT + searchValue)
}

export async function addMediaRequest(body) {
	return await axios.put(`${API_ENDPOINT}/requests`, body, API_REQUEST_CONFIG)
}

export async function deleteMediaRequest(props, id) {
	await axios
		.delete(`${API_ENDPOINT}/requests/${id}`, API_REQUEST_CONFIG)
		.then(() => {
			props.handleRequestSubmit()
		})
}

export async function updateMediaRequest(props, id, updatedProps) {
	const body = {
		id: props.id,
		title: props.title || props.name,
		posterPath: props.posterPath,
		createdAt: new Date().toUTCString(),
		originalTitle: props.originalName || props.originalTitle || null,
		releaseDate: props.releaseDate || props.firstAirDate || null,
		adult: props.adult || false,
		mediaType: props.mediaType || null,
		queueStatus: updatedProps.queueStatus || null,
		queueMessage: updatedProps.queueMessage || null,
		requestUser: props.requestUser || null
	}
	await axios
		.put(`${API_ENDPOINT}/requests/${id}`, body, API_REQUEST_CONFIG)
		.then(() => {
			props.handleRequestSubmit()
		})
}
