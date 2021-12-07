import React, { Suspense } from 'react';
import PropTypes from 'prop-types';
import SearchSuggestions from "./SearchSuggestions/SearchSuggestions";
import { addMediaRequest } from '../../handlers/handle-media-requests';
import './SearchBar.less';

function SearchBar(props) {
    return (
        <div className="row searchBar">
        <form className="form-container">
            <div className="col-xs-9 col-s-8 col-10 search-padding">
            <input
                type="text"
                autoComplete="off"
                id="searchText"
                value={props.input}
                placeholder="Name the movie or show you'd like..."
                style={{ borderColor: (!props.suggestionSelected && (props.input.length > 0)) ? "#ff2828" : "" }}
                onChange={(e) => { props.handleSearchInput(e.target.value) }}
                />
            {(props.input.length > 2) && (
                <Suspense>
                <SearchSuggestions 
                    {...props}
                    queryResults={props.queryResults}
                />
                </Suspense>
            )}
            </div>
            <div className="col-xs-3 col-s-4 col-2 buttonPadding">
            <input
                type="button"
                value="Request"
                disabled={props.buttonDisabled}
                style={{ backgroundColor: !props.suggestionSelected ? "grey" : "" }}
                onClick={() => {addMediaRequest(props)}}
                >
            </input>
            </div>
        </form>
        </div>
    );
}

SearchBar.propTypes = {
  input: PropTypes.string,
  suggestionSelected: PropTypes.bool,
  queryResults: PropTypes.array,
  buttonDisabled: PropTypes.bool,
  handleSearchInput: PropTypes.func,
  handleSuggestedMediaSelected: PropTypes.func,
};

export default SearchBar;