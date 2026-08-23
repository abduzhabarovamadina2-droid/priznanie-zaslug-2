'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Все API-маршруты
app.use('/api', routes);

// Обработка неизвестных маршрутов
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: {
      message: 'Маршрут не найден',
      status: 404
    }
  });
});

app.listen(PORT, function () {
  console.log('');
  console.log('=================================');
  console.log('Backend запущен');
  console.log('API: http://localhost:' + PORT + '/api');
  console.log('Health: http://localhost:' + PORT + '/api/health');
  console.log('Login: POST http://localhost:' + PORT + '/api/auth/login');
  console.log('=================================');
  console.log('');
});