const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const actionsModule = require('../modulos/actions');
const actions = new actionsModule();

const urlencodedParser = bodyParser.urlencoded({ extended: false });

router.post('/actions/tag', urlencodedParser, (req, res) => {
  res.status(200).end();
  let reqBody = JSON.parse(req.body.payload);
  actions.processRequest(reqBody);
});

router.post('/actions/fill_select', urlencodedParser, async (req, res) => {
  let reqBody = JSON.parse(req.body.payload);
  var options =  await actions.select(reqBody);
  res.status(200).send(options).end();
});



module.exports = router;