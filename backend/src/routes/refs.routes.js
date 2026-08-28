'use strict';
const router = require('express').Router();
const c = require('../controllers/refs.controller');
const requireAuth = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');

/**
 * Справочники: номинации, заслуги, фразы, вопрос-ответ.
 *
 * :kind — имя справочника в адресе. Чтение под правом refsView, запись —
 * под refsEdit: именно эти права были объявлены в матрице и до сих пор
 * нигде не применялись.
 *
 * Записи не удаляются, а выключаются: на них ссылаются заявки.
 */
router.get('/:kind', requireAuth, requirePermission('refsView'), c.list);
router.get('/:kind/:id', requireAuth, requirePermission('refsView'), c.getOne);

router.post('/:kind', requireAuth, requirePermission('refsEdit'), c.create);
router.patch('/:kind/:id', requireAuth, requirePermission('refsEdit'), c.update);
router.delete('/:kind/:id', requireAuth, requirePermission('refsEdit'), c.deactivate);
router.post('/:kind/:id/activate', requireAuth, requirePermission('refsEdit'), c.activate);

module.exports = router;
