/* eslint-disable react/prop-types */
import React from 'react'
import styled from 'styled-components'
import { isEmpty } from 'lodash'
import MediaPosterPlaceHolder from '/src/media/images/media-poster-placeholder.png'
import { TMDB_ENDPOINT } from '/src/constants'
import { statusColor, isHiddenFromComingSoon } from '/src/utils/pipeline'

const MediaItem = ({ item, onClick }) => {
	const { title, posterPath, queueStatus, queueMessage, displayStatus } = item
	const label = displayStatus || queueStatus || queueMessage

	return (
		<Poster value={title} statusColor={statusColor(label)}>
			<img
				className="poster-img"
				onClick={() => onClick(item)}
				src={TMDB_ENDPOINT + posterPath}
				onError={(e) => (e.target.src = MediaPosterPlaceHolder)}
			/>
			<p className="poster-label">{label}</p>
		</Poster>
	)
}

export default function MediaList({ items, onClick }) {
	const visible = (items || []).filter((item) => !isHiddenFromComingSoon(item))
	return (
		!isEmpty(visible) && (
			<Wrapper>
				{visible.map((item) => (
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
	padding: 5px 0;
	position: relative;
	width: 120px;

	.poster-img {
		cursor: pointer;
		height: 180px;
		max-width: 100%;
		objectfit: 'cover';
	}

	.poster-label {
		background-color: ${(props) => props.statusColor};
		color: white;
		font-size: 20px;
		pointer-events: none;
		position: absolute;
		text-align: center;
		width: 100%;
	}
`
