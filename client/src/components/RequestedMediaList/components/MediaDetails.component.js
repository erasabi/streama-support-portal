/* eslint-disable react/prop-types */
import React, { useMemo, useContext } from 'react'
import { blue, red, grey } from '@mui/material/colors'
import { isEmpty, isEqual, merge } from 'lodash'
import { UserContext } from '/src/hooks/userContext.hook'
import { useInput, useToggle, useClickOutside } from '/src/hooks'
import { ADMIN_SECRETS, SUPERUSER_SECRETS } from '/src/constants'
import styled from 'styled-components'
import { Button, ModalContext, Searchbar, Dropdown, Card } from '/src/styles'
import { deleteMediaRequest, updateMediaRequest } from '/src/api'

const QueueStatusOptions = [
	'Not Yet Available',
	'Rolling Episodes',
	'Unavailable',
	'Complete Collection'
]

function isAdmin(user) {
	try {
		return (
			user.authorities?.filter((e) => e.displayName === ADMIN_SECRETS).length >
			0
		)
	} catch (error) {
		console.log(error)
		return false
	}
}

function isSuperUser(user) {
	try {
		return user.username === SUPERUSER_SECRETS
	} catch (error) {
		console.log(error)
		return false
	}
}

export default function MediaDetails(props) {
	const { id, handleRequestSubmit, queueStatus, queueMessage, ...restProps } =
		props
	const { user } = useContext(UserContext)
	const isAuth = user ? isAdmin(user) || isSuperUser(user) : false
	let { handleModal } = useContext(ModalContext)
	const status = useInput(queueStatus ?? '')
	const message = useInput(queueMessage ?? '')
	const showDropdown = useToggle(false)
	const closeDropdown = () => showDropdown.setValue(false)
	const dropdownRef = useClickOutside(closeDropdown)

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

	Searchbar.Dropdown = useMemo(() => {
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
			showDropdown.toggleValue()
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

	return (
		<Wrapper {...restProps}>
			<Card className="card">
				<Card.Title className="card-title">{props.title}</Card.Title>
				<Card.Content className="card-content">
					<CardField label="Created">
						<Card.Text>{props.createdAt}</Card.Text>
					</CardField>
					<CardField label="Released">
						<Card.Text>{props.releaseDate}</Card.Text>
					</CardField>
					<CardField label="Media Type">
						<Card.Text>{props.mediaType}</Card.Text>
					</CardField>
					<CardField label="Requested body">
						<Card.Text>{props.requestUser}</Card.Text>
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
										onFocus={() => showDropdown.setValue(true)}
									/>
								</Searchbar>
								{showDropdown.value && Searchbar.Dropdown}
							</div>
						</CardField>
					)}
				</Card.Content>
				<Button.Group className="button-group">
					<Button className="cancel" onClick={handleModal}>
						Cancel
					</Button>
					<Button className="delete" disabled={!isAuth} onClick={onDelete}>
						Delete
					</Button>
					<Button className="update" disabled={!isAuth} onClick={onUpdate}>
						Update
					</Button>
				</Button.Group>
			</Card>
		</Wrapper>
	)
}

const CardField = styled(Card.Field)``

const Wrapper = styled.div`
	.card {
		flex-direction: column;
		gap: 50px;
	}

	.card-title {
		text-align: center;
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
