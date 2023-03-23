/* eslint-disable react/prop-types */
import { useContext } from 'react'
import { UserContext } from '/src/hooks/userContext.hook'
import { ADMIN_SECRETS, SUPERUSER_SECRETS } from '/src/constants'
import PropTypes from 'prop-types'
import React, { useState } from 'react'
import styled from 'styled-components'
import { ButtonArray } from '/src/styles'
import { deleteMediaRequest, updateMediaRequest } from '/src/api'
import { ModalContext } from '/src/styles/Modal'
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
		: !false
	let { handleModal } = useContext(ModalContext)
	const [dialog, setDialog] = useState({
		queueStatus: props.queueStatus || '',
		queueMessage: props.queueMessage || ''
	})
	const [openDropdown, setOpenDropdown] = useState(false)

	function onDropdownSelect(value) {
		setDialog({ ...dialog, queueStatus: value })
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
						<div>
							<input
								type="text"
								autoComplete="off"
								id="titleText"
								value={dialog.queueStatus}
								placeholder=""
								onChange={(e) =>
									setDialog({ ...dialog, queueStatus: e.target.value })
								}
								onFocus={() => setOpenDropdown(true)}
							/>
							{dialog?.queueStatus?.length === 0 && openDropdown && (
								<Dropdown onClick={onDropdownSelect} />
							)}
						</div>
					</div>
				)}
			</div>
			<ButtonArray>
				<button onClick={handleModal}>Cancel</button>
				{isAuth && (
					<button
						style={{ '--background-color': '#e44e4e' }}
						onClick={() => {
							deleteMediaRequest(props, props.id)
							handleModal()
						}}
					>
						Delete
					</button>
				)}
				{isAuth && (
					<button
						style={{ '--background-color': '#4a4aff' }}
						onClick={() => {
							updateMediaRequest(props, props.id, dialog)
							handleModal()
						}}
					>
						Update
					</button>
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
		color: white;
		display: flex;
		flex-direction: row;
		font-weight: 300;
		gap: 10px;
	}

	input[type='text'] {
		--background-color: #726f6f;
	}
`

const MediaDetail = ({ label, value }) =>
	value ? (
		<h2>
			{label}: {value}
		</h2>
	) : null

function Dropdown({ options = QueueStatusOptions, onClick }) {
	return (
		<DropdownContainer>
			{options.map((option) => (
				<DropdownItem key={option} onClick={() => onClick(option)}>
					{option}
				</DropdownItem>
			))}
		</DropdownContainer>
	)
}

Dropdown.propTypes = {
	options: PropTypes.array,
	onClick: PropTypes.func
}

const DropdownContainer = styled.div`
	position: absolute;
	z-index: 1;
`

const DropdownItem = styled.div`
	background-color: #6e6c6c;
	border: black solid 1px;
	box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
	color: white;
	font-size: 18px;
	min-width: 160px;
	padding: 12px 16px;
	&:hover {
		background-color: white;
		color: #6e6c6c;
	}
`
