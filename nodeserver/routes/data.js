import express from 'express';
const router = express.Router();

import data from '../data.json' assert { type: 'json' };

router.get('/:name', (req, res) => {
	const { name } = req.params 
	if (data[name]){
		res.send(data[name]);
	} else {
		res.json({"error": 'Data ' + name + ' not found'})
	}
});

router.post('/', (req, res) => {
  console.log(req.body);
  const { name } = req.body;
  data.push({
    id: data.length + 1,
    name
  });
  res.json('Successfully created');
});

router.put('/:id', (req, res) => {
  console.log(req.body, req.params)
  const { id } = req.params;
  const { name } = req.body;

  data.forEach((product, i) => {
    if (product.id == id) {
      data.name = name;
    }
  });
  res.json('Successfully updated');

});

router.delete('/:id', (req, res) => {
  const { id } = req.params;

  data.forEach((product, i) => {
    if(data.id == id) {
      data.splice(i, 1);
    }
  });
  res.json('Successfully deleted');
});

export {router};