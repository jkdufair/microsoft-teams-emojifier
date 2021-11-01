const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
	entry: './src/emojifier.ts',
	module: {
		rules: [{ test: /\.ts/, use: 'ts-loader', exclude: /node_modules/ }],
	},
	resolve: {
		extensions: ['.ts', '.js'],
	},
	plugins: [
		new CleanWebpackPlugin({ cleanStaleWebpackAssets: false }),
		new CopyWebpackPlugin({
			patterns: [
				{ from: './src/manifest.json' },
				{ from: './src/icons/thonk16.png' },
				{ from: './src/icons/thonk32.png' },
				{ from: './src/icons/thonk48.png' },
				{ from: './src/icons/thonk128.png' },
				{ from: './src/icons/thonk.xcf' },
				{ from: './src/options.html' },
				{ from: './src/options.js' },
				{ from: './src/emojifier.css' },
				{ from: './src/hot-reload.js' },
				{ from: './src/contentScript.js' }
			]
		})
	],
	output: { filename: 'emojifier.js', path: path.resolve(__dirname, 'dist') }
};
