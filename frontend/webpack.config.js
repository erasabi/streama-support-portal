// webpack.config.js: holds configuration settings for webpack bundler

const HtmlWebPackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const envConfig = require("./config/config");

console.dir(process.env.NODE_ENV);

if (envConfig.DEBUG === true) console.dir(envConfig);

module.exports = {
    // set custom port 
    "devServer": {
        "port": 8081
    },
    // mode: tells webpack we're in development
    "mode": envConfig.NODE_ENV,
    // "entry" is our main JavaScript file, or the ‘entry point’. In React, this is the file where we use our renderer.
    "entry": "./src/index.js",
    // "output" tells Webpack where to put our bundled code and what to name the file.Here, we’re telling Webpack to create 
    // a directory named / dir in the root directory(__dirname is a Node variable representing the current directory path) 
    // and create a file within it named bundle.js.
    "output": {
        "path": __dirname + '/dist',
        "filename": "bundle.js"
    },
    // "devtool" allows us to utilize development tools provided by Webpack.I’m using source- map because, after Webpack compiles our project, all of our code will be located in a single file we did not create.source - map builds a separate file that maps the source of code in our bundled file to the JavaScript files we actually created.
    "devtool": "source-map",
    // "module" is where we tell Webpack to use all of those loaders we installed before.
    //      We’re using regex to tell each loader which file extensions to target.
    //      Also, we’re telling Webpack to run ESLint before Babel translates our code("enforce": “pre",), so it can warn us about stuff in our source code, not the compiled code.
    "module": {
        "rules": [
            {
                "enforce": "pre",
                "test": /\.js$/,
                "exclude": /node_modules/,
                "loader": "eslint-loader",
                "options": {
                  "emitWarning": true,
                  "failOnError": false,
                  "failOnWarning": false
                }
            },
            {
                "test": /\.(js|jsx)$/,
                "exclude": /node_modules/,
                "use": {
                    "loader": "babel-loader"
                }
            },
            {
                "test": /\.(css|less)$/,
                "use": [
                    "style-loader",
                    "css-loader",
                    "less-loader"
                ]
            },
            {
                "test": /\.html$/,
                "use": [
                    {
                        "loader": "html-loader"
                    }
                ]
            }
        ]
    },
    // "plugins" is where we tell Webpack which plugins we want to use along with any configuration for those plugins. 
    //      Here, we’re using the html-webpack-plugin to generate an HTML file with everything we need to load our code.
    "plugins": [
        new HtmlWebPackPlugin({
            template: "./src/index.html",
            filename: "./index.html"
        }),
        // allows us to create polyfills for plugins 
        // needed for bcrypt to work in react code
        new NodePolyfillPlugin(),
        // provides bcrypt plugin to webpack
        new webpack.ProvidePlugin({
            bcryptjs: 'bcryptjs',
        }),
        // allows env files
        new webpack.EnvironmentPlugin(envConfig),
    ]
}