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

// media query for smartphones:
// use this general one to allow multiple columns at smartphone size
@media only screen and (min-width: 175px) {
	/* For smartphones: */
	.font-size-xs-h1 {
		font-size: 35px;
	}
	.font-size-xs-h2 {
		font-size: 25px;
	}
}

// media query for tablets:
// use this general one to allow multiple columns at tablet size
@media only screen and (min-width: 600px) {
	/* For tablets: */
}

// media query for desktop:
// use this general one to allow multiple columns at desktop size
@media only screen and (min-width: 768px) {
	/* For desktop: */
	.font-size-h1 {
		font-size: 65px;
	}
	.font-size-h2 {
		font-size: 30px;
	}
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
