// webpack.config.js: holds configuration settings for webpack bundler
const { merge } = require('webpack-merge')
const common = require('./webpack.common.js')

module.exports = merge(common, {
	mode: 'production',
	// disable error overlay
	devServer: {
		client: {
			overlay: false
		}
	},
	// devtool: allows us to utilize development tools provided by Webpack.I’m using source- map because, after Webpack compiles our project, all of our code will be located in a single file we did not create.source - map builds a separate file that maps the source of code in our bundled file to the JavaScript files we actually created.
	devtool: 'source-map'
})
