const path = require('path');
const express = require('express');
const router = express.Router();
const fs = require('fs');


router.get('/:name', (req, res) => {
	const { name } = req.params 
	res.redirect('/#' + name);
});

module.exports = router;