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
			.get(
				` https://movies-api.accel.li/api/v2/movie_details.json?imdb_id=${imdb_id}`
			)
			.then((res) => res.data?.data?.movie)

		if (movie.id !== 0) {
			let torrentUrl = null
			let subtitleUrl = null

			// Try to get torrent URL, but don't fail if it errors
			try {
				torrentUrl = getTorrentUrl(movie.torrents)
			} catch (error) {
				console.log('Error getting torrent URL:', error)
			}

			// Try to get subtitle URL, but don't fail if it errors
			try {
				const { data } = await axios.get(
					`${API_ENDPOINT}/proxy/subtitle-url/${imdb_id}`
				)
				subtitleUrl = data
			} catch (error) {
				console.log('Error getting subtitle URL:', error)
			}

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
			.get(
				` https://movies-api.accel.li/api/v2/movie_details.json?imdb_id=${imdb_id}`
			)
			.then((res) => res.data?.data?.movie)

		return movie.id === 0 ? false : true
	} catch (error) {
		console.log(error)
	}
	return isReleased
}

export async function getRequestedMedia() {
	const config =
		API_REQUEST_CONFIG && typeof API_REQUEST_CONFIG === 'object'
			? API_REQUEST_CONFIG
			: {}
	return await axios.get(`${API_ENDPOINT}/requests/all`, {
		...config,
		params: { ...(config.params || {}), _ts: Date.now() }
	})
}

// Forward Streama identity so the server can gate magnet visibility + admin
// actions. This is best-effort (headers are spoofable); locking the whole API
// behind a Streama session is a documented follow-up.
export function authHeaders(user) {
	const headers = {}
	if (user && user.username) headers['x-streama-user'] = user.username
	if (user && Array.isArray(user.authorities)) {
		headers['x-streama-authorities'] = user.authorities
			.map((a) => a.displayName)
			.join(',')
	}
	return { headers }
}

export async function getRequestDetails(id, user) {
	const { data } = await axios.get(
		`${API_ENDPOINT}/requests/${id}`,
		authHeaders(user)
	)
	return data
}

export async function getRequestEvents(id, user) {
	try {
		const { data } = await axios.get(
			`${API_ENDPOINT}/requests/${id}/events`,
			authHeaders(user)
		)
		return data
	} catch (error) {
		console.warn('getRequestEvents failed:', error?.message)
		return []
	}
}

// Full cross-hop trace for one request (admin only). Pass remote=false to skip
// the optional Prelanflix/Sortify calls when they are slow or unreachable.
export async function getRequestTrace(id, user, { remote = true } = {}) {
	const { data } = await axios.get(
		`${API_ENDPOINT}/requests/${id}/trace${remote ? '' : '?remote=0'}`,
		authHeaders(user)
	)
	return data
}

// Rehearse a request without creating anything (admin only).
export async function dryRunRequest(body, user) {
	const { data } = await axios.post(
		`${API_ENDPOINT}/requests/dry-run`,
		body,
		{ ...authHeaders(user), timeout: 60000 }
	)
	return data
}

export async function getDryRun(id, user) {
	const { data } = await axios.get(`${API_ENDPOINT}/requests/dry-run/${id}`, {
		...authHeaders(user),
		timeout: 20000
	})
	return data
}

export async function listDryRuns({ tmdbId, requestId } = {}, user) {
	const params = new URLSearchParams()
	if (tmdbId) params.set('tmdbId', tmdbId)
	if (requestId) params.set('requestId', requestId)
	const { data } = await axios.get(`${API_ENDPOINT}/requests/dry-runs?${params}`, {
		...authHeaders(user),
		timeout: 20000
	})
	return data
}

export async function attachRequestSource(id, body, user) {
	return await axios.post(`${API_ENDPOINT}/requests/${id}/source`, body, {
		...authHeaders(user)
	})
}

// Replace the full source list for a request (add + remove in one call).
export async function saveRequestSources(id, magnetUrls, user) {
	return await axios.put(
		`${API_ENDPOINT}/requests/${id}/sources`,
		{ magnetUrls },
		{ ...authHeaders(user) }
	)
}

export async function addRequestSubtitles(id, user) {
	const { data } = await axios.post(
		`${API_ENDPOINT}/requests/${id}/subtitles`,
		{},
		authHeaders(user)
	)
	return data
}

export async function approveRequestSeasons(id, seasons, user) {
	const { data } = await axios.post(
		`${API_ENDPOINT}/requests/${id}/seasons`,
		{ seasons },
		authHeaders(user)
	)
	return data
}

export async function getAdminHistory(params = {}, user) {
	const query = new URLSearchParams(params).toString()
	const { data } = await axios.get(
		`${API_ENDPOINT}/admin/history${query ? `?${query}` : ''}`,
		authHeaders(user)
	)
	return data
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
			const sameTitle = item.title === title || item.name === title
			const sameDate =
				item.release_date === releaseDate ||
				item.first_air_date === releaseDate
			if (sameTitle && sameDate) {
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

export async function addMediaRequest(body = {}, requestUser) {
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

	const payload = {
		...body,
		id: body.id != null ? String(body.id) : body.id,
		title: title ?? name,
		posterPath: poster_path || body.posterPath,
		createdAt: new Date().toUTCString(),
		originalTitle: original_name ?? original_title ?? body.originalTitle,
		releaseDate: release_date ?? first_air_date ?? body.releaseDate,
		mediaType: media_type || body.mediaType,
		requestUser:
			requestUser != null && requestUser !== ''
				? requestUser
				: await getMediaRequestUser()
	}

	return await axios.put(`${API_ENDPOINT}/requests`, payload, API_REQUEST_CONFIG)
}

export async function deleteMediaRequest(id, handleRequestSubmit) {
	try {
		return await axios
			.delete(`${API_ENDPOINT}/requests/${id}`, API_REQUEST_CONFIG)
			.then(() => {
				if (typeof handleRequestSubmit === 'function') handleRequestSubmit()
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
			.then(() => {
				if (typeof handleRequestSubmit === 'function') handleRequestSubmit()
			})
	} catch (error) {
		console.log(error)
		return error
	}
}
