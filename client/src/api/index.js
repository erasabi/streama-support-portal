import axios from 'axios'
import {
	API_ENDPOINT,
	API_REQUEST_CONFIG,
	STREAMA_ENDPOINT,
	MOVIEDB
} from '../constants'

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

export async function getYTSLinks(tmdbId) {
	try {
		let imdb_id = await axios
			.get(`${MOVIEDB.ENDPOINT.MOVIE}/${tmdbId}?api_key=${MOVIEDB.API_KEY}`)
			.then((res) => res.data?.imdb_id)

		let movie = await axios
			.get(`https://yts.mx/api/v2/movie_details.json?imdb_id=${imdb_id}`)
			.then((res) => res.data?.data?.movie)

		if (movie.id !== 0) {
			const torrentUrl = getTorrentUrl(movie.torrents)
			const { data: subtitleUrl } = await axios.get(
				`${API_ENDPOINT}/proxy/subtitle-url/${imdb_id}`
			)
			return { torrent: torrentUrl, subtitle: subtitleUrl, movie: movie }
		}
		return {}
	} catch (error) {
		console.log(error)
	}
}

export async function isReleased(tmdbId) {
	let isReleased = false
	try {
		let imdb_id = await axios
			.get(`${MOVIEDB.ENDPOINT.MOVIE}/${tmdbId}?api_key=${MOVIEDB.API_KEY}`)
			.then((res) => res.data?.imdb_id)

		let movie = await axios
			.get(`https://yts.mx/api/v2/movie_details.json?imdb_id=${imdb_id}`)
			.then((res) => res.data?.data?.movie)

		return movie.id === 0 ? false : true
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
	return await axios.get(
		`${MOVIEDB.ENDPOINT.MULTI}?api_key=${MOVIEDB.API_KEY}&language=en-US&include_adult=false&sort_by="vote_count.desc"&query=${searchValue}`
	)
}

export async function getMediaRequestUser() {
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
