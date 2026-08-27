'use strict';
const router = require('express').Router();
const c = require('../controllers/audit.controller');
const requireAuth = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');

// Журнал действий — только администратору. Это не отчёт для всех: в нём
// видно, кто чем занимался, включая отказы по правам.
router.get('/', requireAuth, requireRole('admin'), c.list);

module.exports = router;
