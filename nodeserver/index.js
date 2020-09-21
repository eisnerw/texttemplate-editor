const path = require('path');
const express = require('express');
const morgan = require('morgan');
const app = express();

// settings
app.set('port', process.env.PORT || 3000);

// middlewares
app.use(morgan('dev'));
app.use(express.urlencoded({extended: false}));
app.use(express.json());

// routes
app.use('/subtemplate', require('./routes/subtemplate'));
app.use('/data', require('./routes/data'));
app.use('/template', require('./routes/template'));
app.use('/load', require('./routes/load'));
app.use('/runonserver', require('./routes/runonserver'));

// static files
app.use(express.static(path.join(__dirname, '../src/main')));
app.use("/node_modules", express.static(path.join(__dirname, '../node_modules')));
app.use("/js", express.static(path.join(__dirname, '../dist')));
app.use('/docs', express.static(path.join(__dirname, '../nodeserver/docs')));


// start the server
app.listen(app.get('port'), () => {
  console.log(`server on port ${app.get('port')}`);
});
