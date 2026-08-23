'use strict';
const router = require('express').Router();
const c = require('../controllers/employees.controller');
const requireAuth = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');

// Чтение справочника доступно любому, у кого есть право просмотра.
router.get('/', requireAuth, requirePermission('view'), c.list);
router.get('/:id', requireAuth, requirePermission('view'), c.getOne);

module.exports = router;
