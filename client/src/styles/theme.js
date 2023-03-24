/* eslint-disable no-unused-vars */
// lodash.merge: deep merges objects
// 	warning: first object argument gets overwritten
// 	- so dont pass an object you dont want to mutate
import { merge } from 'lodash'

// color palette
const darkBlack = '#111111'
const black = '#111111'
const darkGray = '#222121'
const gray = '#f3efef'
const pink = '#fc52db'
const purple = '#b123ff'
const lightBlue = '#8870fd'
const lightGray = '#a6a4a4'
const offWhite = '#f5f2f2'
const red = '#ff7878'
const white = '#ffffff'

// base theme: shared theme values
const baseTheme = {
	color: {
		background: {
			body: black,
			header: black,
			button: lightGray,
			card: darkGray,
			input: {
				text: darkGray
			},
			scrollbar: darkGray
		},
		text: {
			button: white
		},
		scrollbar: {
			track: darkGray,
			thumb: lightGray
		}
	},
	font: {
		family: `Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif`
	},
	breakpoint: {
		mobile: '375px',
		tablet: '600px',
		laptop: '1200px',
		desktop: '1600px'
	}
}

// lodash merge the custom theme with the base theme
export const themeLight = merge(
	// merge() mutates first object with merged value
	// so make first arg and empty obj and followed by merge objects
	{},
	{
		// light theme here
	},
	baseTheme
)

export const themeDark = merge(
	// merge() mutates first object with merged value
	// so make first arg and empty obj and followed by merge objects
	{},
	{
		// dark theme here
	},
	baseTheme
)
