'use strict';
const router = require('express').Router();
const c = require('../controllers/auth.controller');
const requireAuth = require('../middleware/requireAuth');

// Открытый маршрут: вход в систему.
router.post('/login', c.login);

// Требует действующий Bearer-токен.
router.get('/me', requireAuth, c.me);

module.exports = router;
