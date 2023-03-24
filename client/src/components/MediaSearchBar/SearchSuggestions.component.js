import React from 'react'
import PropTypes from 'prop-types'
import styled from 'styled-components'
import ImageNotFound from '/src/media/images/image-not-found.png'
import { TMDB_ENDPOINT } from '/src/constants'
import Scrollbar from './Scrollbar'

function SearchSuggestions(props) {
	const { queryResults, onSelect } = props

	return queryResults && queryResults.length > 0 ? (
		<Wrapper>
			<Scrollbar className="scrollbar">
				{queryResults.map((result) => (
					<li
						key={result.id}
						onClick={() => {
							onSelect(result)
						}}
					>
						<img
							className="poster"
							src={
								result.poster_path
									? TMDB_ENDPOINT + result.poster_path
									: ImageNotFound
							}
						/>
						<div className="resultTitle">
							{result.title ? result.title : result.name} (
							{result.release_date
								? parseInt(result.release_date)
								: parseInt(result.first_air_date)}
							)
						</div>
					</li>
				))}
			</Scrollbar>
			)
		</Wrapper>
	) : null
}

SearchSuggestions.propTypes = {
	queryResults: PropTypes.array,
	handleSuggestedMediaSelected: PropTypes.func,
	onSelect: PropTypes.func
}

export default SearchSuggestions

const Wrapper = styled.ul`
	height: 50%;
	list-style-type: none;
	margin: 0;
	padding: 0;
	position: absolute;
	width: inherit;
	z-index: 1;

	li {
		background-color: ${(props) => props.theme.color.background.card};
		border: 1px solid rgb(24, 24, 24); /* Prevent double borders */
		color: white;
		height: 5rem;
		margin-top: -1px;
		padding: 6px;
		&:hover {
			background-color: white;
			color: ${(props) => props.theme.color.background.card};
		}
	}

	.poster {
		float: left;
		height: 4rem;
		max-width: 3.5rem;
		padding: 0px 0px;
	}

	.resultTitle {
		overflow: hidden;
		padding: 20px;
	}
`
