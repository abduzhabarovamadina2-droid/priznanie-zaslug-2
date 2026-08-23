'use strict';
const router = require('express').Router();
const c = require('../controllers/requests.controller');
const requireAuth = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');

// Права разные у разных операций, поэтому проверка не на весь роутер,
// а на каждый маршрут отдельно. Названия прав — из матрицы MR_can.
router.get('/', requireAuth, requirePermission('view'), c.list);
router.get('/:id', requireAuth, requirePermission('view'), c.getOne);

// Создание заявки.
router.post('/', requireAuth, requirePermission('create'), c.create);

// Смена статуса — модерация. TODO: отзыв заявки самим инициатором
// (право withdraw) появится, когда добавим отдельный маршрут отзыва.
router.patch('/:id', requireAuth, requirePermission('moderate'), c.patch);

module.exports = router;
