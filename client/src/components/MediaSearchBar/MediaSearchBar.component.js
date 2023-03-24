import React from 'react'
import styled from 'styled-components'
import { debounce } from 'lodash'
import { useDispatch, useSelector } from 'react-redux'
import SearchSuggestions from './SearchSuggestions.component'
import { addMediaRequest, searchMediaSuggestions } from '/src/api'
import useInput from '/src/hooks/useInput.hook'
import { handleRequestSubmit } from '/src/redux'
import SearchBar from '/src/styles/SearchBar/SearchBar.component'

async function fetchSearchResults(value, callback) {
	try {
		if (value.length > 2) {
			const { data } = await searchMediaSuggestions(value)
			callback(data.results)
		}
	} catch (error) {
		console.warn(error)
		callback(null)
	}
}
const debouncedFetchSearchResults = debounce(fetchSearchResults, 500)

function MediaSearchBar() {
	const dispatch = useDispatch()
	const state = useSelector((state) => state)
	const search = useInput('')
	const disableSearchBtn = useInput(true)
	const searchResults = useInput(null)

	async function onRequest() {
		try {
			await addMediaRequest(state.value)
			search.setValue('')
		} catch (error) {
			console.warn(error)
		}
		dispatch(handleRequestSubmit())
	}

	const onChange = (value) => {
		if (value.length < 1) {
			searchResults.setValue(null)
		}
		debouncedFetchSearchResults(value, searchResults.setValue)
		search.setValue(value)
		disableSearchBtn.setValue(true)
	}

	const onSelectSuggestedMedia = (selectedMedia) => {
		dispatch({ type: 'SELECT_MEDIA_SUGGESTION', value: selectedMedia })
		search.setValue(
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
				value={search.value}
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
