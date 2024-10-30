import React, { useEffect, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import Icon from '../Icon'
import { useToggle } from '../../hooks'

export default function CopyText({
	className,
	text = '',
	copyValue = null,
	...restProps
}) {
	const isCopied = useToggle(false)

	const handleCopyText = (value) => {
		// Copy the text inside the text field
		navigator.clipboard.writeText(value)
		isCopied.toggleValue()
	}

	useEffect(() => {
		if (isCopied.value === true) {
			setTimeout(isCopied.toggleValue, 2000)
		}
	}, [isCopied.value])

	return (
		<StyledCopyText className={className} {...restProps}>
			<p className="text">{text}</p>
			{isCopied.value ? (
				<CheckmarkSVG className="icon" viewBox="0 0 70 70">
					<Path d="M10,35 L30,55 L60,10" />
				</CheckmarkSVG>
			) : (
				<Icon
					className="icon"
					onClick={() => handleCopyText(copyValue ?? text)}
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
						<g
							id="SVGRepo_tracerCarrier"
							strokeLinecap="round"
							strokeLinejoin="round"
						></g>
						<g id="SVGRepo_iconCarrier">
							{' '}
							<path
								d="M6 11C6 8.17157 6 6.75736 6.87868 5.87868C7.75736 5 9.17157 5 12 5H15C17.8284 5 19.2426 5 20.1213 5.87868C21 6.75736 21 8.17157 21 11V16C21 18.8284 21 20.2426 20.1213 21.1213C19.2426 22 17.8284 22 15 22H12C9.17157 22 7.75736 22 6.87868 21.1213C6 20.2426 6 18.8284 6 16V11Z"
								stroke={'#ffffff'}
								strokeWidth="1.5"
							></path>{' '}
							<path
								d="M6 19C4.34315 19 3 17.6569 3 16V10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H15C16.6569 2 18 3.34315 18 5"
								stroke={'#ffffff'}
								strokeWidth="1.5"
							></path>{' '}
						</g>
					</svg>
				</Icon>
			)}
		</StyledCopyText>
	)
}

const checkmarkAnimation = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
`

const CheckmarkSVG = styled.svg`
	display: block !important;
	animation: ${checkmarkAnimation} 0.5s ease-out;
`

const Path = styled.path`
	fill: none;
	stroke: #5cb85c;
	stroke-width: 4;
	stroke-linecap: round;
	stroke-linejoin: round;
`

const StyledCopyText = styled.div`
	display: flex;
	align-items: center;
	gap: 5px;

	.text {
		font-size: inherit;
		color: ${(props) => props.theme.palette.text.primary};
	}

	.icon {
		display: none;
		width: 20px;
		padding: 0;
	}

	&:hover {
		.icon {
			display: block;
		}
	}
`
