// App.js: begining of React root component loaded from root index.html
import React, { Suspense, useState, useEffect } from 'react';
import axios from 'axios';


function App() {
  // SearchBar State
  const [search, setSearch] = useState({
      input: '',
      value: {},
      suggestionSelected: false,
      mediaResults: [],
      buttonSelected: false
  });
  // SearchResults Dropdown State
  const [query, setQuery] = useState({
      results: [],
      hide: false
  });

  var config = {
    headers: { 'Access-Control-Allow-Origin': '*' }
  };
  
  // On Mount: fetch & display already requested media
  useEffect(async () => {
    let updatedSearch = {...search};
    await axios.get('https://tosecurityandbeyond.mynetgear.com/2hbd2p59ckzbax6kzswj46s3r39j8/requests/all', config)
      .then(response => updatedSearch.mediaResults = response.data);
    setSearch(updatedSearch);
  }, []);

  // handle search results on:
  //  - input change 
  //  - if a searchSuggestion is selected
  useEffect(async () => {
    // query MovieDB API for media when user types into searchbar
    // if (!search.suggestionSelected && search.input && search.input.length > 2) {
    if (search.suggestionSelected && search.input !== (search.value.title || search.value.name)) {
      let updatedSearch = { ...search };
      updatedSearch.suggestionSelected = false;
      setSearch(updatedSearch);
    }
    else if (!search.suggestionSelected && search.input && search.input.length > 2) {
      const response = await axios.get('https://api.themoviedb.org/3/search/multi?api_key=11cce9d83563a5188d7201b2514f7286&language=en-US&include_adult=false&sort_by="vote_count.desc"&query=' + search.input);

      if (response.data && response.data.total_pages && response.data.total_pages > 0) {
        setQuery({
          results: response.data.results,
          hide: false
        });
      }
    }
    else {
      // when input does not merit query hide any previous results
      if (query.hide === false) {
        setQuery({
            results: [],
            hide: true
        });          
      }
    }
  }, [search.input, search.suggestionSelected]);


  // fetch MediaResults list of currently requested media
  useEffect(async () => {
    let updatedSearch = { ...search };

    if (search.buttonSelected) {
      updatedSearch.input = '';
      updatedSearch.value = {};
      await axios.get('https://tosecurityandbeyond.mynetgear.com/2hbd2p59ckzbax6kzswj46s3r39j8/requests/all', config)
        .then(response => updatedSearch.mediaResults = response.data);
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

  async function addMediaRequest(search) {
    const body = { id: search.value.id, title: search.value.title || search.value.name, posterPath: search.value.poster_path };

    await axios.put('https://tosecurityandbeyond.mynetgear.com/2hbd2p59ckzbax6kzswj46s3r39j8/requests', body, config);

    return await axios.get('https://tosecurityandbeyond.mynetgear.com/2hbd2p59ckzbax6kzswj46s3r39j8/requests/all', config)
  }

  // handles changes to search suggestion dropdown 
  async function handleSuggestionSelected(result) {
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
    await addMediaRequest(search)
      .then(response => updatedSearch.mediaResults = response.data);
    updatedSearch.buttonSelected = true;
    updatedSearch.suggestionSelected = false;
    setSearch(updatedSearch);
  }

  // handle delete of media when admin clicks on the associated media image 
  async function deleteRequestedMedia(result) {
    await axios.delete("https://tosecurityandbeyond.mynetgear.com/2hbd2p59ckzbax6kzswj46s3r39j8/requests/" + result.id, config)
      .then(() => {
        let updatedSearch = { ...search };

        updatedSearch.input = '';
        updatedSearch.value = {};
        updatedSearch.buttonSelected = true;
        updatedSearch.suggestionSelected = false;
        setSearch(updatedSearch);
      });
  }

  // loops though fetch media list and renders requested MediaList component so user can see what has been requested
  const RequestedMediaList = () => {
    let mediaList = <div></div>;
    if (search.mediaResults && search.mediaResults.length > 0) {
      mediaList = search.mediaResults.map(result => {
        return (
          <div
            key={result.id}
            value={result.title}
          >
            <img
              className="requestedMediaItem"
              onClick={() => {deleteRequestedMedia(result)}}
              src={"https://image.tmdb.org/t/p/w1280/" + result.posterPath}
              onError={(e) => { e.target.src = "/NoImagePlaceholder.svg" }}
            />
          </div>
        )
      });
    }
    return <div>{mediaList ? <div >{mediaList}</div> : null}</div>;
  }

  // conditionally render search results MediaResults list 
  const SearchSuggestions = () => {
    let results = <div></div>;
    if (!query.hide && query.results && query.results.length > 0) {
      results = query.results.map(result => {
        return (
          <li
            key={result.id}
            value={result.title || result.name}
            onClick={() => {handleSuggestionSelected(result)}}>
            { result.poster_path ? (
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
    return <div>{results ? <ul>{results}</ul> : null}</div>
  }

  return (
    <React.Fragment>
      <div className="row">
        <div className="header">
          <div className="col-12 topnav">
            <a href="https://tosecurityandbeyond.mynetgear.com/">
              <img className="topnav-logo" src={"https://freepngimg.com/thumb/arrow/7-2-arrow-png-picture-thumb.png"} />              
            </a>
          </div>
        </div>
      </div>
      {/* SearchBar */}
      <div className="row">
        <form className="form-container" >
          <div className="col-xs-9 col-s-8 col-10 search-padding">
            <input 
              type="text" 
              autoComplete="off"
              id="searchText"
              value={search.input}
              placeholder="Name the movie or show you'd like..."
              style={{ borderColor: (!search.suggestionSelected && (search.input.length > 0)) ? "#ff2828" : "" }}
              onChange={(e) => {handleSearchInput(e.target.value)}} />
              <Suspense>
                <SearchSuggestions />
              </Suspense>
          </div>
          <div className="col-xs-3 col-s-4 col-2 buttonPadding">
            <input 
              type="button" 
              value="Request" 
              disabled={!search.suggestionSelected} 
              style={{ backgroundColor: !search.suggestionSelected ? "grey" : ""}} 
              onClick={() => {handleRequestSubmit()}}>
            </input>
          </div>
        </form>        
      </div>
      {/* Requested Media List */}
      <div className="row requestedMediaRow">
        <div className="col-s-12 col-12 requestedMediaList">
          <div className="requestedMediaListTitle">Coming Soon</div>
          <RequestedMediaList />
        </div>
      </div>
    </React.Fragment>
  );
}

export default App;
