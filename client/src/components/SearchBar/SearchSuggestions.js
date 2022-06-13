import React from 'react';
import PropTypes from 'prop-types';

function SearchSuggestions(props) {
  const { queryResults, onSelect } = props
  let results = <div></div>;

  if (queryResults && queryResults.length > 0) {
    results = queryResults.map(result => {
      return (
        <li
          key={result.id}
          onClick={() => { onSelect(result) }}
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
  onSelect: PropTypes.func,
};

export default SearchSuggestions;