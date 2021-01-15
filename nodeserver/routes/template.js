const express = require('express');
const router = express.Router();

const templates = require('../templates.json');
const data = require('../data.json');


router.get('/:name', (req, res) => {
	const { name } = req.params 
	if (templates[name]){
		let template = templates[name];
		if (Array.isArray(template)){
			template = template.join('\n');
		}
		if (data[name]){
			res.json({"template":template, "data":data[name]});
		} else {
			res.send(template);
		}
	} else if (name == 'data'){
		res.json({"template":"first name:{firstName}","data":{"firstName": "Bill"}})
	} else {
		res.json({"error": 'ERROR: Template ' + name + ' not found'})
	}
});

module.exports = router;