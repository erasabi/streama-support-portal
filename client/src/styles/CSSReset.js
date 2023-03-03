/*
-- CSS Reset --
description: a functional set of custom baseline styles based on generic best practices
*/

import { createGlobalStyle } from 'styled-components'

export const CSSReset = createGlobalStyle`
// Force box height/width percentages to include padding and margin (so percent size is now actual size)
html {
  box-sizing: border-box;
}
*, *:before, *:after {
  box-sizing: inherit;
}

// Remove default margin
* {
  margin: 0;
}

// Allow percentage-based heights in the application
html, body, #root {
  height: 100%;
}

body {
  font-family: Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif;
	font-size: 15px;
	background-color:  ${(props) => props.theme.color.background.body};
}

// Improve media defaults
img, picture, video, canvas, svg {
  display: block; // replace confusing default of 'inline' to 'block'
  max-width: 100%; // keep large images from overflowing
}

// Inherit fonts for form controls (these default to their own)
input, button, textarea, select {
  font-family: inherit;
}

/* Avoid text overflows (consider changing to include ALL elements)
  - text will automatically line-wrap if there isn't enough space to fit all of the characters on a single line
  - his can cause some annoying layout issues (ie overlapping/hiding text, scrollbar)
  - solution: default to use hard wraps when no soft wrap opportunties can be found
 */
p, h1, h2, h3, h4, h5, h6 {
  overflow-wrap: break-word;
}

/* Create a root stacking context
  - create a new stacking context without needing to set a z-index
  - guarantees that certain high-priority elements (modals, dropdowns, tooltips) will always show up above the other elements in our application
*/

#root {
  isolation: isolate;
}
`
