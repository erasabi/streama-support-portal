import React from 'react'
import styled from 'styled-components'

export function Card({ children, ...restProps }) {
	return <Container {...restProps}>{children}</Container>
}

Card.Title = function CardTitle({ children, ...restProps }) {
	return <Title {...restProps}>{children}</Title>
}

Card.Content = function CardContent({ children, ...restProps }) {
	return <Content {...restProps}>{children}</Content>
}

Card.Text = function CardText({ children, ...restProps }) {
	return <Text {...restProps}>{children}</Text>
}

Card.Field = function CardField({ label, children, ...restProps }) {
	return (
		<Field {...restProps}>
			{label ? <Label>{label}:</Label> : null}
			{children}
		</Field>
	)
}

const Title = styled.p`
	color: #ff2828;
	font-weight: 350;
	font-size: 30px;

	@media only screen and (min-width: ${(props) =>
			props.theme.breakpoints.tablet}) {
		font-size: 35px;
	}

	@media only screen and (min-width: ${(props) =>
			props.theme.breakpoints.laptop}) {
		font-size: 40px;
	}
`

const Container = styled.div`
	display: flex;
`

const Text = styled.p`
	color: white;
	font-weight: 300;

	text-overflow: ellipsis;
	white-space: nowrap;
	overflow: hidden;
`

const Label = styled.p`
	color: white;
`

export const Field = styled.div`
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 5px;

	> ${Label}, ${Text} {
		font-size: 12px;

		@media only screen and (min-width: ${(props) =>
				props.theme.breakpoints.tablet}) {
			font-size: 20px;
		}

		@media only screen and (min-width: ${(props) =>
				props.theme.breakpoints.laptop}) {
			font-size: 25px;
		}
	}
`

const Content = styled.div`
	display: flex;
	gap: 10px;
	flex-direction: column;
	max-width: 100%;
`
