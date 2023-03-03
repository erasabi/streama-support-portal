/*
-- GlobalStyles --
description: a functional set of custom styles
*/

import styled, { createGlobalStyle } from 'styled-components'

export const GlobalStyles = createGlobalStyle`
button {
	background-color: var(--background-color, ${(props) =>
		props.theme.color.background.button});
	border: none;
	color: ${(props) => props.theme.color.text.button};
	cursor: pointer;
	height: 40px;
	padding: 0px 15px;
	transition-duration: 0.3s;

	&:hover:enabled {
		background-color: white;
		border: 1px solid var(--background-color);
		color: var(--background-color);
	}
}

input[type=text] {
	width: 100%;
	box-sizing: border-box;
	border: 1px solid rgb(24, 24, 24);
	border-radius: 4px;
	font-size: calc(1em + 0.1rem);
	background-color: var(--background-color, ${(props) =>
		props.theme.color.background.input.text});
	color: white;
	background-position: 10px 10px;
	background-repeat: no-repeat;
	padding: 2px 10px;
}

.row::after {
	content: '';
	clear: both;
	display: table;
}

// All these columns should be floating to the left, and have a padding of 15px
[class*='col-'] {
	float: left;
	padding: 5px;
	// uncomment the below line when making static page changes
	// border: 1px solid red;
}

// media query for smartphones:
//    use this general one to allow multiple columns at smartphone size
@media only screen and (min-width: 175px) {
	/* For smartphones: */
	.col-xs-1 {
		width: 8.33%;
	}
	.col-xs-2 {
		width: 16.66%;
	}
	.col-xs-3 {
		width: 25%;
	}
	.col-xs-4 {
		width: 33.33%;
	}
	.col-xs-5 {
		width: 41.66%;
	}
	.col-xs-6 {
		width: 50%;
	}
	.col-xs-7 {
		width: 58.33%;
	}
	.col-xs-8 {
		width: 66.66%;
	}
	.col-xs-9 {
		width: 75%;
	}
	.col-xs-10 {
		width: 83.33%;
	}
	.col-xs-11 {
		width: 91.66%;
	}
	.col-xs-12 {
		width: 100%;
	}

	.font-size-xs-h1 {
		font-size: 35px;
	}
	.font-size-xs-h2 {
		font-size: 25px;
	}
}

// media query for tablets:
//    use this general one to allow multiple columns at tablet size
@media only screen and (min-width: 600px) {
	/* For tablets: */
	.col-s-1 {
		width: 8.33%;
	}
	.col-s-2 {
		width: 16.66%;
	}
	.col-s-3 {
		width: 25%;
	}
	.col-s-4 {
		width: 33.33%;
	}
	.col-s-5 {
		width: 41.66%;
	}
	.col-s-6 {
		width: 50%;
	}
	.col-s-7 {
		width: 58.33%;
	}
	.col-s-8 {
		width: 66.66%;
	}
	.col-s-9 {
		width: 75%;
	}
	.col-s-10 {
		width: 83.33%;
	}
	.col-s-11 {
		width: 91.66%;
	}
	.col-s-12 {
		width: 100%;
	}
}

// media query for desktop:
//    use this general one to allow multiple columns at desktop size
@media only screen and (min-width: 768px) {
	/* For desktop: */
	.col-1 {
		width: 8.33%;
	}
	.col-2 {
		width: 16.66%;
	}
	.col-3 {
		width: 25%;
	}
	.col-4 {
		width: 33.33%;
	}
	.col-5 {
		width: 41.66%;
	}
	.col-6 {
		width: 50%;
	}
	.col-7 {
		width: 58.33%;
	}
	.col-8 {
		width: 66.66%;
	}
	.col-9 {
		width: 75%;
	}
	.col-10 {
		width: 83.33%;
	}
	.col-11 {
		width: 91.66%;
	}
	.col-12 {
		width: 100%;
	}

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
