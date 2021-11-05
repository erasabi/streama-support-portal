// require('dotenv').config(); // allows access to process.env variables
require('dotenv').config(process.env.APP_ENV === 'production' ? null : { path: `.env.${process.env.APP_ENV}` })


const NODE_ENV = process.env.NODE_ENV || 'development';
const DEBUG = process.env.DEBUG || false;
const API_ENDPOINT = process.env.API_ENDPOINT;
const API_REQUEST_CONFIG = () => {
    if (NODE_ENV === 'none') {
        return {};
    } else {
        return { 'Access-Control-Allow-Origin': '*' };
    }    
};

module.exports = {
    NODE_ENV : NODE_ENV,
    DEBUG: DEBUG,
    REACT_APP_API_ENDPOINT: API_ENDPOINT,
    REACT_APP_API_REQUEST_CONFIG: API_REQUEST_CONFIG(),
};