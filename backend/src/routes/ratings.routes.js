'use strict';
const router = require('express').Router();
const c = require('../controllers/ratings.controller');
router.get('/', c.list);
router.get('/:employeeId', c.byEmployee);
module.exports = router;
