'use strict';
const router = require('express').Router();

router.use('/health', require('./health.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/employees', require('./employees.routes'));
router.use('/nominations', require('./nominations.routes'));
router.use('/merits', require('./merits.routes'));
router.use('/refs', require('./refs.routes'));
router.use('/ratings', require('./ratings.routes'));
router.use('/requests', require('./requests.routes'));
router.use('/attachments', require('./attachments.routes'));
router.use('/notifications', require('./notifications.routes'));
router.use('/audit', require('./audit.routes'));

router.get('/', (_req, res) => res.json({
  ok: true,
  name: 'Признание заслуг — API',
  endpoints: [
    'GET    /api/health                  — открыт',
    'POST   /api/auth/login              — открыт',
    'GET    /api/auth/me                 — требует токен',
    'POST   /api/auth/refresh            — продление сессии',
    'POST   /api/auth/logout             — выход с отзывом токенов',
    'POST   /api/auth/revoke/:id         — только администратор (отзыв чужих токенов)',
    'GET    /api/employees               — право view',
    'GET    /api/employees/:id           — право view',
    'GET    /api/nominations             — право view',
    'GET    /api/merits                  — право view',
    'GET    /api/refs/:kind              — право refsView (nominations, merits, phrases, faq)',
    'POST   /api/refs/:kind              — право refsEdit',
    'PATCH  /api/refs/:kind/:id          — право refsEdit',
    'DELETE /api/refs/:kind/:id          — право refsEdit (выключает, не удаляет)',
    'POST   /api/refs/:kind/:id/activate — право refsEdit',
    'GET    /api/ratings                 — право reports',
    'GET    /api/ratings/:employeeId     — право reports',
    'GET    /api/requests                — право view',
    'GET    /api/requests/:id            — право view',
    'POST   /api/requests                — право create',
    'PATCH  /api/requests/:id            — право moderate',
    'POST   /api/requests/:id/withdraw   — право withdraw',
    'POST   /api/requests/:id/resubmit   — право create (после доработки)',
    'DELETE /api/requests/:id            — право remove',
    'GET    /api/requests/:id/attachments — право view',
    'POST   /api/requests/:id/attachments — право attach (multipart, поле file)',
    'GET    /api/attachments/:id/download — право view',
    'DELETE /api/attachments/:id          — право attach',
    'GET    /api/notifications            — свои уведомления',
    'PATCH  /api/notifications/:id/read   — свои уведомления',
    'POST   /api/notifications/read-all   — свои уведомления',
    'POST   /api/notifications/flush      — право state (разбор очереди писем)',
    'GET    /api/audit                   — только администратор (журнал действий)',
  ],
}));

module.exports = router;
