import React from 'react'
import styled from 'styled-components'
import { STREAMA_ENDPOINT } from '../../constants'
import BackArrowImg from '/src/media/images/back-arrow.png'

function Header() {
	return (
		<Wrapper>
			<a href={STREAMA_ENDPOINT}>
				<img src={BackArrowImg} />
			</a>
		</Wrapper>
	)
}

export default Header

const Wrapper = styled.header`
	background-color: ${(props) => props.theme.color.background.header};
	height: 60px;
	padding: 4px 16px;

	img {
		height: 56px;
	}
`
