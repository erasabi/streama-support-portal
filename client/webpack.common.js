// webpack.config.js: holds configuration settings for webpack bundler
const HtmlWebPackPlugin = require('html-webpack-plugin')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')

module.exports = {
	// set custom port
	devServer: {
		port: 8081
	},
	// performance: configure how performance hints are shown
	performance: {
		hints: false
	},
	// "entry" is our main JavaScript file, or the ‘entry point’. In React, this is the file where we use our renderer.
	entry: './src/index.js',
	// "output" tells Webpack where to put our bundled code and what to name the file.Here, we’re telling Webpack to create
	// a directory named / dir in the root directory(__dirname is a Node variable representing the current directory path)
	// and create a file within it named bundle.js.
	output: {
		path: __dirname + '/dist',
		filename: 'bundle.js'
	},
	resolve: {
		alias: {
			// switch material ui default style engine (so you can use @mui/material/styles and its theme)
			'@mui/styled-engine': '@mui/styled-engine-sc'
		}
	},

	// "module" is where we tell Webpack to use all of those loaders we installed before.
	//      We’re using regex to tell each loader which file extensions to target.
	//      Also, we’re telling Webpack to run ESLint before Babel translates our code("enforce": “pre",), so it can warn us about stuff in our source code, not the compiled code.
	module: {
		rules: [
			{
				enforce: 'pre',
				test: /\.js$/,
				exclude: /node_modules/,
				loader: 'eslint-loader',
				options: {
					emitWarning: true,
					failOnError: false,
					failOnWarning: false
				}
			},
			{
				test: /\.(js|jsx)$/,
				exclude: /node_modules/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: [['@babel/preset-env', { targets: 'defaults' }]]
					}
				}
			},
			{
				test: /\.(css)$/,
				use: [MiniCssExtractPlugin.loader, 'css-loader']
			},
			{
				test: /\.html$/,
				use: [
					{
						loader: 'html-loader'
					}
				]
			},
			{
				test: /\.(png|svg|jpg|jpeg|gif)$/i,
				type: 'asset/resource'
			}
		]
	},
	optimization: {
		minimizer: [
			// For webpack@5 you can use the `...` syntax to extend existing minimizers (i.e. `terser-webpack-plugin`), uncomment the next line
			new CssMinimizerPlugin()
		]
	},
	// "plugins" is where we tell Webpack which plugins we want to use along with any configuration for those plugins.
	//      Here, we’re using the html-webpack-plugin to generate an HTML file with everything we need to load our code.
	plugins: [
		new HtmlWebPackPlugin({
			template: './public/index.html',
			filename: './index.html'
		}),
		new MiniCssExtractPlugin(),
		// allows us to create polyfills for plugins
		// needed for bcrypt to work in react code
		new NodePolyfillPlugin()
	]
}
