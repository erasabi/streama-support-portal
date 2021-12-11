import React, { useState, useEffect } from 'react';
import { handleSearchInput, handleRequestedMedia, handleSuggestedMediaSelected, handleRequestSubmit } from '../redux';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { getUser } from '../handlers/handle-media-requests';
import Modal from './Modal/Modal';
import { userContext } from '../context/user';
import Header from './Header/Header';
import SearchBar from './SearchBar/SearchBar';
import RequestedMediaList from './RequestedMediaList/RequestedMediaList';

function App(props) {
  const [user, setUser] = useState({});
  const [modal, setModal] = useState({
    open: false,
    result: {},
  });
  const openModal = (result) => (
      setModal({ 
        open: true, 
        result: result
      })
    );
  const closeModal = () => (
      setModal({ 
        open: false, 
        result: {} 
      })
    );

  const getCurrUser = async () => {
    const currUser = await getUser();
    setUser(currUser)
  }

  // On Mount: fetch & display already requested media
  useEffect(async() => {
    await getCurrUser();
    props.handleRequestedMedia();
  }, []);
 
  return (
    <userContext.Provider value={user}>
      <div className="App">
          <Header />
          <SearchBar 
            {...props}
          />
          <RequestedMediaList {...props} openModal={openModal} />
          {modal.open ? (
            <Modal
              {...modal.result}
              open={modal.open}
              handleRequestSubmit={() => props.handleRequestSubmit()}
              onClose={closeModal}
            />
          ) : null};
      </div>
    </userContext.Provider>
  );
}

// maps initial store state to props 
//  - this is how the stateful container can access state props
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
// also connnects this Container to Redux Store
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(App)

App.propTypes = {
  handleRequestedMedia: PropTypes.func,
  handleRequestSubmit: PropTypes.func,
  handleSuggestedMediaSelected: PropTypes.func,
};