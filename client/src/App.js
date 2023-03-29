import React, { useEffect } from 'react'
import { connect, useDispatch } from 'react-redux'
import styled from 'styled-components'
import {
	handleRequestedMedia,
	handleRequestSubmit,
	handleSearchInput,
	handleSuggestedMediaSelected
} from './redux'
import { default as Header } from './components/Header'
import RequestedMediaList from './components/RequestedMediaList'
import MediaSearchBar from './components/MediaSearchBar'
import { UserProvider } from '/src/hooks/userContext.hook'
import { ModalProvider } from '/src/styles/Modal'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
	const dispatch = useDispatch()

	// On Mount: fetch & display already requested media
	useEffect(() => {
		dispatch(handleRequestedMedia())
	}, [])

	return (
		<UserProvider>
			<ErrorBoundary>
				<ModalProvider>
					<Header />
					<PageContainer>
						<MediaSearchBar />
						<RequestedMediaList />
					</PageContainer>
				</ModalProvider>
			</ErrorBoundary>
		</UserProvider>
	)
}

// maps dispatch method execution to props
//  - this is how App Container can access dispatch for its reducers
const mapDispatchToProps = (dispatch) => {
	return {
		handleSearchInput: (value) => dispatch(handleSearchInput(value)),
		handleRequestedMedia: () => dispatch(handleRequestedMedia()),
		handleSuggestedMediaSelected: (value) =>
			dispatch(handleSuggestedMediaSelected(value)),
		handleRequestSubmit: () => dispatch(handleRequestSubmit())
	}
}

// use reduxConnnect to tie the mapping functions to the App Container
// also connnects this Container to Redux Store
export default connect(mapDispatchToProps)(App)

const PageContainer = styled.div`
	display: flex;
	flex-direction: column;
	gap: 15px;

	@media only screen and (min-width: 175px) {
		padding: calc(1em + 1rem) 2rem 0 2rem;
	}
	@media only screen and (min-width: 600px) {
		padding: calc(1em + 2rem) 5rem 0 5rem;
	}
`
