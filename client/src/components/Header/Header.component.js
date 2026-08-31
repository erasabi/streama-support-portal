import React, { useContext } from 'react'
import styled from 'styled-components'
import { STREAMA_ENDPOINT } from '../../constants'
import BackArrowImg from '/src/media/images/back-arrow.png'
import Header from '/src/styles/Header'
import { ModalContext } from '/src/styles'
import { UserContext } from '/src/hooks/userContext.hook'
import { isAdmin, isSuperuser } from '/src/auth'
import AdminHistory from '/src/components/AdminHistory'

function HeaderContainer() {
	const { user = { username: 'Anonymous' } } = useContext(UserContext)
	const { handleModal } = useContext(ModalContext)
	const showAdmin = isAdmin(user) || isSuperuser(user)

	return (
		<Header>
			<Header.Link href={STREAMA_ENDPOINT}>
				<Header.Logo src={BackArrowImg} />
			</Header.Link>
			{showAdmin && (
				<HistoryButton onClick={() => handleModal(<AdminHistory />)}>
					<span className="dot" />
					Request History
				</HistoryButton>
			)}
		</Header>
	)
}

export default HeaderContainer

const HistoryButton = styled.button`
	align-items: center;
	background: #1f6fd6;
	border: 1px solid #1f6fd6;
	border-radius: 6px;
	color: white;
	cursor: pointer;
	display: flex;
	font-size: 14px;
	font-weight: 500;
	gap: 8px;
	margin-left: auto;
	padding: 8px 16px;

	.dot {
		background: #7fffd4;
		border-radius: 50%;
		height: 8px;
		width: 8px;
	}

	&:hover {
		background: #1a5fc0;
	}
`
