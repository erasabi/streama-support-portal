/* eslint-disable no-unused-vars */
/* eslint-disable react/prop-types */
import React, { useMemo, useContext } from 'react'
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
import { isAdmin, isSuperuser, matchesUser } from '/src/auth'
import { UserContext } from '/src/hooks/userContext.hook'
import { CardField, CardTitle } from './MediaDetails.component'

export default function UpdateExistingMedia(props) {
	const {
		id,
		mediaType,
		handleRequestSubmit,
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
	const showQueueMessageDropdown = useToggle(false)
	const closeMessageDropdown = () => showQueueMessageDropdown.setValue(false)
	const dropdownMessageRef = useClickOutside(closeMessageDropdown)

	const onSubmit = async () => {
		const body = merge({}, props, {
			queueStatus: status.value,
			queueMessage: message.value
		})
		await addMediaRequest(body)
		handleRequestSubmit()
		handleModal()
	}

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
						disabled={isEmpty(message.value)}
						onClick={onSubmit}
					>
						Submit
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
