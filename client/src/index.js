// index.js: tells react - dom what to render
import React from 'react';
import ReactDOM from 'react-dom';
import App from './components/App';
import { store } from './redux/store';
import { Provider } from 'react-redux';
import './styles.less';


ReactDOM.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>,
  </React.StrictMode>,
  document.getElementById('root')
);
