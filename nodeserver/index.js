import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import morgan from 'morgan';
const app = express();
import templates from './templates.json' assert { type: 'json' };
import subtemplates from './subtemplates.json' assert { type: 'json' };
import cors from 'cors';
const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

// settings
app.set('port', process.env.PORT || 3000);

// cors
app.use(cors({
    origin: 'https://en.wikipedia.org'
}));


// middlewares
app.use(morgan('dev'));
app.use(express.urlencoded({extended: false}));
app.use(express.json());

// routes
import {router as subtemplate} from'./routes/subtemplate.js';
app.use('/subtemplate', subtemplate);
import {router as data} from './routes/data.js';
app.use('/data', data);
import {router as template} from './routes/template.js';
app.use('/template', template);
import {router as load} from './routes/load.js';
app.use('/load', load);
import {router as runOnServer} from './routes/runonserver.js';
app.use('/runonserver', runOnServer);


// static files
console.log("THE PATH IS " + __dirname);
app.use(express.static(path.join(__dirname, '../src/main')));
app.use("/main-generated",express.static(path.join(__dirname, '../src/main-generated')));
app.use("/node_modules", express.static(path.join(__dirname, '../node_modules')));
app.use("/js", express.static(path.join(__dirname, '../dist')));
app.use('/docs', express.static(path.join(__dirname, '../nodeserver/docs')));

// start the server
app.listen(app.get('port'), () => {
  console.log(`server on port ${app.get('port')}`);
});

import bodyParser from "body-parser";
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.post('/savetemplate',function(req,res){
	templates[req.body.template] = req.body.text;
	console.log('updating ' + req.body.template);
	req.body.shared.forEach((shared)=>{
		subtemplates[shared.template] = shared.text;
		console.log('updating shared ' + shared.template);
	});
	res.end('{"success":true}');
});
