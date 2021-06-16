const express = require('express');
const dialogRouter = require('./routers/dialog.js');
const app = express();
const config = require('./config/config');

app.use('/', dialogRouter);

app.listen(config.PORT, () => {
    console.log('Server up at port ' + config.PORT);
});