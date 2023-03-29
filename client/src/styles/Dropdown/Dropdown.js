import React from 'react'
import styled from 'styled-components'
import Scrollbar from '../Scrollbar'

function Dropdown({ children, ...restProps }) {
	return <Container {...restProps}>{children}</Container>
}

export default Dropdown

Dropdown.Options = function DropdownOptions({ children, ...restProps }) {
	return (
		<Options {...restProps}>
			<Scrollbar.X>{children}</Scrollbar.X>
		</Options>
	)
}

Dropdown.Option = function DropdownOption({ children, ...restProps }) {
	return <Option {...restProps}>{children}</Option>
}

Dropdown.Image = function DropdownImage({ children, ...restProps }) {
	return <Image {...restProps}>{children}</Image>
}

Dropdown.Title = function DropdownTitle({ children, ...restProps }) {
	return <Title {...restProps}>{children}</Title>
}

const Container = styled.div`
	width: inherit;

	ul {
		position: absolute;
		width: inherit;
		z-index: 1;
	}
`

const Options = styled.ul`
	list-style-type: none;
	margin: 0;
	padding: 0;

	.poster {
		height: 100%;
		padding: 0px 0px;
	}

	.resultTitle {
		overflow: hidden;
	}

	.scrollbar {
		height: 50%;
	}
`

const Option = styled.li`
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 10px;
	height: 75px;
	background-color: ${(props) => props.theme.color.background.card};
	border: 0.5px solid rgb(24, 24, 24); /* Prevent double borders */
	color: white;
	padding: 6px;
	&:hover {
		background-color: white;
		color: ${(props) => props.theme.color.background.card};
	}
`

const Image = styled.img`
	height: 100%;
	padding: 0px 0px;
`

const Title = styled.p`
	overflow: hidden;
`
