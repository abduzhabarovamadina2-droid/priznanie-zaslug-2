'use strict';
const router = require('express').Router();
const c = require('../controllers/health.controller');
router.get('/', c.get);
module.exports = router;
