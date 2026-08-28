'use strict';
const router = require('express').Router();
const c = require('../controllers/auth.controller');
const requireAuth = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');
const loginLimit = require('../middleware/loginLimit');
const asyncHandler = require('../middleware/asyncHandler');

// Открытый маршрут: вход в систему. guard стоит первым — он отсекает
// перебор пароля до того, как запрос дойдёт до базы.
router.post('/login', asyncHandler(loginLimit.guard), c.login);

// Требует действующий Bearer-токен.
router.get('/me', requireAuth, c.me);

// Продление сессии: действующий токен меняется на свежий.
router.post('/refresh', requireAuth, c.refresh);

// Выход с отзывом: выданные токены перестают приниматься сразу.
router.post('/logout', requireAuth, c.logout);

// Отзыв токенов у другого пользователя — увольнение, утечка учётки.
router.post('/revoke/:id', requireAuth, requireRole('admin'), c.revoke);

module.exports = router;
