// babel config file

module.exports = {
	presets: [
		[
			// @babel/preset-env converts the latest JavaScript syntax
			'@babel/preset-env',
			// use this to allow:
			//  - using async/await
			//  - using axios
			{
				targets: {
					node: '14'
				}
			}
		],
		// @babel/preset-react converts the JSX
		'@babel/preset-react'
	],
	plugins: ['babel-plugin-styled-components']
}
