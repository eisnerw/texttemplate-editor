const path = require('path');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const http = require('http');
const parserFacade = require('../../src/main-generated/javascript/ParserFacade.js');
let requestResponse;
const processResult = function(parm){
	switch (parm.type){
		case 'result':
			//console.debug('result=' + parm.result);
			requestResponse.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
			requestResponse.write(
				"<div style='width: 800px;'><pre style='word-wrap: break-word;overflow-x:auto;white-space:pre-wrap;'>" 
				+ parm.result
				+ "pre></div>"
				);  
			requestResponse.end();  
			break;
		case 'url':
			//console.debug('url=' + parm.path);
			http.request({host:'localhost', path: parm.path, port:3000, method: 'GET'}, function(response){
				response.on('data', function (data) {
					//console.debug('gotData'+ data);
					parm.success(data.toString());
				});
				response.on('error', function(error) {
					console.error('got error' + error);
					parm.failure(error);
				});
			}).end();
			break;
	}
}

router.get('/:template', (req, res) => {
	requestResponse = res;
	const { template } = req.params;
	processResult({
		type:'url'
		, 'path': '/template/' + template
		, success: function(data){
			//console.debug('templatedata='+data);
			parserFacade.validate(data, 0, 3, processResult);
		}
		, error: function(error){
		}
	});
});		

module.exports = router;