'use strict';
const router = require('express').Router();
const c = require('../controllers/employees.controller');
router.get('/', c.list);
router.get('/:id', c.getOne);
module.exports = router;
