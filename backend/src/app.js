'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config');
const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const auditMiddleware = require('./middleware/audit');

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (config.env !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));

// Журнал действий вешаем перед маршрутами: сама запись происходит после
// ответа, когда уже известны и пользователь, и чем всё кончилось.
app.use('/api', auditMiddleware);
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
