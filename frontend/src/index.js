// index.js: tells react - dom what to render
import React from 'react';
import ReactDOM from 'react-dom';
import App from './AppRedux';
import { store } from './redux/store';
import { Provider } from 'react-redux';
import './styles.less';


ReactDOM.render(
  // add this to have strict typechecking and fail on any warnings
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>,
  </React.StrictMode>,
  document.getElementById('root')
);
