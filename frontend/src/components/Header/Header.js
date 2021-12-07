import React from 'react';
import { STREAMA_ENDPOINT } from '../../config/index';

function Header() {
  return (
    <div className="row">
      <div className="header">
        <div className="col-12 topnav">
          <a href={STREAMA_ENDPOINT}>
            <img className="topnav-logo" src={"https://freepngimg.com/thumb/arrow/7-2-arrow-png-picture-thumb.png"} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default Header;