import React from 'react'
import styled from 'styled-components'
import { default as ButtonBase } from '../Button'

function Searchbar({ children, ...restProps }) {
	return <Container {...restProps}>{children}</Container>
}

export default Searchbar

Searchbar.TextInput = function SearchbarTextInput({ ...restProps }) {
	return <TextInput autoComplete="off" {...restProps} />
}

Searchbar.Button = function SearchbarButton({ ...restProps }) {
	return <Button {...restProps}>Request</Button>
}

const Container = styled.div`
	display: flex;
	flex-direction: row;
	justify-content: center;
`

const Button = styled(ButtonBase)`
	background-color: ${(props) => (props.disabled ? 'grey' : '#4a4aff')};
`

const TextInput = styled.input.attrs({ type: 'text' })`
	height: 40px;
	width: 100%;
	box-sizing: border-box;
	border: 1px solid rgb(24, 24, 24);
	border-radius: 4px;
	font-size: calc(1em + 0.1rem);
	background-color: var(
		--background-color,
		${(props) => props.theme.color.background.input.text}
	);
	color: white;
	background-position: 10px 10px;
	background-repeat: no-repeat;
	padding: 2px 10px;
	text-overflow: ellipsis;
`
