/* eslint-disable react/prop-types */
import React from 'react'
import styled from 'styled-components'
import MediaPosterPlaceHolder from '/src/media/images/media-poster-placeholder.png'
import { TMDB_ENDPOINT } from '/src/constants'

const RequestedMediaListItems = ({ items, onClick }) => {
	return items && items.length > 0 ? (
		<Wrapper>
			{items.map((result) => {
				const { id, title, posterPath, queueStatus } = result
				return (
					<div className="item-container" key={id} value={title}>
						<img
							className="item-poster"
							onClick={() => onClick(result)}
							src={TMDB_ENDPOINT + posterPath}
							onError={(e) => (e.target.src = MediaPosterPlaceHolder)}
						/>
						{queueStatus ? (
							<ItemStatus $status={queueStatus}>{queueStatus}</ItemStatus>
						) : null}
					</div>
				)
			})}
		</Wrapper>
	) : null
}

export default RequestedMediaListItems

const ItemStatus = styled.p`
	background-color: ${(props) =>
		props.$status === 'Not Yet Available'
			? '#3939bab0'
			: props.$status === 'Rolling Episodes'
			? '#0ea100c7'
			: props.$status === 'Unavailable'
			? '#b90000d9'
			: '#484856d6'};
	color: white;
	font-size: 20px;
	position: absolute;
	text-align: center;
	top: 80px;
	width: 128px;
`

const Wrapper = styled.div`
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	justify-content: space-evenly;

	.item-container {
		float: left;
		padding: 5px;
		position: relative;
		width: 140px;
	}

	.item-poster {
		height: 12rem;
		padding: 0px;
	}
`
