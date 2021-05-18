// index.js: tells react - dom what to render

import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import './styles.less';
import { firebase } from '../db/firebase/firebase.prod';
import { FirebaseContext } from '../db/firebase/firebase';

ReactDOM.render(
    <FirebaseContext.Provider value={{ firebase }}>
        <App />
    </FirebaseContext.Provider>,
    document.getElementById('root')
)