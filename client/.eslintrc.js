/* 
resource links:
	core concepts: https://eslint.org/docs/latest/use/core-concepts
	settings: https://eslint.org/docs/latest/use/configure/configuration-files#adding-shared-settings
	extends: https://eslint.org/docs/latest/use/configure/configuration-files#extending-configuration-files
	env: https://eslint.org/docs/latest/use/configure/language-options#specifying-environments
	ignorePatterns: https://eslint.org/docs/latest/use/configure/ignore#ignorepatterns-in-config-files
*/

const fs = require('fs')
const path = require('path')

const prettierOptions = JSON.parse(
	fs.readFileSync(path.resolve(__dirname, '.prettierrc.json'), 'utf8')
)

module.exports = {
	// tells ESLint that we’re working in the browser environment
	//  Otherwise, it will incorrectly warn us that global variables like document are not defined.
	env: {
		browser: true,
		node: true, // recognize nodejs content
		es6: true
	},
	// specify absolute paths
	// absolute paths must be specified in these config files (if used):
	// 	1 webpack.config.js: so relative pathing isn't the only option when importing
	// 	2 jsconfig.json: so IDE will not show error on valid paths
	// 	3 eslintrc.js: so IDE will not show error when importing form index.js
	settings: {
		'import/resolver': {
			node: {
				paths: ['src']
			}
		},
		react: {
			version: 'detect'
		}
	},
	// tells ESLint that we’re using the following parser
	parserOptions: {
		// ecmaVersion: version of ECMAScript syntax you want to use
		ecmaVersion: 12,
		parser: '@babel/eslint-parser', // tells ESLint that we’re using the following plugins
		// set the sourceType to 'module' so the parser can parse JS files that are modules
		sourceType: 'module',
		// ecmaFeatures: an object indicating any additional language features
		ecmaFeatures: {
			jsx: true
		}
	},
	plugins: ['react', 'better-styled-components', 'prettier'],
	extends: ['eslint:recommended', 'plugin:react/recommended', 'prettier'],
	rules: {
		'better-styled-components/sort-declarations-alphabetically': 2
	},
	// ignorePatterns: config ESLint to ignore files/dirs while linting by specifying one or more glob patterns
	// disregard eslint for:
	// 	- compounds styled components
	ignorePatterns: ['src/styles'],
	// overrides:
	// 	- disable rules inside of a configuration file for a group of files
	// 	- use the overrides key along with a files key
	overrides: [
		{
			files: ['**/*.js?(x)'],
			rules: {
				'prettier/prettier': ['warn', prettierOptions]
			}
		}
	]
}
