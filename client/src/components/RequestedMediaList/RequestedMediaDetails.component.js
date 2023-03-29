/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable react/prop-types */
import { useContext } from 'react'
import { UserContext } from '/src/hooks/userContext.hook'
import { ADMIN_SECRETS, SUPERUSER_SECRETS } from '/src/constants'
import PropTypes from 'prop-types'
import React, { useState } from 'react'
import styled from 'styled-components'
import {
	Button,
	ButtonArray,
	ModalContext,
	Searchbar,
	Dropdown
} from '/src/styles'
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

function RequestedMediaDetails(props) {
	const userProfile = useContext(UserContext)
	const isAuth = userProfile?.user
		? isAdmin(userProfile?.user) || isSuperUser(userProfile?.user)
		: false
	let { handleModal } = useContext(ModalContext)
	const [dialog, setDialog] = useState({
		queueStatus: props.queueStatus || '',
		queueMessage: props.queueMessage || ''
	})

	const QueueStatusSelect = () => {
		return !dialog.queueStatus ? (
			<Dropdown>
				<Dropdown.Options style={{ height: '50vh' }}>
					{QueueStatusOptions.map((result, index) => (
						<Dropdown.Option
							style={{ '--background-color': '#8d8b8b', fontSize: '20px' }}
							key={index}
							onClick={() => onSelectQueueStatus(result)}
						>
							{result}
						</Dropdown.Option>
					))}
				</Dropdown.Options>
			</Dropdown>
		) : null
	}

	function onSelectQueueStatus(value) {
		setDialog({ ...dialog, queueStatus: value })
	}

	function onChange(e) {
		setDialog({ ...dialog, queueStatus: e.target.value })
	}

	return (
		<Wrapper>
			<h1>{props.title}</h1>
			<div className="body-container">
				<MediaDetail label="Created" value={props.createdAt} />
				<MediaDetail label="Released" value={props.releaseDate} />
				<MediaDetail label="Media Type" value={props.mediaType} />
				<MediaDetail label="Requested body" value={props.requestUser} />
				{isAuth && (
					<div className="modalContentUpdatable">
						<h2>Queue Status:</h2>
						<SearchbarContainer>
							<Searchbar>
								<Searchbar.TextInput
									style={{ '--background-color': '#726f6f' }}
									placeholder="Queue Status"
									value={dialog.queueStatus}
									onChange={onChange}
								/>
							</Searchbar>
							<QueueStatusSelect />
						</SearchbarContainer>
					</div>
				)}
			</div>
			<ButtonArray>
				<Button onClick={handleModal}>Cancel</Button>
				{isAuth && (
					<Button
						style={{ '--background-color': '#e44e4e' }}
						onClick={() => {
							deleteMediaRequest(props, props.id)
							handleModal()
						}}
					>
						Delete
					</Button>
				)}
				{isAuth && (
					<Button
						style={{ '--background-color': '#4a4aff' }}
						onClick={() => {
							updateMediaRequest(props, props.id, dialog)
							handleModal()
						}}
					>
						Update
					</Button>
				)}
			</ButtonArray>
		</Wrapper>
	)
}

export default RequestedMediaDetails

const Wrapper = styled.div`
	display: flex;
	flex-direction: column;
	gap: 50px;

	h1 {
		color: #ff2828;
		text-align: center;
		font-weight: 400;
	}

	h2 {
		color: white;
		font-weight: 300;
	}

	.body-container {
		display: flex;
		gap: 10px;
		flex-direction: column;
	}

	.modalContentUpdatable {
		align-items: center;
		display: flex;
		gap: 10px;
	}
`

const MediaDetail = ({ label, value }) =>
	value ? (
		<h2>
			{label}: {value}
		</h2>
	) : null

const SearchbarContainer = styled.div`
	width: 250px;
`
