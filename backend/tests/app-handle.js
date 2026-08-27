'use strict';
/**
 * Приложение для тестов.
 *
 * Отдельным файлом, потому что src/server.js сразу занимает порт из .env,
 * а тестам нужен свободный: они поднимают app сами.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const app = require('../src/app');
module.exports = { app };
