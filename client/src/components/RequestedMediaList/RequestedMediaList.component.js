import React, { useContext } from 'react'
import { connect, useDispatch } from 'react-redux'
import styled from 'styled-components'
import { useSelector } from 'react-redux'
import { ModalContext, Card } from '/src/styles'
import RequestedMediaDetails from './components/MediaDetails.component'
import MediaList from './components/MediaList.component'
import { handleRequestSubmit } from '/src/redux'

function RequestedMediaList() {
	const dispatch = useDispatch()
	let { handleModal } = useContext(ModalContext)
	const mediaResults = useSelector((state) => state.mediaResults)

	const onClick = (data) => {
		handleModal(
			<RequestedMediaDetails
				{...data}
				handleRequestSubmit={() => dispatch(handleRequestSubmit())}
			/>
		)
	}
	return (
		<Wrapper>
			<Card className="card">
				<Card.Title className="card-title">Coming Soon</Card.Title>
				<MediaList items={mediaResults} onClick={onClick} />
			</Card>
		</Wrapper>
	)
}

// maps dispatch method execution to props
//  - this is how App Container can access dispatch for its reducers
const mapDispatchToProps = (dispatch) => {
	return {
		handleRequestSubmit: () => dispatch(handleRequestSubmit())
	}
}

// use reduxConnnect to tie the mapping functions to the App Container
// also connnects this Container to Redux Store
export default connect(mapDispatchToProps)(RequestedMediaList)

const Wrapper = styled.div`
	.card {
		background-color: ${(props) => props.theme.palette.background.card};
		border-radius: 8px;
		flex-direction: column;
		gap: 30px;
		padding: 25px;
	}

	.card-title {
		text-align: center;
	}
`
