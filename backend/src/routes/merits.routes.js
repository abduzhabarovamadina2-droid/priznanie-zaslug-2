'use strict';
const router = require('express').Router();
const c = require('../controllers/merits.controller');
const requireAuth = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');

// Заслугу выбирает тот, кто заполняет заявку, — значит право view.
// ?nomination=NOM-101 сужает список до одной номинации.
router.get('/', requireAuth, requirePermission('view'), c.list);

module.exports = router;
