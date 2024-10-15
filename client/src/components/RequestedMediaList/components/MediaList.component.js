/* eslint-disable react/prop-types */
import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import { isEmpty } from 'lodash'
import MediaPosterPlaceHolder from '/src/media/images/media-poster-placeholder.png'
import { TMDB_ENDPOINT } from '/src/constants'
import { isReleased } from '/src/api/'

const MediaItem = ({ item, onClick }) => {
	const { id, title, mediaType, posterPath, queueStatus, queueMessage } = item
	const [released, setReleased] = useState(false)

	useEffect(() => {
		async function fetch() {
			setReleased(await isReleased(id))
		}
		if (queueStatus === 'Not Yet Available' && mediaType === 'movie') fetch()
	}, [])

	return (
		<Poster value={title} status={queueStatus}>
			<img
				className="poster-img"
				onClick={() => onClick(item)}
				src={TMDB_ENDPOINT + posterPath}
				onError={(e) => (e.target.src = MediaPosterPlaceHolder)}
			/>
			<p className="poster-label">
				{queueStatus ?? queueMessage}
				{queueStatus === 'Not Yet Available' && (
					<>
						{' '}
						{/* Add space like a regular character */}
						{released ? (
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16" // Adjust the size as needed
								height="16"
								viewBox="0 0 24 24"
								fill="green"
								style={{ display: 'inline-block', verticalAlign: 'middle' }} // Inline display and alignment
							>
								<path d="M20.285 2l-11.285 11.285-5.285-5.285-3.715 3.715 9 9 15-15z" />
							</svg>
						) : (
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 512 512"
								width="16" // Adjust the size as needed
								height="16"
								fill="red"
								style={{ display: 'inline-block', verticalAlign: 'middle' }} // Inline display and alignment
							>
								<path d="M367.2 412.5L99.5 144.8C77.1 176.1 64 214.5 64 256c0 106 86 192 192 192c41.5 0 79.9-13.1 111.2-35.5zm45.3-45.3C434.9 335.9 448 297.5 448 256c0-106-86-192-192-192c-41.5 0-79.9 13.1-111.2 35.5L412.5 367.2zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256z" />
							</svg>
						)}
					</>
				)}
			</p>
		</Poster>
	)
}

export default function MediaList({ items, onClick }) {
	return (
		!isEmpty(items) && (
			<Wrapper>
				{items.map((item) => (
					<MediaItem
						key={`${item?.id}_${item?.title}`}
						item={item}
						onClick={onClick}
					/>
				))}
			</Wrapper>
		)
	)
}

const Wrapper = styled.div`
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	justify-content: space-evenly;
`

const Poster = styled.div`
	display: flex;
	flex-direction: column;
	justify-content: center;
	position: relative;
	width: 120px;

	.poster-img {
		cursor: pointer;
		max-width: 100%;
	}

	.poster-label {	
		width: 100%;
		color: white;
		font-size: 20px;
		text-align: center;
		pointer-events: none;
		position: absolute;
		background-color: ${(props) =>
			props.status === 'Not Yet Available'
				? '#3939bab0'
				: props.status === 'Rolling Episodes'
				? '#0ea100c7'
				: props.status === 'Unavailable'
				? '#b90000d9'
				: '#484856d6'};
		}
	}
`
