import React from 'react'
import styled from 'styled-components'

// all exported styled components must be made into react component to avoid circular dependency errors
const Scrollbar = () => {}

export default Scrollbar

Scrollbar.X = function ScrollbarX({ children, ...restProps }) {
	return <ScrollX {...restProps}>{children}</ScrollX>
}

const ScrollX = styled.div`
	height: var(--height, inherit);
	width: var(--width, inherit);
	// max-height: (y limit to trigger overflow)
	max-height: var(--max-height, ${(props) => props.$maxHeight});
	// overflow-y: handling overflow
	// 	- auto: scrollbar that hides when no overflow
	overflow-y: auto; // handling overflow

	&::-webkit-scrollbar {
		width: 10px;
	}

	&::-webkit-scrollbar-track {
		background-color: ${(props) => props.theme.color.scrollbar.track};
		border-radius: 10px;
		box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.3);
		width: 5px;
		height: 15px;
	}

	&::-webkit-scrollbar-thumb {
		background-color: ${(props) => props.theme.color.scrollbar.thumb};
		border-radius: 10px;
		-webkit-box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.5);
	}
`
