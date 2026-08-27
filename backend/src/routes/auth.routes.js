'use strict';
const router = require('express').Router();
const c = require('../controllers/auth.controller');
const requireAuth = require('../middleware/requireAuth');
const loginLimit = require('../middleware/loginLimit');

// Открытый маршрут: вход в систему. guard стоит первым — он отсекает
// перебор пароля до того, как запрос дойдёт до базы.
router.post('/login', loginLimit.guard, c.login);

// Требует действующий Bearer-токен.
router.get('/me', requireAuth, c.me);

module.exports = router;
