import PropTypes from 'prop-types'
import React from 'react'
import styled from 'styled-components'

class ErrorBoundary extends React.Component {
	constructor(props) {
		super(props)
		this.state = { hasError: false }
	}

	static getDerivedStateFromError() {
		// Update state so the next render will show the fallback UI.
		return { hasError: true }
	}

	componentDidCatch(error, errorInfo) {
		// You can also log the error to an error reporting service
		console.error({ error, errorInfo })
	}

	componentDidMount() {
		if (this.props.history) {
			this.unlisten = this.props.history.listen(() => {
				if (this.state.hasError) {
					this.setState({ hasError: false })
				}
			})
		}
	}

	componentWillUnmount() {
		if (this.props.history) this.unlisten()
	}

	render() {
		if (this.state.hasError) {
			// You can render any custom fallback UI
			return (
				<Wrapper>
					<h1>Whoops!</h1>
					<p>Page Error</p>
				</Wrapper>
			)
		}

		return this.props.children
	}
}

ErrorBoundary.propTypes = {
	children: PropTypes.object,
	history: PropTypes.object
}

export default ErrorBoundary

const Wrapper = styled.div`
	align-items: center;
	display: flex;
	flex-direction: column;
	height: 100%;
	justify-content: center;

	h1,
	p {
		-webkit-filter: invert(100%);
		filter: invert(100%);
	}

	h1 {
		font-size: 4vw;
	}

	p {
		font-size: 1vw;
	}
`
