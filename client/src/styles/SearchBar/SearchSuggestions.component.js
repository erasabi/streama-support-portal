import React from 'react'
import PropTypes from 'prop-types'
import styled from 'styled-components'
import ImageNotFound from '/src/media/images/image-not-found.png'
import { TMDB_ENDPOINT } from '/src/constants'

function SearchSuggestions(props) {
	const { queryResults, onSelect } = props

	return queryResults && queryResults.length > 0 ? (
		<Wrapper>
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
	position: absolute;
	width: inherit;
	z-index: 1;
`
