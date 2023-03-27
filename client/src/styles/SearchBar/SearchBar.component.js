import React from 'react'
import styled from 'styled-components'

function SearchBar({ children, ...restProps }) {
	return <Container {...restProps}>{children}</Container>
}

export default SearchBar

SearchBar.TextInput = function SearchBarTextInput({ ...restProps }) {
	return <TextInput autoComplete="off" {...restProps} />
}

SearchBar.Button = function SearchBarTextInput({ ...restProps }) {
	return <Button {...restProps}>Request</Button>
}

SearchBar.Dropdown = function SearchBarDropdown({ children, ...restProps }) {
	return <Dropdown {...restProps}>{children}</Dropdown>
}

const Dropdown = styled.div`
	width: inherit;
`

const TextInput = styled.input.attrs({ type: 'text' })`
	height: 100%;
	width: inherit;
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
`

const Button = styled.button`
	background-color: var(
		--background-color,
		${(props) => props.theme.color.background.button}
	);
	border: none;
	color: ${(props) => props.theme.color.text.button};
	cursor: pointer;
	height: 40px;
	padding: 0px 15px;
	transition-duration: 0.3s;

	&:hover:enabled {
		background-color: white;
		border: 1px solid var(--background-color);
		color: var(--background-color);
	}

	&:button:enabled {
		--background-color: ${(props) => (props.disabled ? 'grey' : '#4a4aff')};
	}
`

const Container = styled.div`
	display: flex;
	flex-direction: row;
	justify-content: center;
	width: 100%;
`
