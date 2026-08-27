'use strict';
const router = require('express').Router();
const c = require('../controllers/nominations.controller');
const requireAuth = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');

// Номинация нужна любому, кто заполняет заявку, поэтому право view,
// а не refsView: последнее — про редактирование справочников.
router.get('/', requireAuth, requirePermission('view'), c.list);

module.exports = router;
