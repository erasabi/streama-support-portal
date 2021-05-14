// App.js: begining of React root component loaded from root index.html

import React from 'react';

function App() {
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
          <input type="text" name="search" placeholder="Name the movie or show you'd like..." />
        </div>
        <div className="col-s-4 col-2 button-padding">
          <input type="button" value="Request"></input>
        </div>
      </form>
    </React.Fragment>
  );
}

export default App;
