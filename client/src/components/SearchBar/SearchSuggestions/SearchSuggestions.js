import React from 'react';
import PropTypes from 'prop-types';

// conditionally render search results MediaResults list 
// eslint-disable-next-line no-unused-vars
function SearchSuggestions(props) {
  let results = <div></div>;

  if (props.queryResults && props.queryResults.length > 0) {
    results = props.queryResults.map(result => {
      return (
        <li
          key={result.id}
          onClick={() => { props.handleSuggestedMediaSelected(result) }}
        >
          {result.poster_path ? (
            <img
              className="poster"
              src={"https://image.tmdb.org/t/p/w1280/" + result.poster_path}
            />
          ) : (
            <img
              className="poster"
              src={"/not-found.png"}
            />
          )}
          <div className="resultTitle">
            {result.title ? result.title : result.name} ({result.release_date ? parseInt(result.release_date) : parseInt(result.first_air_date)})
          </div>
        </li>
      )
    });
  }
  return <div>{results ? <ul>{results}</ul> : null}</div>;
}

SearchSuggestions.propTypes = {
  queryResults: PropTypes.array,
  handleSuggestedMediaSelected: PropTypes.func,
};

export default SearchSuggestions;