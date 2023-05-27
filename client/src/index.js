// index.js: tells react - dom what to render
import React from 'react'
import ReactDOM from 'react-dom'
import { store } from './redux/store'
import { Provider } from 'react-redux'
import { ThemeProvider } from 'styled-components'
import { CSSReset, GlobalStyles, themeDark } from './styles'
import App from './App'
import { QueryClient, QueryClientProvider } from 'react-query'
import { ReactQueryDevtoolsPanel } from 'react-query/devtools'
const queryClient = new QueryClient()

ReactDOM.render(
	<React.StrictMode>
		<Provider store={store}>
			<QueryClientProvider client={queryClient}>
				{process.env.NODE_ENV === 'development' && <ReactQueryDevtoolsPanel />}
				<ThemeProvider theme={themeDark}>
					<CSSReset />
					<GlobalStyles />
					<App />
				</ThemeProvider>
			</QueryClientProvider>
		</Provider>
	</React.StrictMode>,
	document.getElementById('root')
)
