/* eslint-disable react/prop-types */
import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import { isEmpty } from 'lodash'
import MediaPosterPlaceHolder from '/src/media/images/media-poster-placeholder.png'
import { TMDB_ENDPOINT } from '/src/constants'
import { isReleased } from '/src/api/'

const MediaItem = ({ item, onClick }) => {
	const {
		title,
		originalTitle,
		releaseDate,
		mediaType,
		posterPath,
		queueStatus
	} = item
	const [released, setReleased] = useState(false)

	useEffect(() => {
		async function fetch() {
			setReleased(
				await isReleased(
					title || originalTitle,
					(releaseDate ?? []).slice(0, 4)
				)
			)
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
				{queueStatus}
				{queueStatus === 'Not Yet Available'
					? released
						? ' (Y)'
						: ' (X)'
					: null}
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
