module.exports = {
    entry: './src/main/javascript/index.js',
    output: {
        filename: 'main.js',
    },
    module: {
        rules: [{
            test: /\.js$/,
            enforce: 'pre',
            use: {
                loader: 'source-map-loader',
            },
            exclude: /node_modules/
        }]
    },
    resolve: {
        modules: ['node_modules'],
        extensions: [ '.tsx', '.ts', '.js']
    },
    devtool: 'source-map',
    mode: 'development',
    node: {
        fs: 'empty',
        global: true,
        crypto: 'empty',
        tls: 'empty',
        net: 'empty',
        process: true,
        module: false,
        clearImmediate: false,
        setImmediate: false
    }
}