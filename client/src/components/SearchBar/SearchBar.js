/* eslint-disable no-unused-vars */
import React, { useEffect, Suspense } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios'
import { API_ENDPOINT, API_REQUEST_CONFIG, NODE_ENV, STREAMA_ENDPOINT } from '/src/config/index';
import { addMediaRequest, searchMediaSuggestions } from '/src/api';
import SearchSuggestions from "./SearchSuggestions";
import './SearchBar.less';
import { useDispatch, useSelector } from 'react-redux';
import { handleRequestSubmit } from '/src/redux';
import useInput from '/src/hooks/useInput'
import { debounce } from 'lodash'

async function getMediaRequestUser() {
    let user = 'Anonymous';
    if (NODE_ENV === 'none') return 'TestUser'

    await axios.get(`${STREAMA_ENDPOINT}/user/current.json`, { withCredentials: true }, API_REQUEST_CONFIG
    ).then((res) => {
        user = res.data.profiles[0].user.username;
    }).catch((err) => {
        console.warn(err);
    })
    return user;
}

function SearchBar(props) {
    const dispatch = useDispatch()
    const state = useSelector(state => state)
    const searchValue = useInput('')
    const disableRequestButton = useInput(true)
    const searchResults = useInput(null)

    async function fetchSearchResults() {
        if (searchValue.value.length > 2) {
            try {
                const { data } = await searchMediaSuggestions(searchValue.value)
                searchResults.setValue(data.results)
            } catch (error) {
                console.warn(error);
                searchResults.setValue(null)
            }
        }
    }

    const debouncedFetchSearchResults = debounce(fetchSearchResults, 500);

    async function onRequest() {
        try {
            const value = state.value;
            const body = {
                id: value.id,
                title: value.title || value.name,
                posterPath: value.poster_path,
                createdAt: new Date().toUTCString(),
                originalTitle: value.original_name || value.original_title || null,
                releaseDate: value.release_date || value.first_air_date || null,
                adult: value.adult || false,
                mediaType: value.media_type || null,
                queueStatus: value.queueStatus || null,
                queueMessage: value.queueMessage || null,
                requestUser: await getMediaRequestUser() || null,
            };
            await addMediaRequest(body)
            dispatch(handleRequestSubmit())
        } catch (error) {
            console.warn(error);
        }
        searchValue.setValue('')
    }

    // handles changes to searchbar input
    const onChangeInput = (value) => {
        debouncedFetchSearchResults()
        searchValue.setValue(value)
        disableRequestButton.setValue(true)
    }


    const onSelectSuggestedMedia = (selectedMedia) => {
        dispatch({ type: 'SELECT_MEDIA_SUGGESTION', value: selectedMedia });
        searchValue.setValue(selectedMedia.name || selectedMedia.original_name)
        disableRequestButton.setValue(false)
        searchResults.setValue(null)
    }

    return (
        <div className="row searchBar">
            <form className="form-container">
                <div className="col-xs-9 col-s-8 col-10 search-padding">
                    <input
                        type="text"
                        autoComplete="off"
                        id="searchText"
                        value={searchValue.value}
                        placeholder="Name the movie or show you'd like..."
                        style={{ borderColor: (!disableRequestButton.value && (searchValue.value.length > 0)) ? "#ff2828" : "" }}
                        onChange={(e) => onChangeInput(e.target.value)}
                    />
                    {
                        searchValue.value &&
                        searchResults.value &&
                        disableRequestButton.value &&
                        (
                            <Suspense>
                                <SearchSuggestions
                                    queryResults={searchResults.value}
                                    onSelect={onSelectSuggestedMedia}
                                />
                            </Suspense>
                        )
                    }
                </div>
                <div className="col-xs-3 col-s-4 col-2 buttonPadding">
                    <input
                        type="button"
                        value="Request"
                        disabled={disableRequestButton.value}
                        style={{ backgroundColor: disableRequestButton.value ? "grey" : "" }}
                        onClick={onRequest}
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
    onChangeInput: PropTypes.func,
    onSelectSuggestedMedia: PropTypes.func,
};

export default SearchBar;