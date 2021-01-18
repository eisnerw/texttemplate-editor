const path = require('path');
const express = require('express');
const morgan = require('morgan');
const app = express();
const templates = require('./templates.json');

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

const bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.post('/savetemplate',function(req,res){
	templates[req.body.template] = req.body.text;
	console.log('updating ' + req.body.template);
	req.body.shared.forEach((shared)=>{
		templates[shared.template] = shared.text;
		console.log('updating shared ' + shared.template);
	});
	res.end('{"success":true}');
});
