// index.js: tells react - dom what to render
import React from 'react'
import ReactDOM from 'react-dom'
import { store } from './redux/store'
import { Provider } from 'react-redux'
import { ThemeProvider } from 'styled-components'
import { CSSReset, GlobalStyles, themeDark } from './styles'
import App from './App'

ReactDOM.render(
	<React.StrictMode>
		<Provider store={store}>
			<ThemeProvider theme={themeDark}>
				<CSSReset />
				<GlobalStyles />
				<App />
			</ThemeProvider>
		</Provider>
	</React.StrictMode>,
	document.getElementById('root')
)
