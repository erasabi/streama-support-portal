// // require('dotenv').config(); // allows access to process.env variables
// require('dotenv').config(process.env.APP_ENV === 'production' ? null : { path: `.env.${process.env.APP_ENV}` })

// use fs to check for env files
let fs = require('fs')

// fs root path is the location of the app entry file so path accordingly
const envPath = fs.existsSync('.env.local')
    ? '.env.local'
    : fs.existsSync('.env.dev')
        ? '.env.dev'
        : fs.existsSync('.env')
            ? '.env'
            : null

// dotenv config allows access to process.env variables
envPath
    ? require('dotenv').config({ path: envPath })
    : require('dotenv').config()

const NODE_ENV = process.env.NODE_ENV || 'development';
const DEBUG = process.env.DEBUG || false;
const STREAMA_ENDPOINT = process.env.STREAMA_ENDPOINT;
const API_ENDPOINT = process.env.API_ENDPOINT;
const API_REQUEST_CONFIG = () => {
    if (NODE_ENV === 'none') {
        return {};
    } else {
        return { 'Access-Control-Allow-Origin': '*' };
    }
};

module.exports = {
    NODE_ENV: NODE_ENV,
    DEBUG: DEBUG,
    REACT_APP_STREAMA_ENDPOINT: STREAMA_ENDPOINT,
    REACT_APP_API_ENDPOINT: API_ENDPOINT,
    REACT_APP_API_REQUEST_CONFIG: API_REQUEST_CONFIG(),
};