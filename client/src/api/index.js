import axios from 'axios'
import {
	API_ENDPOINT,
	API_REQUEST_CONFIG,
	STREAMA_ENDPOINT,
	MOVIEDB_ENDPOINT
} from '../constants'
import { isArray } from 'lodash'

function getTorrentUrl(torrents = []) {
	try {
		const sortedTorrents = torrents.sort((torrentA, torrentB) => {
			const qualityOrder = (quality) => {
				switch (quality) {
					case '1080p':
						return 1
					case '2160p':
						return 2
					default:
						return 3
				}
			}

			// Compare based on video codec and then quality
			if (torrentA.video_codec === 'x264' && torrentB.video_codec !== 'x264') {
				return -1 // Prioritize x264 over other codecs
			} else if (
				torrentA.video_codec !== 'x264' &&
				torrentB.video_codec === 'x264'
			) {
				return 1 // Prioritize x264 over other codecs
			} else {
				// If codecs are the same, compare based on quality order
				return qualityOrder(torrentA.quality) - qualityOrder(torrentB.quality)
			}
		})
		return sortedTorrents[0].url
	} catch (error) {
		console.log(error)
	}
}

function findMatch(movies = [], year) {
	return movies.find((movie) => movie.year == year)
}

export async function getYTSLinks(title, year) {
	try {
		let movies = await axios
			.get(`https://yts.mx/api/v2/list_movies.json?query_term=${title}`)
			.then((res) => res.data.data.movies)
		const movie = findMatch(movies, year)
		const torrentUrl = getTorrentUrl(movie.torrents)
		const { data: subtitleUrl } = await axios.get(
			`${API_ENDPOINT}/proxy/subtitle-url/${movie?.imdb_code}`
		)
		return { torrent: torrentUrl, subtitle: subtitleUrl }
	} catch (error) {
		console.log(error)
	}
}

export async function isReleased(title, year) {
	let isReleased = false
	try {
		const { data } = await axios.get(
			`https://yts.mx/api/v2/list_movies.json?query_term=${title}"`
		)
		const movies = data?.data?.movies

		if (isArray(movies)) {
			movies.forEach((movie) => {
				if (movie.year == year) {
					isReleased = true
				}
			})
		}
	} catch (error) {
		console.log(error)
	}
	return isReleased
}

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

		return data.profiles[0].user
	} catch (err) {
		console.warn(err)
		// throw error so useQuery hooks isError will be correct
		throw err
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

export async function checkDuplicateMediaRequest(
	title,
	releaseDate,
	mediaType
) {
	function findMatchingItem(title, releaseDate, jsonArray) {
		for (const item of jsonArray) {
			if (
				((item.title === title || item.name === title) &&
					item.release_date === releaseDate) ||
				item.first_air_date === releaseDate
			) {
				return true
			}
		}
		return false
	}
	return await axios
		.get(
			`${STREAMA_ENDPOINT}/dash/searchMedia.json?query=${title}`,
			{ withCredentials: true },
			API_REQUEST_CONFIG
		)
		.then((res) => {
			if (mediaType === 'movie') {
				const { movies } = res.data
				return findMatchingItem(title, releaseDate, movies)
			} else if (mediaType === 'tv') {
				const { shows } = res.data
				return findMatchingItem(title, releaseDate, shows)
			}
		})
		.catch((err) => {
			console.warn(err)
			return false
		})
}

export async function addMediaRequest(body = {}) {
	try {
		const {
			title,
			name,
			poster_path,
			original_name,
			original_title,
			release_date,
			first_air_date,
			media_type
		} = body

		body = {
			...body,
			title: title ?? name,
			posterPath: poster_path,
			createdAt: new Date().toUTCString(),
			originalTitle: original_name ?? original_title,
			releaseDate: release_date ?? first_air_date,
			mediaType: media_type,
			requestUser: await getMediaRequestUser()
		}

		return await axios.put(`${API_ENDPOINT}/requests`, body, API_REQUEST_CONFIG)
	} catch (error) {
		console.log(error)
		return error
	}
}

export async function deleteMediaRequest(id, handleRequestSubmit) {
	try {
		return await axios
			.delete(`${API_ENDPOINT}/requests/${id}`, API_REQUEST_CONFIG)
			.then(() => {
				handleRequestSubmit()
			})
	} catch (error) {
		console.log(error)
		return error
	}
}

export async function updateMediaRequest(body) {
	try {
		const {
			id,
			title,
			name,
			originalName,
			originalTitle,
			releaseDate,
			firstAirDate,
			handleRequestSubmit
		} = body
		body.title = title ?? name
		body.createdAt = new Date().toUTCString()
		body.originalTitle = originalName ?? originalTitle
		body.releaseDate = releaseDate ?? firstAirDate

		return await axios
			.put(`${API_ENDPOINT}/requests/${id}`, body, API_REQUEST_CONFIG)
			.then(() => handleRequestSubmit())
	} catch (error) {
		console.log(error)
		return error
	}
}
