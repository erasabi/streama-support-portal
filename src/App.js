// App.js: begining of React root component loaded from root index.html

import React from 'react';

function App() {
  return (
    <React.Fragment>
      <div className="header clearfix">
        <div className="row">
          <div className="col-12 topnav">
            <img className="topnav-logo" src={"https://freepngimg.com/thumb/arrow/7-2-arrow-png-picture-thumb.png"} />
              {/* <ul>
                <li><a href="#news">News</a></li>
                <li><a href="#contact">Contact</a></li>
                <li><a href="#about">About</a></li>
              </ul> */}
          </div>
        </div>
      </div>
      <div className="row " >
        <div className="col-12">
          <div className="form-container">
              <div className="col-9">
                <input type="text" name="search" placeholder="Name the movie or show you'd like..." />
              </div>
              <div className="col-3 button-padding">
                <input type="button" value="Request"></input>
              </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

export default App;
