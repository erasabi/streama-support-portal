import React, { useContext } from 'react'
import { connect, useDispatch } from 'react-redux'
import styled from 'styled-components'
import { useSelector } from 'react-redux'
import { ModalContext } from '/src/styles/Modal'
import RequestedMediaDetails from './RequestedMediaDetails.component'
import RequestedMediaListItems from './RequestedMediaItems.component'
import { handleRequestSubmit } from '/src/redux'

function RequestedMediaList() {
	const dispatch = useDispatch()
	let { handleModal } = useContext(ModalContext)
	const mediaResults = useSelector((state) => state.mediaResults)

	const onClick = (data) =>
		handleModal(
			<RequestedMediaDetails
				{...data}
				handleRequestSubmit={() => dispatch(handleRequestSubmit())}
			/>
		)
	return (
		<Wrapper>
			<div className="requestedMediaListTitle">Coming Soon</div>
			<RequestedMediaListItems items={mediaResults} onClick={onClick} />
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
	background-color: ${(props) => props.theme.color.background.card};
	border-radius: 8px;
	display: flex;
	flex-direction: column;
	gap: 15px;
	padding: 10px;

	.requestedMediaListTitle {
		color: #ff2828;
		font-size: 1.5rem;
		text-align: center;
	}
`
