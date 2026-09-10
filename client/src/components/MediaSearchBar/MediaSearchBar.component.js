import React, { useContext, useState } from 'react'
import styled from 'styled-components'
import { isEmpty, debounce } from 'lodash'
import { useDispatch, useSelector } from 'react-redux'
import {
	addMediaRequest,
	searchMediaSuggestions,
	checkDuplicateMediaRequest
} from '/src/api'
import { useInput, useClickOutside, useRenderArray } from '/src/hooks'
import { submitRequestSuccess } from '/src/redux'
import { isAdmin, isSuperuser } from '/src/auth'
import { DryRunModal } from '/src/components/PipelineTrace'
import { UserContext } from '/src/hooks/userContext.hook'
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
	const { user = { username: 'Anonymous' } } = useContext(UserContext)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [dryRunOpen, setDryRunOpen] = useState(false)
	const [dryRunNonce, setDryRunNonce] = useState(0)
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
		if (isSubmitting || disableSearchBtn.value) return
		setIsSubmitting(true)
		try {
			const requestUser = user?.username || 'Anonymous'
			const { data } = await addMediaRequest(
				{ ...state.value, queueStatus: message },
				requestUser
			)
			resetSearchbar()
			dispatch(submitRequestSuccess(data))
		} catch (error) {
			console.log(error)
		} finally {
			setIsSubmitting(false)
		}
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
			requestUser: user?.username || 'Anonymous'
		}
		handleModal(
			<UpdateExistingMedia
				{...data}
				queueStatus={queueStatus}
				onSubmitted={resetSearchbar}
			/>
		)
	}

	const launchDryRun = () => {
		setDryRunNonce((n) => n + 1)
		setDryRunOpen(true)
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
		suggestions.clear()
		try {
			const isAlreadyAdded = await checkDuplicateMediaRequest(
				title ?? name,
				release_date ?? first_air_date,
				media_type
			)
			selectedMediaExists.setValue(isAlreadyAdded)
		} catch (error) {
			console.log(error)
		}
	}

	const requestBusy = isSubmitting
	const isAuth = isAdmin(user) || isSuperuser(user)
	const selectedTitle =
		(state.value && (state.value.title || state.value.name)) || 'this title'

	// Preview the selected suggestion before it is ever created.
	const dryRunInput = () => {
		const media = state.value || {}
		const releaseDate = media.release_date || media.first_air_date || ''
		return {
			tmdbId: media.id != null ? String(media.id) : '',
			title: media.title || media.name || '',
			mediaType: media.media_type || 'movie',
			year: String(releaseDate).slice(0, 4) || undefined
		}
	}

	const openDryRun = (event) => {
		if (event) {
			event.preventDefault()
			event.stopPropagation()
		}
		launchDryRun()
	}

	return (
		<Wrapper>
			<Searchbar aria-busy={requestBusy}>
				<Searchbar.TextInput
					placeholder="Search by Movie or Show"
					disabled={requestBusy}
					value={search.value}
					onChange={(e) => onChange(e.target.value)}
					onFocus={() => {
						if (search.value.length > 2) {
							debouncedFetchSearchResults(
								search.value,
								suggestions.setValue
							)
						}
					}}
				/>
				{!selectedMediaExists.value && (
					<Searchbar.Button
						disabled={disableSearchBtn.value || requestBusy}
						onClick={() => onRequest('')}
					>
						{requestBusy ? 'Requesting…' : 'Request'}
					</Searchbar.Button>
				)}
				{selectedMediaExists.value && (
					<Searchbar.Button
						disabled={requestBusy}
						onClick={() => onUpdateExistingRequest('Request Update')}
						style={{ backgroundColor: '#40a140' }}
					>
						Request Update
					</Searchbar.Button>
				)}
				{selectedMediaExists.value && (
					<Searchbar.Button
						disabled={requestBusy}
						onClick={() => onUpdateExistingRequest('Report Issue')}
						style={{ backgroundColor: '#f35252' }}
					>
						Report Issue
					</Searchbar.Button>
				)}
				{isAuth && !disableSearchBtn.value && state.value?.id != null && (
					<Searchbar.Button
						onMouseDown={openDryRun}
						style={{ backgroundColor: '#455a64' }}
					>
						Dry Run
					</Searchbar.Button>
				)}
			</Searchbar>
			{selectedMediaExists.value && (
				<AlreadyHint>Already in the library</AlreadyHint>
			)}
			<DryRunModal
				key={dryRunNonce}
				open={dryRunOpen}
				onClose={() => setDryRunOpen(false)}
				user={user}
				getInput={dryRunInput}
				heading={`Dry run · ${selectedTitle}`}
			/>
			{suggestions.isNotEmpty && (
				<Dropdown>
					<Dropdown.Options ref={dropdownRef} style={{ height: '50vh' }}>
						{suggestions.value.map((result) => (
							<Dropdown.Option
								key={result.id}
								onMouseDown={(event) => {
									event.preventDefault()
									event.stopPropagation()
									onSelectSuggestedMedia(result)
								}}
							>
								<Dropdown.Image
									src={
										result.poster_path
											? TMDB_ENDPOINT + result.poster_path
											: ImageNotFound
									}
								/>
								<Dropdown.Title>
									<span>
										{result.title ? result.title : result.name} (
										{result.release_date
											? parseInt(result.release_date)
											: parseInt(result.first_air_date)}
										)
									</span>
									{result.media_type === 'movie' && <MovieProjectorIcon />}
									{result.media_type === 'tv' && <AntennaTvIcon />}
								</Dropdown.Title>
							</Dropdown.Option>
						))}
					</Dropdown.Options>
				</Dropdown>
			)}
		</Wrapper>
	)
}

