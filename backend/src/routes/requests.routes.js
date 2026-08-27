'use strict';
const router = require('express').Router();
const c = require('../controllers/requests.controller');
const requireAuth = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');
const uploadSingle = require('../middleware/upload');
const att = require('../controllers/attachments.controller');

// Права разные у разных операций, поэтому проверка не на весь роутер,
// а на каждый маршрут отдельно. Названия прав — из матрицы MR_can.
router.get('/', requireAuth, requirePermission('view'), c.list);
router.get('/:id', requireAuth, requirePermission('view'), c.getOne);

// Создание заявки.
router.post('/', requireAuth, requirePermission('create'), c.create);

// Смена статуса — модерация: согласование и отклонение.
router.patch('/:id', requireAuth, requirePermission('moderate'), c.patch);

// Отзыв заявки самим инициатором. Отдельный маршрут, потому что право
// другое: у модератора есть moderate, но нет withdraw, и наоборот.
// Владельца заявки проверяет сервис.
router.post('/:id/withdraw', requireAuth, requirePermission('withdraw'), c.withdraw);

// Удаление заявки. Право remove есть только у администратора.
router.delete('/:id', requireAuth, requirePermission('remove'), c.remove);

// Вложения заявки. Список читает всякий, кто видит заявку; прикладывает —
// тот, у кого есть право attach.
router.get('/:id/attachments', requireAuth, requirePermission('view'), att.listForRequest);
router.post('/:id/attachments', requireAuth, requirePermission('attach'), uploadSingle, att.add);

module.exports = router;
