// App.js: begining of React root component loaded from root index.html

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { addMediaRequest, getAllMediaRequest } from '../db/firebase/firebase.prod';
// import '../db/dev/local-db.json';


function App() {
  const [search, setSearch] = useState({
      input: '',
      value: {},
      searchSelected: false
  });
  const [query, setQuery] = useState({
      results: [],
      hide: false
  });
  const [list, setList] = useState([]);

  // handle search results on changes to input 
  useEffect(() => {
    // query MovieDB API for media when user types into searchbar
    if (!search.searchSelected && search.input && search.input.length > 2) {
      const fetchData = async () => {
        try {
          const response = await axios.get('https://api.themoviedb.org/3/search/multi?api_key=11cce9d83563a5188d7201b2514f7286&language=en-US&include_adult=false&sort_by="vote_count.desc"&query=' + search.input);
          if (response.data && response.data.total_pages && response.data.total_pages > 0) {
            setQuery({
                results: response.data.results,
                hide: false
            });
          }
        } catch (error) {
          throw new Error(error);
        }
      }
      fetchData();
    }
    // when input does not merit query hide any previous results
    setQuery({
        results: [],
        hide: true
    });
  }, [search]);

  // fetch list of currently requested media
  useEffect(() => {
    const fetchData = async () => {
      setList(await getAllMediaRequest());
    };
    fetchData();
  }, [search]);

  // conditionally render search results list 
  let results = null;
  if (!query.hide && query.results && query.results.length > 0) {
    results = query.results.map(result => {
      return (
        <li 
          key={result.id} 
          value={result.title} 
          onClick={() => (
            setSearch({ 
              input: result.title || result.name,
              value: result,
              searchSelected: true 
            })
          )}>
          <img 
            className="poster" 
            src={"http://image.tmdb.org/t/p/w1280/" + result.poster_path} 
            onError={(e) => { e.target.src = "https://cdn.browshot.com/static/images/not-found.png" }}/>
          <div className="resultTitle">
            {result.title ? result.title : result.name} ({result.release_date ? parseInt(result.release_date) : parseInt(result.first_air_date)})
          </div>
        </li>
      )
    });
  }

  // loops though fetch media list and renders mediaList component so user can see what has been requested
  let requestMediaList = null;
  if (list.length > 0) {
    requestMediaList = list.map(result => {
      return (
        <div
          key={result.id}
          value={result.title}>
          <img
            className="requestedMediaItem"
            src={"http://image.tmdb.org/t/p/w1280/" + result.posterPath}
            onError={(e) => { e.target.src = "https://cdn.browshot.com/static/images/not-found.png" }} />
        </div>
      )
    });
  }

  // handle submit request button-press event by posting requested media and triggering App refresh to clear 
  // searchbar input and update the requested media list component
  function handleRequestSubmit() {
    addMediaRequest(search);
    setSearch({
      input: '',
      value: {},
      searchSelected: false
    });
  }

  return (
    <React.Fragment>
      <div className="header">
        <div className="row">
          <div className="col-12 topnav">
            <img className="topnav-logo" src={"https://freepngimg.com/thumb/arrow/7-2-arrow-png-picture-thumb.png"} />
          </div>
        </div>
      </div>
      <form className="row form-container" >
        <div className="col-s-8 col-10 search-padding">
          <input 
            type="text" 
            autoComplete="off"
            id="searchText"
            value={search.input}
            placeholder="Name the movie or show you'd like..." 
            onChange={(e) => (setSearch({input: e.target.value, searchSelected: false}))}/>
          {results ? <ul>{results}</ul> : null}
        </div>
        <div className="col-s-4 col-2 button-padding">
          <input type="button" value="Request" id="searchButton" onClick={() => {handleRequestSubmit()}}></input>
        </div>
      </form>
      <div className="row">
        <div className="col-s-12 col-10 requestedMediaList">
          <div className="requestedMediaListTitle">Coming soon to Elanflix</div>
          {requestMediaList ? <div>{requestMediaList}</div> : null}
        </div>
      </div>
    </React.Fragment>
  );
}

export default App;
