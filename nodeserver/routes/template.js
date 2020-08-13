const express = require('express');
const router = express.Router();

const templates = require('../templates.json');

router.get('/:name', (req, res) => {
	const { name } = req.params 
	if (templates[name]){
		let template = templates[name];
		if (Array.isArray(template)){
			template = template.join('\n');
		}
		res.send(template);
	} else {
		res.json({"error": 'ERROR: Template ' + name + ' not found'})
	}
});

module.exports = router;