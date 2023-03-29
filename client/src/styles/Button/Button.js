import React from 'react'
import styled from 'styled-components'

export default function Button({ children, ...restProps }) {
	return <Btn {...restProps}>{children}</Btn>
}

const Btn = styled.button`
	border: none;
	color: ${(props) => props.theme.color.text.button};
	cursor: pointer;
	height: 40px;
	padding: 0px 15px;
	transition-duration: 0.3s;

	background-color: var(
		--background-color,
		${(props) => props.theme.color.background.button}
	);

	&:hover:enabled {
		background-color: white;
		border: 1px solid var(--background-color);
		color: var(--background-color);
	}
`
