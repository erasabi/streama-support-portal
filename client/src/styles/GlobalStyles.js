/*
-- GlobalStyles --
description: a functional set of custom styles
*/

import styled, { createGlobalStyle } from 'styled-components'

export const GlobalStyles = createGlobalStyle`
.row::after {
	content: '';
	clear: both;
	display: table;
}
`

export const ButtonArray = styled.div`
	display: flex;
	flex-direction: row;
	justify-content: center;
`

export const TextInput = styled.input.attrs({ type: 'text' })`
	min-width: 220px;
	width: 50%;
`
