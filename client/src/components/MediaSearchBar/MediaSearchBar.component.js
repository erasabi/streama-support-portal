import React, { useMemo } from 'react'
import styled from 'styled-components'
import { debounce } from 'lodash'
import { useDispatch, useSelector } from 'react-redux'
import { addMediaRequest, searchMediaSuggestions } from '/src/api'
import useInput from '/src/hooks/useInput.hook'
import { handleRequestSubmit } from '/src/redux'
import { Searchbar, Dropdown } from '/src/styles'
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

function MediaSearchbar() {
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
			<Dropdown.Options style={{ height: '50vh' }}>
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
			<Searchbar>
				<Searchbar.TextInput
					placeholder="Search by Movie or Show"
					disableSearchBtn={disableSearchBtn.value}
					value={search.value}
					onChange={(e) => onChange(e.target.value)}
				/>
				<Searchbar.Button
					disabled={disableSearchBtn.value}
					onClick={onRequest}
				/>
			</Searchbar>
			<Dropdown>{MemoizedSuggestedMedia}</Dropdown>
		</Wrapper>
	)
}

export default MediaSearchbar

const Wrapper = styled.div`
	display: flex;
	flex-direction: column;
	margin: 0 auto;

	// phones
	@media only screen and (max-width: 600px) {
		min-width: 200px;
	}
	// tablets
	@media only screen and (min-width: 600px) {
		width: 400px;
	}

	// desktops
	@media only screen and (min-width: 1200px) {
		width: 600px;
	}
`
