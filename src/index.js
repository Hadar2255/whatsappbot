'use strict';

require('dotenv').config();

const { startBot } = require('./bot');
const { startServer } = require('./server');

startServer();
startBot();
