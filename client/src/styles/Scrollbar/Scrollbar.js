import React from 'react'
import styled from 'styled-components'

// all exported styled components must be made into react component to avoid circular dependency errors
const Container = ({ children, ...restProps }) => (
	<ContainerBase {...restProps}>{children}</ContainerBase>
)

export default Container

const ContainerBase = styled.div`
	height: 100%;
	width: 100%;
`
Container.ScrollX = function ScrollbarVertical({ children, ...restProps }) {
	return <ScrollX {...restProps}>{children}</ScrollX>
}

const ScrollX = styled.div`
	// overflow-y: handling overflow
	// 	- auto: scrollbar that hides when no overflow
	overflow-y: auto; // handling overflow
	// max-height: (y limit to trigger overflow)
	max-height: var(--max-height, ${(props) => props.$maxHeight});
	height: ${(props) => props.$height || '100%'};

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
