import React from 'react'
import styled from 'styled-components'
import { blue, grey } from '@mui/material/colors'

export default function Button({
	className,
	disabled = false,
	onClick = undefined,
	children,
	...restProps
}) {
	const handleDisabledEvent = (event) => event.preventDefault()

	return (
		<StyledButton
			aria-disabled={disabled}
			className={disabled ? `btn-disabled ${className}` : className}
			onClick={disabled ? handleDisabledEvent : onClick}
			{...restProps}
		>
			{children}
		</StyledButton>
	)
}

const StyledButton = styled.button`
	border: none;
	cursor: pointer;
	height: 40px;
	padding: 0px 15px;
	transition-duration: 0.3s;
	color: var(--color, ${(props) => props.theme.palette.text.primary});
	background-color: var(--background-color, ${blue[700]});

	&:hover {
		background-color: var(
			--color,
			${(props) => props.theme.palette.text.primary}
		);
		border: 1px solid var(--background-color);
		color: var(--background-color, ${blue[700]});
	}

	&.btn-disabled {
		color: ${grey[700]};
		background-color: ${grey[500]};
		border: 0.5px solid ${grey[800]};
		border-style: none solid;
		cursor: not-allowed;
	}
`

Button.Group = styled.div`
	display: flex;
	flex-direction: row;
	justify-content: center;
`
