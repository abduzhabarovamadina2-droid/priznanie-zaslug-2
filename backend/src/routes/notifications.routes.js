'use strict';
const router = require('express').Router();
const c = require('../controllers/notifications.controller');
const requireAuth = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');

// Свои уведомления видит любой, кто вошёл: отдельного права здесь не нужно,
// список и так ограничен собственным user_id.
router.get('/', requireAuth, c.list);
router.post('/read-all', requireAuth, c.markAllRead);
router.patch('/:id/read', requireAuth, c.markRead);

// Разбор очереди писем — административное действие.
router.post('/flush', requireAuth, requirePermission('state'), c.flush);

module.exports = router;
