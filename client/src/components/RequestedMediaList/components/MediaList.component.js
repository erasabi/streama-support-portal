/* eslint-disable react/prop-types */
import React from 'react'
import styled from 'styled-components'
import { isEmpty } from 'lodash'
import MediaPosterPlaceHolder from '/src/media/images/media-poster-placeholder.png'
import { TMDB_ENDPOINT } from '/src/constants'

export default function MediaList({ items, onClick }) {
	return (
		!isEmpty(items) && (
			<Wrapper>
				{items.map((item) => {
					const { id, title, posterPath, queueStatus } = item
					return (
						<Poster key={`${id}_${title}`} value={title} status={queueStatus}>
							<img
								className="poster-img"
								onClick={() => onClick(item)}
								src={TMDB_ENDPOINT + posterPath}
								onError={(e) => (e.target.src = MediaPosterPlaceHolder)}
							/>
							<p className="poster-label">{queueStatus}</p>
						</Poster>
					)
				})}
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
