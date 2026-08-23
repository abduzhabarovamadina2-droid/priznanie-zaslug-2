'use strict';
const router = require('express').Router();
const c = require('../controllers/ratings.controller');
const requireAuth = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');

// Рейтинг — это отчёт, поэтому право reports.
router.get('/', requireAuth, requirePermission('reports'), c.list);
router.get('/:employeeId', requireAuth, requirePermission('reports'), c.byEmployee);

module.exports = router;
