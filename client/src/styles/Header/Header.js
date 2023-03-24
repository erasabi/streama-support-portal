/* eslint-disable react/prop-types */
import React from 'react'
import styled from 'styled-components'

export default function Header({ children, ...restProps }) {
	return <Container {...restProps}>{children}</Container>
}

Header.Link = function HeaderLink({ children, ...restProps }) {
	return <a {...restProps}>{children}</a>
}

Header.Logo = function HeaderLogo({ ...restProps }) {
	return <Logo {...restProps} />
}

const Container = styled.header`
	background-color: ${(props) => props.theme.color.background.header};
	display: flex;
	flex-direction: row;
	height: 60px;
	padding: 4px 16px;
`

const Logo = styled.img`
	height: 100%;
`
