import React from 'react'
import styled from 'styled-components'
import PropTypes from 'prop-types'

function SearchBar(props) {
	return (
		<Wrapper>
			<SelectSearchContainer>
				<input
					type="text"
					autoComplete="off"
					value={props.value}
					placeholder={props.placeholder}
					onChange={(e) => props.onChange(e.target.value)}
				/>
				<button disabled={props.disableSearchBtn} onClick={props.onSubmit}>
					Request
				</button>
			</SelectSearchContainer>
			{props.dropdownComponent}
		</Wrapper>
	)
}

SearchBar.propTypes = {
	placeholder: PropTypes.string.isRequired,
	disableSearchBtn: PropTypes.bool.isRequired,
	value: PropTypes.string.isRequired,
	onChange: PropTypes.func.isRequired,
	onSubmit: PropTypes.func.isRequired,
	dropdownComponent: PropTypes.element
}

export default SearchBar

const Wrapper = styled.div`
	button:enabled {
		--background-color: ${(props) => (props.disabled ? 'grey' : '#4a4aff')};
	}
`

const SelectSearchContainer = styled.div`
	display: flex;
	flex-direction: row;
	justify-content: center;
`