export default MediaSearchbar

function MovieProjectorIcon() {
	return (
		<TypeIcon title="Movie" aria-label="Movie">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path
					fill="currentColor"
					fillRule="evenodd"
					d="M7.4 2a4.3 4.3 0 1 0 0 8.6A4.3 4.3 0 0 0 7.4 2zm0 2.7a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z"
				/>
				<path
					fill="currentColor"
					fillRule="evenodd"
					d="M15.4 3.1a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2zm0 2.3a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"
				/>
				<rect
					x="3.1"
					y="10.4"
					width="13.4"
					height="7.3"
					rx="1.3"
					fill="currentColor"
				/>
				<rect
					x="16.2"
					y="12.2"
					width="3.3"
					height="4.2"
					rx="0.55"
					fill="currentColor"
				/>
				<circle cx="21.1" cy="14.3" r="2.05" fill="currentColor" />
				<rect
					x="6.1"
					y="17.4"
					width="1.85"
					height="4.4"
					rx="0.4"
					fill="currentColor"
				/>
				<rect
					x="13.2"
					y="17.4"
					width="1.85"
					height="4.4"
					rx="0.4"
					fill="currentColor"
				/>
			</svg>
		</TypeIcon>
	)
}

function AntennaTvIcon() {
	return (
		<TypeIcon title="TV show" aria-label="TV show">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M12 8.1L4.8 1.6M12 8.1l7.2-6.5"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.7"
					strokeLinecap="round"
				/>
				<circle cx="4.8" cy="1.6" r="1.15" fill="currentColor" />
				<circle cx="19.2" cy="1.6" r="1.15" fill="currentColor" />
				<path
					fill="currentColor"
					fillRule="evenodd"
					d="M3.1 8.2h17.8c1.05 0 1.9.85 1.9 1.9v9.1c0 1.05-.85 1.9-1.9 1.9H3.1c-1.05 0-1.9-.85-1.9-1.9v-9.1c0-1.05.85-1.9 1.9-1.9zm2.5 3h10.6c.45 0 .8.35.8.8v5.5c0 .45-.35.8-.8.8H5.6c-.45 0-.8-.35-.8-.8v-5.5c0-.45.35-.8.8-.8z"
				/>
				<rect
					x="5.6"
					y="21.15"
					width="3.2"
					height="1.55"
					rx="0.4"
					fill="currentColor"
				/>
				<rect
					x="15.2"
					y="21.15"
					width="3.2"
					height="1.55"
					rx="0.4"
					fill="currentColor"
				/>
			</svg>
		</TypeIcon>
	)
}

const TypeIcon = styled.span`
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	opacity: 0.95;
	overflow: visible;
	line-height: 0;

	svg {
		display: block;
		width: 32px;
		height: 32px;
		overflow: visible;
	}
`

const AlreadyHint = styled.p`
	color: #9ccc9c;
	font-size: 13px;
	margin: 6px 0 0;
	text-align: center;
`

const Wrapper = styled.div`
	display: flex;
	flex-direction: column;
	margin: 0 auto;

	// phones
	@media only screen and (max-width: 600px) {
		min-width: 300px;
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
