/* eslint-disable no-unused-vars */
/* eslint-disable react/prop-types */
import React, { useMemo, useContext, useState } from 'react'
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
import { addMediaRequest } from '/src/api'
import { submitRequestSuccess } from '/src/redux'
import { useDispatch } from 'react-redux'
import { isAdmin, isSuperuser, matchesUser } from '/src/auth'
import { UserContext } from '/src/hooks/userContext.hook'
import { CardField, CardTitle } from './MediaDetails.component'

export default function UpdateExistingMedia(props) {
	const {
		id,
		mediaType,
		queueStatus,
		queueMessage,
		requestUser,
		onSubmitted,
		...restProps
	} = props
	const isTv = ['tv', 'tvshow', 'show'].includes(
		String(mediaType || '').toLowerCase()
	)
	const { user = { username: 'Anonymous' } } = useContext(UserContext)
	const dispatch = useDispatch()
	const [isSubmitting, setIsSubmitting] = useState(false)
	const isUserMatch = matchesUser(user, requestUser)
	const isAuth = isAdmin(user) || isSuperuser(user)
	let { handleModal } = useContext(ModalContext)
	const status = useInput(queueStatus ?? '')
	const message = useInput(
		isTv && queueStatus === 'Request Update'
			? 'Fetch New Seasons'
			: (queueMessage ?? '')
	)
	const showQueueMessageDropdown = useToggle(false)
	const closeMessageDropdown = () => showQueueMessageDropdown.setValue(false)
	const dropdownMessageRef = useClickOutside(closeMessageDropdown)

	const onSubmit = async () => {
		if (isSubmitting) return
		setIsSubmitting(true)
		try {
			const body = merge({}, props, {
				queueStatus: status.value,
				queueMessage: message.value
			})
			delete body.onSubmitted
			delete body.handleRequestSubmit
			const { data } = await addMediaRequest(body, user.username)
			if (typeof onSubmitted === 'function') onSubmitted()
			dispatch(submitRequestSuccess(data))
			handleModal()
		} catch (error) {
			console.log(error)
		} finally {
			setIsSubmitting(false)
		}
	}

	Searchbar.MessageDropdown = useMemo(() => {
		const RequestDetailsOptions = [
			'Fetch New Seasons',
			'Video Not Working',
			'Wrong Video',
			'Add Subtitles',
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
					<Dropdown.Options ref={dropdownMessageRef} style={{ maxHeight: '240px' }}>
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

	return (
		<Wrapper {...restProps}>
			<Card className="card">
				<CardTitle text={props.title} />
				<Card.Content className="card-content">
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
						className="update"
						disabled={isEmpty(message.value) || isSubmitting}
						onClick={onSubmit}
					>
						{isSubmitting ? 'Submitting…' : 'Submit'}
					</Button>
				</Button.Group>
			</Card>
		</Wrapper>
	)
}

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
