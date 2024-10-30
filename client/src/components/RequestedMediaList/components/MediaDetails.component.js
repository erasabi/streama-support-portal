/* eslint-disable react/prop-types */
import React, { useState, useEffect, useMemo, useContext } from 'react'
import { blue, red, grey } from '@mui/material/colors'
import { isEmpty, isEqual, merge } from 'lodash'
import { useInput, useToggle, useClickOutside } from '/src/hooks'
import styled from 'styled-components'
import {
	Button,
	ModalContext,
	Searchbar,
	Dropdown,
	Card,
	CopyText
} from '/src/styles'
import { deleteMediaRequest, updateMediaRequest, getYTSLinks } from '/src/api'
import { isAdmin, isSuperuser, matchesUser } from '/src/auth'
import { UserContext } from '/src/hooks/userContext.hook'

export default function MediaDetails(props) {
	const {
		id,
		handleRequestSubmit,
		mediaType,
		queueStatus,
		queueMessage,
		requestUser,
		...restProps
	} = props
	const { user = { username: 'Anonymous' } } = useContext(UserContext)
	const isUserMatch = matchesUser(user, requestUser)
	const isAuth = isAdmin(user) || isSuperuser(user)
	let { handleModal } = useContext(ModalContext)
	const status = useInput(queueStatus ?? '')
	const message = useInput(queueMessage ?? '')
	const showQueueStatusDropdown = useToggle(false)
	const closeDropdown = () => showQueueStatusDropdown.setValue(false)
	const dropdownRef = useClickOutside(closeDropdown)
	const showQueueMessageDropdown = useToggle(false)
	const closeMessageDropdown = () => showQueueMessageDropdown.setValue(false)
	const dropdownMessageRef = useClickOutside(closeMessageDropdown)
	const [magnet, setMagnet] = useState()
	const [movie, setMovie] = useState()
	const [subtitle, setSubtitle] = useState()
	const [isCopied, setCopied] = useState()

	const onDelete = () => {
		deleteMediaRequest(id, handleRequestSubmit)
		handleModal()
	}

	const onUpdate = () => {
		const body = merge({}, props, {
			queueStatus: status.value,
			queueMessage: message.value
		})
		updateMediaRequest(body)
		handleModal()
	}

	const handleCopy = async (type, value) => {
		if (!navigator.clipboard || !type || !value) {
			console.error('Clipboard API is not available or missing type/value.')
			return
		}

		try {
			await navigator.clipboard.writeText(value)
			setCopied(type)
			setTimeout(() => {
				setCopied(null)
			}, 2000)
		} catch (error) {
			console.error('Failed to copy text: ', error)
		}
	}

	Searchbar.StatusDropdown = useMemo(() => {
		const QueueStatusOptions = [
			'Not Yet Available',
			'Rolling Episodes',
			'Unavailable',
			'Complete Collection'
		]

		const getOptions = (value, options) => {
			try {
				return options.filter(
					(option) =>
						option.toLowerCase().includes(value.toLowerCase()) &&
						!isEqual(option.toLowerCase(), value.toLowerCase())
				)
			} catch (error) {
				console.log(error)
				return false
			}
		}
		const onDropdownSelect = (option) => {
			status.setValue(option)
			showQueueStatusDropdown.toggleValue()
		}
		const options = getOptions(status.value, QueueStatusOptions)

		return (
			!isEmpty(options) && (
				<Dropdown>
					<Dropdown.Options ref={dropdownRef} style={{ height: '50vh' }}>
						{options.map((option) => (
							<Dropdown.Option
								key={option}
								className="dropdown-option"
								onClick={() => onDropdownSelect(option)}
							>
								{option}
							</Dropdown.Option>
						))}
					</Dropdown.Options>
				</Dropdown>
			)
		)
	}, [status.value])

	Searchbar.MessageDropdown = useMemo(() => {
		const RequestDetailsOptions = [
			'Fetch New Seasons',
			'Video Not Working',
			'Wrong Video',
			'Add Subitles',
			'Fix Subtitles'
		]
		const getOptions = (value, options) => {
			try {
				return options.filter(
					(option) =>
						option.toLowerCase().includes(value.toLowerCase()) &&
						!isEqual(option.toLowerCase(), value.toLowerCase())
				)
			} catch (error) {
				console.log(error)
				return false
			}
		}
		const onDropdownSelect = (option) => {
			message.setValue(option)
			showQueueMessageDropdown.toggleValue()
		}
		const options = getOptions(message.value, RequestDetailsOptions)

		return (
			!isEmpty(options) && (
				<Dropdown>
					<Dropdown.Options ref={dropdownMessageRef} style={{ height: '50vh' }}>
						{options.map((option) => (
							<Dropdown.Option
								key={option}
								className="dropdown-option"
								onClick={() => onDropdownSelect(option)}
							>
								{option}
							</Dropdown.Option>
						))}
					</Dropdown.Options>
				</Dropdown>
			)
		)
	}, [message.value])

	const DaysAgo = useMemo(() => {
		function getDaysDifference(originalTimeString) {
			const targetDate = new Date(originalTimeString)
			const currentDate = new Date()
			// Calculate the time difference in milliseconds
			const timeDifference = targetDate - currentDate
			// Calculate the number of days
			const daysDifference = Math.floor(timeDifference / (1000 * 60 * 60 * 24))
			return daysDifference
		}
		const daysAgo = Math.abs(getDaysDifference(props.createdAt))
		return (
			<Card.Text>
				<span style={daysAgo > 7 ? { color: 'red', fontWeight: 500 } : {}}>
					{daysAgo}
				</span>
				{` ${daysAgo > 1 ? 'days' : 'day'} ago`}
			</Card.Text>
		)
	}, [props.createdAt])

	async function fetchMagnet() {
		try {
			if (mediaType === 'movie') {
				const { torrent, subtitle, movie } = await getYTSLinks(id)
				setMagnet(torrent)
				setSubtitle(subtitle)
				setMovie(movie)
			}
		} catch (error) {
			console.log(error)
		}
	}

	useEffect(() => {
		fetchMagnet()
	}, [])

	return (
		<Wrapper {...restProps}>
			<Card className="card">
				<CardTitle text={props.title} />
				<Card.Content className="card-content">
					{(isAuth || isUserMatch) && magnet && (
						<CardField label="Magnet URL">
							<MagnetLinkBtn onClick={() => handleCopy('magnet', magnet)}>
								{isCopied === 'magnet' ? 'Copied!' : 'Copy Magnet Link'}
							</MagnetLinkBtn>
							<span style={{ color: 'white' }}>{movie?.title}</span>
						</CardField>
					)}
					{(isAuth || isUserMatch) && subtitle && (
						<CardField label="Subtitle URL">
							<MagnetLinkBtn onClick={() => handleCopy('subtitle', subtitle)}>
								{isCopied === 'subtitle' ? 'Copied!' : 'Copy Subtitle Link'}
							</MagnetLinkBtn>
						</CardField>
					)}
					<CardField label="Requested">{DaysAgo}</CardField>
					{(isUserMatch || isAuth) && (
						<CardField label="Requested By">
							<Card.Text>
								<CopyText
									text={props.requestUser}
									copyValue={
										!isEmpty(props.requestUser)
											? `Requested by ${
													props.requestUser.charAt(0).toUpperCase() +
													props.requestUser.slice(1)
											  }`
											: props.requestUser
									}
								/>
							</Card.Text>
						</CardField>
					)}
					<CardField label="Released">
						<Card.Text>{props.releaseDate}</Card.Text>
					</CardField>
					<CardField label="Media Type">
						<Card.Text>{props.mediaType}</Card.Text>
					</CardField>
					{isAuth && (
						<CardField label="Queue Status">
							<div className="searchbar">
								<Searchbar>
									<Searchbar.TextInput
										className="searchbar-text-input"
										placeholder="Queue Status"
										value={status.value}
										onChange={status.onChange}
										onFocus={() => showQueueStatusDropdown.setValue(true)}
									/>
								</Searchbar>
								{showQueueStatusDropdown.value && Searchbar.StatusDropdown}
							</div>
						</CardField>
					)}
					{(isUserMatch || isAuth) && (
						<CardField label="Request Details">
							<div className="searchbar">
								<Searchbar>
									<Searchbar.TextInput
										className="searchbar-text-input"
										placeholder="Choose or Write Anything"
										value={message.value}
										onChange={message.onChange}
										onFocus={() => showQueueMessageDropdown.setValue(true)}
									/>
								</Searchbar>
								{showQueueMessageDropdown.value && Searchbar.MessageDropdown}
							</div>
						</CardField>
					)}
				</Card.Content>
				<Button.Group className="button-group">
					<Button className="cancel" onClick={handleModal}>
						Cancel
					</Button>
					<Button
						className="delete"
						disabled={!(isUserMatch || isAuth)}
						onClick={onDelete}
					>
						Delete
					</Button>
					<Button
						className="update"
						disabled={!(isUserMatch || isAuth)}
						onClick={onUpdate}
					>
						Update
					</Button>
				</Button.Group>
			</Card>
		</Wrapper>
	)
}

