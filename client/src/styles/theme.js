// lodash.merge: deep merges objects
// 	warning: first object argument gets overwritten
// 	- so dont pass an object you dont want to mutate
import { merge } from 'lodash'
import { createTheme } from '@mui/material/styles'
import { blue, red, grey } from '@mui/material/colors'

// custom colors
const black = '#111111'
const white = '#ffffff'

// base theme: shared theme values
const theme = {
	// color palette: https://m2.material.io/design/color/the-color-system.html#tools-for-picking-colors
	palette: {
		black,
		blue,
		red,
		grey,
		// primary color: A primary color is the color displayed most frequently across your app's screens and components.
		primary: {
			main: black,
			contrastText: white
		},
		// secondary color: floating action buttons, selection controls, like sliders and switches, highlighting selected text, progress bars, links and headlines
		secondary: {
			main: red[500],
			contrastText: white
		},
		background: {
			default: black,
			header: black,
			button: grey[700],
			card: grey[900],
			input: {
				text: grey[900]
			},
			scrollbar: grey[900]
		},
		text: {
			primary: 'rgb(255, 255, 255, 0.87)',
			secondary: 'rgb(255, 255, 255,0.6)',
			disabled: 'rgb(255, 255, 255, 0.38)'
		},
		scrollbar: {
			track: grey[900],
			thumb: grey[700]
		}
	},
	typography: {
		button: {
			fontFamily: 'Lato, Helvetica Neue, Helvetica, Arial, sans-serif',
			fontWeight: 400,
			fontSize: '0.875rem',
			lineHeight: 1.75,
			letterSpacing: '0.02857em',
			textTransform: 'none'
		}
	},
	breakpoints: {
		mobile: '375px',
		tablet: '600px',
		laptop: '1200px',
		desktop: '1600px'
	}
}

const baseTheme = createTheme(theme)

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
