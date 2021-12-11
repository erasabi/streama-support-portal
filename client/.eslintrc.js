// .eslintrc.js: eslint config file

module.exports = {
    // tells ESLint that we’re working in the browser environment
    //      Otherwise, it will incorrectly warn us that global variables like document are not defined.
    "env": {
        "browser": true,
        "node": true, // recognize nodejs content
        "es6": true
    },
    // tells ESLint that we’re using React
    "plugins": [ "react" ],
    "extends": [
      "eslint:recommended",
      "plugin:react/recommended"
    ],
    // tells ESLint that we’re using Babel
    "parser": "babel-eslint"
};