export const CardTitle = styled(CopyText)`
	display: flex;
	justify-content: center;

	.text {
		font-size: 25px;
		color: red;

		@media only screen and (min-width: ${(props) =>
				props.theme.breakpoints.tablet}) {
			font-size: 50px;
		}
	}

	.icon {
		width: 15px;

		@media only screen and (min-width: ${(props) =>
				props.theme.breakpoints.tablet}) {
			width: 35px;
		}
	}
`

export const CardField = styled(Card.Field)``

const MagnetLinkBtn = styled(Button)`
	width: 150px;
`

const Wrapper = styled.div`
	.card {
		flex-direction: column;
		gap: 50px;
	}

	.card-content {
		margin: 0 auto;

		div.searchbar {
			width: 150px;
			@media only screen and (min-width: ${(props) =>
					props.theme.breakpoints.tablet}) {
				width: 200px;
			}

			@media only screen and (min-width: ${(props) =>
					props.theme.breakpoints.laptop}) {
				width: 250px;
			}
		}

		.searchbar-text-input {
			--background-color: ${grey[700]};
			::placeholder {
				color: white;
				opacity: 0.5;
			}
		}
	}

	.dropdown-option {
		--background-color: ${grey[700]};
		fontsize: 20px;
	}

	.button-group > button {
		border-radius: 0px;

		&.cancel {
			--background-color: ${grey[700]};
		}

		&.delete {
			--background-color: ${red[500]};
		}

		&.update {
			--background-color: ${blue[500]};
		}
	}
`
