import React, { useMemo } from 'react'
import styled from 'styled-components'
import { debounce } from 'lodash'
import { useDispatch, useSelector } from 'react-redux'
import { addMediaRequest, searchMediaSuggestions } from '/src/api'
import useInput from '/src/hooks/useInput.hook'
import { handleRequestSubmit } from '/src/redux'
import SearchBar from '/src/styles/Searchbar'
import Dropdown from '/src/styles/Dropdown'
import { TMDB_ENDPOINT } from '/src/constants'
import ImageNotFound from '/src/media/images/image-not-found.png'

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
	const suggestions = useInput(null)

	async function onRequest() {
		try {
			await addMediaRequest(state.value)
			search.setValue('')
			disableSearchBtn.setValue(true)
		} catch (error) {
			console.warn(error)
		}
		dispatch(handleRequestSubmit())
	}

	const onChange = (value) => {
		if (value.length < 1) {
			suggestions.setValue(null)
		}
		debouncedFetchSearchResults(value, suggestions.setValue)
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
		suggestions.setValue(null)
	}

	const MemoizedSuggestedMedia = useMemo(() => {
		const results =
			suggestions.value && suggestions.value.length > 0 ? suggestions.value : []

		return (
			<Dropdown.Options style={{ height: '500px' }}>
				{results.map((result) => (
					<Dropdown.Option key={result.id} onClick={onSelectSuggestedMedia}>
						<Dropdown.Image
							src={
								result.poster_path
									? TMDB_ENDPOINT + result.poster_path
									: ImageNotFound
							}
						/>
						<Dropdown.Title>
							{result.title ? result.title : result.name} (
							{result.release_date
								? parseInt(result.release_date)
								: parseInt(result.first_air_date)}
							)
						</Dropdown.Title>
					</Dropdown.Option>
				))}
			</Dropdown.Options>
		)
	}, [suggestions.value])

	return (
		<Wrapper>
			<SearchBar>
				<SearchBar.TextInput
					placeholder="Search by Movie or Show"
					disableSearchBtn={disableSearchBtn.value}
					value={search.value}
					onChange={(e) => onChange(e.target.value)}
				/>
				<SearchBar.Button
					disabled={disableSearchBtn.value}
					onClick={onRequest}
				/>
			</SearchBar>
			<Dropdown>{MemoizedSuggestedMedia}</Dropdown>
		</Wrapper>
	)
}

export default MediaSearchBar

const Wrapper = styled.div`
	display: flex;
	flex-direction: column;
	margin: 0 auto;
	minimum-width: 200px;

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
