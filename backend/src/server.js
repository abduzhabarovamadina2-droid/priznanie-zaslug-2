'use strict';
/**
 * Точка входа. Само приложение собирается в app.js — здесь только запуск.
 *
 * Раньше server.js поднимал собственный express-app и повторял часть
 * настроек. Из-за этого мимо проходили обработчик ошибок (любая ошибка
 * уходила HTML-страницей со стеком вместо JSON), ограничение CORS и лимит
 * тела запроса: app.js был написан, но не использовался.
 */
const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const mailScheduler = require('./services/mail-scheduler');

if (config.missingEnv.length) {
  logger.error('Не заданы обязательные переменные окружения: ' + config.missingEnv.join(', '));
}
if (!config.jwtSecret) {
  logger.error('JWT_SECRET не задан — вход будет отвечать 503. Задайте его в backend/.env');
}

// Планировщик живёт здесь, а не в app.js: тесты поднимают приложение
// многократно, и фоновый таймер им ни к чему.
mailScheduler.start();

app.listen(config.port, function () {
  console.log('');
  console.log('=================================');
  console.log('Backend запущен');
  console.log('Режим:  ' + config.env);
  console.log('API:    http://localhost:' + config.port + '/api');
  console.log('Health: http://localhost:' + config.port + '/api/health');
  console.log('Login:  POST http://localhost:' + config.port + '/api/auth/login');
  console.log('CORS:   ' + config.corsOrigin.join(', '));
  console.log('=================================');
  console.log('');
});
