'use strict';
const router = require('express').Router();

router.use('/health', require('./health.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/employees', require('./employees.routes'));
router.use('/ratings', require('./ratings.routes'));
router.use('/requests', require('./requests.routes'));

router.get('/', (_req, res) => res.json({
  ok: true,
  name: 'Признание заслуг — API',
  endpoints: [
    'GET    /api/health                  — открыт',
    'POST   /api/auth/login              — открыт',
    'GET    /api/auth/me                 — требует токен',
    'GET    /api/employees               — право view',
    'GET    /api/employees/:id           — право view',
    'GET    /api/ratings                 — право reports',
    'GET    /api/ratings/:employeeId     — право reports',
    'GET    /api/requests                — право view',
    'GET    /api/requests/:id            — право view',
    'POST   /api/requests                — право create',
    'PATCH  /api/requests/:id            — право moderate',
  ],
}));

module.exports = router;
