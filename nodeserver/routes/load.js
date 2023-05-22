import path from 'path';
import express from 'express';
const router = express.Router();
import fs from 'fs';

router.get('/:name', (req, res) => {
	const { name } = req.params 
	res.redirect('/#' + name);
});

export { router }