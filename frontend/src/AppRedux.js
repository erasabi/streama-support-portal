import React, { Suspense, useEffect } from 'react';
import { handleSearchInput, handleRequestedMedia, handleSuggestedMediaSelected, handleRequestSubmit } from './redux';
import { connect } from 'react-redux';
import axios from 'axios';
import PropTypes from 'prop-types';

function App(props) {

  // eslint-disable-next-line no-unused-vars
  var config = {
    headers: { 'Access-Control-Allow-Origin': '*' }
  };

  // On Mount: fetch & display already requested media
  useEffect(async() => {
    props.handleRequestedMedia();
  }, []);

  // loops though fetch media list and renders requested MediaList component so user can see what has been requested
  const RequestedMediaList = () => {
    let mediaList = <div></div>;
    if (props.mediaResults && props.mediaResults.length > 0) {
      mediaList = props.mediaResults.map(result => {
        return (
          <div
            key={result.id}
            value={result.title}
          >
            <img
              className="requestedMediaItem"
              onClick={()=>{deleteRequestedMedia(result)}}
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
  // eslint-disable-next-line no-unused-vars
  function SearchSuggestions() {
    let results = <div></div>;
  
    if (props.queryResults && props.queryResults.length > 0) {
      results = props.queryResults.map(result => {
        return (
          <li
            key={result.id}
            onClick={() => {props.handleSuggestedMediaSelected(result)}}
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

  async function addMediaRequest(value) {
    const body = { id: value.id, title: value.title || value.name, posterPath: value.poster_path };
    await axios.put('https://tosecurityandbeyond.mynetgear.com/2hbd2p59ckzbax6kzswj46s3r39j8/requests', body, config);
    
    props.handleRequestSubmit();
  }

  // handle delete of media when admin clicks on the associated media image 
  async function deleteRequestedMedia(result) {
    await axios.delete("https://tosecurityandbeyond.mynetgear.com/2hbd2p59ckzbax6kzswj46s3r39j8/requests/" + result.id)
      .then(() => {
        
        props.handleRequestSubmit();
      });
  }
  
  return (
    <div className="App">
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
                value={props.input}
                placeholder="Name the movie or show you'd like..."
                style={{ borderColor: (!props.suggestionSelected && (props.input.length > 0)) ? "#ff2828" : "" }}
                onChange={(e) => { props.handleSearchInput(e.target.value) }}
                />
              {(props.input.length > 2) && (<Suspense>
                <SearchSuggestions />
              </Suspense>
              )}
            </div>
            <div className="col-xs-3 col-s-4 col-2 buttonPadding">
              <input
                type="button"
                value="Request"
                disabled={props.buttonDisabled}
                style={{ backgroundColor: !props.suggestionSelected ? "grey" : "" }}
                onClick={() => {addMediaRequest(props.value)}}
                >
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
    </div>
  );
}

// maps initial store state to props 
//  - this is how CakeContainer can access state props.numOfCakes
const mapStateToProps = (state) => {
  return {
    input: state.input,
    value: state.value,
    suggestionSelected: state.suggestionSelected,
    buttonSelected: state.buttonSelected,
    mediaResults: state.mediaResults,
    queryResults: state.queryResults,
    buttonDisabled: state.buttonDisabled,
  }
}

// maps dispatch method execution to props
//  - this is how App Container can access dispatch for its reducers
const mapDispatchToProps = (dispatch) => {
  return {
    handleSearchInput: (value) => dispatch(handleSearchInput(value)),
    handleRequestedMedia: () => dispatch(handleRequestedMedia()),
    handleSuggestedMediaSelected: (value) => dispatch(handleSuggestedMediaSelected(value)),
    handleRequestSubmit: () => dispatch(handleRequestSubmit()),
  }
}

// use reduxConnnect to tie the mapping functions to the App Container
// also connnects CakeContainer to Redux Store
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(App)

App.propTypes = {
  input: PropTypes.string,
  value: PropTypes.object,
  suggestionSelected: PropTypes.bool,
  buttonSelected: PropTypes.bool,
  mediaResults: PropTypes.array,
  queryResults: PropTypes.array,
  buttonDisabled: PropTypes.bool,
  handleSearchInput: PropTypes.func,
  handleSuggestedMediaSelected: PropTypes.func,
  handleRequestedMedia: PropTypes.func,
  handleRequestSubmit: PropTypes.func,
};