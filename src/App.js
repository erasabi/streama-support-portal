// App.js: begining of React root component loaded from root index.html

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { addMediaRequest, getAllMediaRequest } from '../db/firebase/firebase.prod';


function App() {
  // SearchBar State
  const [search, setSearch] = useState({
      input: '',
      value: {},
      suggestionSelected: false,
      mediaResults: [],
      buttonSelected: true
  });
  // SearchResults Dropdown State
  const [query, setQuery] = useState({
      results: [],
      hide: false
  });

  // On Mount: fetch & display already requested media
  useEffect(async () => {
    let updatedSearch = {...search};
    updatedSearch.mediaResults = await getAllMediaRequest();

    setSearch(updatedSearch);
  }, []);

  // handle search results on:
  //  - input change 
  //  - if a searchSuggestion is selected
  useEffect(async () => {
    // query MovieDB API for media when user types into searchbar
    if (!search.suggestionSelected && search.input && search.input.length > 2) {
      const response = await axios.get('https://api.themoviedb.org/3/search/multi?api_key=11cce9d83563a5188d7201b2514f7286&language=en-US&include_adult=false&sort_by="vote_count.desc"&query=' + search.input);

      if (response.data && response.data.total_pages && response.data.total_pages > 0) {
        setQuery({
          results: response.data.results,
          hide: false
        });
      }
    }
    // when input does not merit query hide any previous results
    setQuery({
        results: [],
        hide: true
    });
  }, [search.input, search.suggestionSelected]);


  // fetch MediaResults list of currently requested media
  useEffect(async () => {
    let updatedSearch = { ...search };

    if (search.buttonSelected) {
      updatedSearch.input = '';
      updatedSearch.value = {};
      updatedSearch.mediaResults = await getAllMediaRequest();
      updatedSearch.buttonSelected = false;

      setSearch(updatedSearch);
    }
  }, [search.buttonSelected]);

  // handles changes to searchbar input
  function handleSearchInput(value) {
    let updatedSearch = { ...search };

    updatedSearch.input = value;
    setSearch(updatedSearch);
  }

  // handles changes to search suggestion dropdown 
  function handleSuggestionSelected(result) {
    let updatedSearch = { ...search };

    // change searchbar value to selected media
    updatedSearch.input = result.title || result.name;
    updatedSearch.value = result;
    updatedSearch.suggestionSelected = true;
    setSearch(updatedSearch);
  }

  // handle submit request button-press event by posting requested media and triggering App refresh to clear 
  async function handleRequestSubmit() {
    let updatedSearch = { ...search };

    updatedSearch.input = '';
    updatedSearch.value = {};
    updatedSearch.mediaResults = await addMediaRequest(search);
    updatedSearch.buttonSelected = true;
    setSearch(updatedSearch);
  }

  // loops though fetch media list and renders requested MediaList component so user can see what has been requested
  const RequestedMediaList = () => {
    let mediaList = <div></div>;
    if (search.mediaResults && search.mediaResults.length > 0) {
      mediaList = search.mediaResults.map(result => {
        return (
          <div
            key={result.id}
            value={result.title}>
            <img
              className="requestedMediaItem"
              src={"http://image.tmdb.org/t/p/w1280/" + result.posterPath}
              onError={(e) => { e.target.src = "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg" }} />
          </div>
        )
      });
    }
    return <div>{mediaList ? <div>{mediaList}</div> : null}</div>;
  }

  // conditionally render search results MediaResults list 
  function SearchSuggestions() {
    let results = <div></div>;
    if (!query.hide && query.results && query.results.length > 0) {
      results = query.results.map(result => {
        return (
          <li
            key={result.id}
            value={result.title}
            onClick={() => {handleSuggestionSelected(result)}}>
            <img
              className="poster"
              src={"http://image.tmdb.org/t/p/w1280/" + result.poster_path}
              onError={(e) => { e.target.src = "https://cdn.browshot.com/static/images/not-found.png" }} />
            <div className="resultTitle">
              {result.title ? result.title : result.name} ({result.release_date ? parseInt(result.release_date) : parseInt(result.first_air_date)})
          </div>
          </li>
        )
      });
    }
    return <div>{results ? <ul>{results}</ul> : null}</div>
  }


  return (
    <React.Fragment>
      <div className="row">
        <div className="header">
          <div className="col-12 topnav">
            <a href="http://www.elanflix.com">
              <img className="topnav-logo" src={"https://freepngimg.com/thumb/arrow/7-2-arrow-png-picture-thumb.png"} />              
            </a>
          </div>
        </div>
      </div>
      {/* SearchBar */}
      <div className="row">
        <form className="form-container" >
          <div className="col-s-8 col-10 search-padding">
            <input 
              type="text" 
              autoComplete="off"
              id="searchText"
              value={search.input}
              placeholder="Name the movie or show you'd like..."
              onChange={(e) => {handleSearchInput(e.target.value)}} />
              <SearchSuggestions />
          </div>
          <div className="col-s-4 col-2 button-padding">
            <input type="button" value="Request" id="searchButton" onClick={() => {handleRequestSubmit()}}></input>
          </div>
        </form>        
      </div>
      {/* Requested Media List */}
      <div className="row">
        <div className="requestedMediaRow">
          <div className="col-s-12 col-12 requestedMediaList">
            <div className="requestedMediaListTitle">Coming soon to Elanflix</div>
            <RequestedMediaList />
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

export default App;
