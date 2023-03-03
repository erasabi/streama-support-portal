import React from 'react'
import axios from 'axios'
import styled from 'styled-components'
import { debounce } from 'lodash'
import { useDispatch, useSelector } from 'react-redux'
import SearchSuggestions from './SearchSuggestions.component'
import { addMediaRequest, searchMediaSuggestions } from '/src/api'
import { API_REQUEST_CONFIG, STREAMA_ENDPOINT } from '/src/constants'
import useInput from '/src/hooks/useInput.hook'
import { handleRequestSubmit } from '/src/redux'
import SearchBar from '/src/styles/SearchBar/SearchBar.component'

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

function MediaSearchBar() {
	const dispatch = useDispatch()
	const state = useSelector((state) => state)
	const searchValue = useInput('')
	const disableSearchBtn = useInput(true)
	const searchResults = useInput(null)

	async function fetchSearchResults() {
		try {
			if (searchValue.value.length > 2) {
				const { data } = await searchMediaSuggestions(searchValue.value)
				searchResults.setValue(data.results)
			}
		} catch (error) {
			console.warn(error)
			searchResults.setValue(null)
		}
	}

	const debouncedFetchSearchResults = debounce(fetchSearchResults, 500)

	async function onRequest() {
		try {
			const value = state.value
			const body = {
				id: value.id,
				title: value.title || value.name,
				posterPath: value.poster_path,
				createdAt: new Date().toUTCString(),
				originalTitle: value.original_name || value.original_title || null,
				releaseDate: value.release_date || value.first_air_date || null,
				adult: value.adult || false,
				mediaType: value.media_type || null,
				queueStatus: value.queueStatus || null,
				queueMessage: value.queueMessage || null,
				requestUser: (await getMediaRequestUser()) || null
			}
			await addMediaRequest(body)
			dispatch(handleRequestSubmit())
		} catch (error) {
			console.warn(error)
		}
		searchValue.setValue('')
	}

	const onChange = (value) => {
		debouncedFetchSearchResults()
		searchValue.setValue(value)
		disableSearchBtn.setValue(true)
	}

	const onSelectSuggestedMedia = (selectedMedia) => {
		dispatch({ type: 'SELECT_MEDIA_SUGGESTION', value: selectedMedia })
		searchValue.setValue(
			selectedMedia.title ||
				selectedMedia.original_title ||
				selectedMedia.name ||
				selectedMedia.original_name
		)
		disableSearchBtn.setValue(false)
		searchResults.setValue(null)
	}

	return (
		<Wrapper>
			<SearchBar
				placeholder="Search by Movie or Show"
				disableSearchBtn={disableSearchBtn.value}
				value={searchValue.value}
				onChange={onChange}
				onSubmit={onRequest}
				dropdownComponent={
					<SearchSuggestions
						queryResults={searchResults.value}
						onSelect={onSelectSuggestedMedia}
					/>
				}
			/>
		</Wrapper>
	)
}

export default MediaSearchBar

const Wrapper = styled.div`
	margin: 0 auto;
	minimum-width: 200px;
	padding: 15px 0px;

	@media only screen and (min-width: 390px) {
		width: 250px;
	}
	@media only screen and (min-width: 600px) {
		width: 400px;
	}
	@media only screen and (min-width: 1200px) {
		width: 800px;
	}
`
