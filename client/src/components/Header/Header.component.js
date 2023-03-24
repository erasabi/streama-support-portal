import React from 'react'
import { STREAMA_ENDPOINT } from '../../constants'
import BackArrowImg from '/src/media/images/back-arrow.png'
import Header from '/src/styles/Header'

function HeaderContainer() {
	return (
		<Header>
			<Header.Link href={STREAMA_ENDPOINT}>
				<Header.Logo src={BackArrowImg} />
			</Header.Link>
		</Header>
	)
}

export default HeaderContainer
