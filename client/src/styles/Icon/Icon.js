import React from 'react'
import styled from 'styled-components'

export default function Icon({
	className,
	disabled = false,
	children,
	...restProps
}) {
	return (
		<StyledIcon
			aria-disabled={disabled}
			className={disabled ? `btn-disabled ${className}` : className}
			{...restProps}
		>
			{children}
		</StyledIcon>
	)
}

const StyledIcon = styled.div`
	border: none;
	cursor: pointer;
	width: var(--width, 30px);
	padding: var(--padding, 5px);
`
