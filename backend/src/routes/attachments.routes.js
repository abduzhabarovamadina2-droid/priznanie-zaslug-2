'use strict';
const router = require('express').Router();
const c = require('../controllers/attachments.controller');
const requireAuth = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');

// Скачивание и удаление адресуются по id вложения, а не заявки.
router.get('/:id/download', requireAuth, requirePermission('view'), c.download);

// Право attach — приложить или убрать своё; чужое убирает администратор,
// это проверяет сервис.
router.delete('/:id', requireAuth, requirePermission('attach'), c.remove);

module.exports = router;
