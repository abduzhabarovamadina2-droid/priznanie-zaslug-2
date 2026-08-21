'use strict';
const router = require('express').Router();
const c = require('../controllers/requests.controller');

// TODO (следующий этап): подключить requireAuth и requireRole.
// Матрица прав уже определена в прототипе (MR_can) и переносится как есть:
//   create   — initiator, moderator, admin
//   moderate — moderator, admin
//   withdraw — initiator, admin
//   remove   — admin
router.get('/', c.list);
router.get('/:id', c.getOne);
router.post('/', c.create);
router.patch('/:id', c.patch);
module.exports = router;
