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

async function getMediaRequestUser() {
	let user = 'Anonymous'

	await axios
		.get(
			`${STREAMA_ENDPOINT}/user/current.json`,
			{ withCredentials: true },
			API_REQUEST_CONFIG
		)
		.then((res) => {
			user = res.data.profiles[0].user.username
		})
		.catch((err) => {
			console.warn(err)
		})
	return user
}

export async function addMediaRequest(value = {}) {
	try {
		const {
			id,
			title,
			name,
			poster_path,
			original_name,
			original_title,
			release_date,
			first_air_date,
			adult,
			media_type,
			queueStatus,
			queueMessage
		} = value

		const body = {
			id: id,
			title: title || name,
			posterPath: poster_path,
			createdAt: new Date().toUTCString(),
			originalTitle: original_name || original_title,
			releaseDate: release_date || first_air_date,
			adult: adult ?? false,
			mediaType: media_type,
			queueStatus: queueStatus,
			queueMessage: queueMessage,
			requestUser: await getMediaRequestUser()
		}
		return await axios.put(`${API_ENDPOINT}/requests`, body, API_REQUEST_CONFIG)
	} catch (error) {
		console.log(error)
		return error
	}
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
