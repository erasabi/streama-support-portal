const NODE_ENV = process.env.NODE_ENV || 'development'
const DEBUG = process.env.DEBUG || false
const STREAMA_ENDPOINT = process.env.STREAMA_ENDPOINT
const API_ENDPOINT = process.env.API_ENDPOINT
const API_REQUEST_CONFIG =
	NODE_ENV !== 'production' ? { 'Access-Control-Allow-Origin': '*' } : {}

const envConfig = {
	NODE_ENV: NODE_ENV,
	DEBUG: DEBUG,
	REACT_APP_STREAMA_ENDPOINT: STREAMA_ENDPOINT,
	REACT_APP_API_ENDPOINT: API_ENDPOINT,
	REACT_APP_API_REQUEST_CONFIG: API_REQUEST_CONFIG,
	REACT_APP_ADMIN_SECRETS: process.env.ADMIN_SECRETS,
	REACT_APP_SUPERUSER_SECRETS: process.env.SUPERUSER_SECRETS
}

module.exports = envConfig
