// webpack.config.js: holds configuration settings for webpack bundler
let fs = require('fs')
const { merge } = require('webpack-merge')
const webpack = require('webpack')
const common = require('./webpack.common.js')

// dotenv config allows access to process.env variables
fs.existsSync('.env.local')
	? require('dotenv').config({ path: '.env.local' })
	: require('dotenv').config()

const envConfig = require('./config/environment.js')

module.exports = merge(common, {
	mode: 'development',
	// devtool: allows us to utilize development tools provided by Webpack.I’m using source- map because, after Webpack compiles our project, all of our code will be located in a single file we did not create.source - map builds a separate file that maps the source of code in our bundled file to the JavaScript files we actually created.
	devtool: 'source-map',
	// allows .env files
	plugins: [new webpack.EnvironmentPlugin(envConfig)]
})
