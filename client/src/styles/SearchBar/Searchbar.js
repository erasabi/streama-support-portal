import React from 'react'
import styled from 'styled-components'
import Button from '../Button'

export default function Searchbar({ children, ...restProps }) {
	return <Container {...restProps}>{children}</Container>
}

Searchbar.TextInput = function SearchbarTextInput({ innerRef, ...restProps }) {
	return <TextInput ref={innerRef} autoComplete="off" {...restProps} />
}

Searchbar.Button = function SearchbarButton({ children, ...restProps }) {
	return <Button {...restProps}>{children}</Button>
}

const Container = styled.div`
	display: flex;
	flex-direction: row;
	justify-content: center;
`

const TextInput = styled.input.attrs(({ ...restProps }) => ({
	type: 'text',
	...restProps
}))`
	height: 40px;
	width: 100%;
	box-sizing: border-box;
	border: 1px solid rgb(24, 24, 24);
	border-radius: 4px;
	font-size: calc(1em + 0.1rem);
	color: white;
	background-position: 10px 10px;
	background-repeat: no-repeat;
	padding: 2px 10px;
	text-overflow: ellipsis;
	background-color: var(
		--background-color,
		${(props) => props.theme.palette.background.input.text}
	);
`
