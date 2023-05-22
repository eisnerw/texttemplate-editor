module.exports = {
    entry: './src/main/javascript/index.js',
    output: {
        filename: 'main.js',
		publicPath: '/js/'
    },
    module: {
        rules: [{
            test: /\.js$/,
            enforce: 'pre',
            use: {
                loader: 'source-map-loader',
            },
            exclude: /node_modules/
        },
		{
			test: /worker\.js/,
			use: {loader: 'worker-loader'}
		}]
    },
    resolve: {
        modules: ['node_modules'],
        extensions: [ '.tsx', '.ts', '.js']
    },
    devtool: 'source-map',
    mode: 'development'
}