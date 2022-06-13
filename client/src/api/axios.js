import axios from 'axios'
import { API_ENDPOINT } from 'src/config/index';

/*
axios: Axios is a promise-based HTTP Client for node.js and the browser
	- based on Promise API (resource: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)
	- all axios arguments: https://axios-http.com/docs/req_config
	- pros:
		- isomorphic [works in both browser and nodejs (server/client side) w/same code]
		- can intercept req/res
		- transform req/res data
		- cancel requests
		- auto-handles json data 
		- client side XSRF protection
	- cons:
		- not native so needs to be imported unlike fetch and other libraries
*/

// set default baseURL
axios.defaults.baseURL = API_ENDPOINT