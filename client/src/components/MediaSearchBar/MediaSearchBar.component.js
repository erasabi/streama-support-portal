import React, { useMemo, useContext } from 'react'
import styled from 'styled-components'
import { isEmpty, debounce } from 'lodash'
import { useDispatch, useSelector } from 'react-redux'
import {
	addMediaRequest,
	searchMediaSuggestions,
	checkDuplicateMediaRequest,
	getMediaRequestUser
} from '/src/api'
import { useInput, useClickOutside, useRenderArray } from '/src/hooks'
import { handleRequestSubmit } from '/src/redux'
import { ModalContext, Searchbar, Dropdown } from '/src/styles'
import { TMDB_ENDPOINT } from '/src/constants'
import ImageNotFound from '/src/media/images/image-not-found.png'
import UpdateExistingMedia from '../RequestedMediaList/components/UpdateExistingMedia.component'

async function fetchSearchResults(value, callback) {
	try {
		if (value.length > 2) {
			const { data } = await searchMediaSuggestions(value)
			callback(data.results)
		}
	} catch (error) {
		console.log(error)
		callback(null)
	}
}
const debouncedFetchSearchResults = debounce(fetchSearchResults, 500)

function MediaSearchbar() {
	const dispatch = useDispatch()
	const state = useSelector((state) => state)
	let { handleModal } = useContext(ModalContext)
	const search = useInput('')
	const selectedMediaExists = useInput(false)
	const disableSearchBtn = useInput(true)
	const suggestions = useRenderArray([])
	const closeDropdown = () => suggestions.clear()
	const dropdownRef = useClickOutside(closeDropdown)

	const resetSearchbar = () => {
		search.setValue('')
		disableSearchBtn.setValue(true)
		selectedMediaExists.setValue(false)
	}

	const onRequest = async (message = '') => {
		try {
			await addMediaRequest({ ...state.value, queueStatus: message })
		} catch (error) {
			console.log(error)
		}
		resetSearchbar()
		dispatch(handleRequestSubmit())
	}

	const onChange = (value) => {
		if (isEmpty(value)) {
			suggestions.clear()
		}
		debouncedFetchSearchResults(value, suggestions.setValue)
		search.setValue(value)
		disableSearchBtn.setValue(true)
		selectedMediaExists.setValue(false)
	}

	const onUpdateExistingRequest = async (queueStatus) => {
		const {
			title,
			name,
			poster_path,
			original_name,
			original_title,
			release_date,
			first_air_date,
			media_type
		} = state.value

		const data = {
			...state.value,
			title: title ?? name,
			posterPath: poster_path,
			createdAt: new Date().toUTCString(),
			originalTitle: original_name ?? original_title,
			releaseDate: release_date ?? first_air_date,
			mediaType: media_type,
			requestUser: await getMediaRequestUser()
		}
		handleModal(
			<UpdateExistingMedia
				{...data}
				queueStatus={queueStatus}
				handleRequestSubmit={() => {
					resetSearchbar()
					dispatch(handleRequestSubmit())
				}}
			/>
		)
	}

	const onSelectSuggestedMedia = async (selectedMedia) => {
		const {
			title,
			original_title,
			name,
			original_name,
			release_date,
			first_air_date,
			media_type
		} = selectedMedia
		dispatch({ type: 'SELECT_MEDIA_SUGGESTION', value: selectedMedia })
		search.setValue(title || original_title || name || original_name)
		disableSearchBtn.setValue(false)
		const isAlreadyAdded = await checkDuplicateMediaRequest(
			title ?? name,
			release_date ?? first_air_date,
			media_type
		)
		selectedMediaExists.setValue(isAlreadyAdded)
		suggestions.clear()
	}

	const MemoizedSuggestedMedia = useMemo(() => {
		return (
			suggestions.isNotEmpty && (
				<Dropdown>
					<Dropdown.Options ref={dropdownRef} style={{ height: '50vh' }}>
						{suggestions.value.map((result) => (
							<Dropdown.Option
								key={result.id}
								onClick={() => onSelectSuggestedMedia(result)}
							>
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
				</Dropdown>
			)
		)
	}, [suggestions.value])

	return (
		<Wrapper>
			<Searchbar>
				<Searchbar.TextInput
					placeholder="Search by Movie or Show"
					value={
						selectedMediaExists.value
							? search.value + ' (Already Available)'
							: search.value
					}
					onChange={(e) => onChange(e.target.value)}
					onFocus={(e) => onChange(e.target.value)}
				/>
				{!selectedMediaExists.value && (
					<Searchbar.Button
						disabled={disableSearchBtn.value}
						onClick={() => onRequest('')}
					>
						Request
					</Searchbar.Button>
				)}
				{selectedMediaExists.value && (
					<Searchbar.Button
						onClick={() => onUpdateExistingRequest('Request Update')}
						style={{ backgroundColor: '#40a140' }}
					>
						Request Update
					</Searchbar.Button>
				)}
				{selectedMediaExists.value && (
					<Searchbar.Button
						onClick={() => onUpdateExistingRequest('Report Issue')}
						style={{ backgroundColor: '#f35252' }}
					>
						Report Issue
					</Searchbar.Button>
				)}
			</Searchbar>
			{MemoizedSuggestedMedia}
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

	.dropdown-option {
		align-items: center;
	}
`
