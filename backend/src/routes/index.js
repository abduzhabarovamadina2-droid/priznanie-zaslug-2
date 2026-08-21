'use strict';
const router = require('express').Router();

router.use('/health', require('./health.routes'));
router.use('/employees', require('./employees.routes'));
router.use('/ratings', require('./ratings.routes'));
router.use('/requests', require('./requests.routes'));

router.get('/', (_req, res) => res.json({
  ok: true,
  name: 'Признание заслуг — API',
  endpoints: [
    'GET    /api/health',
    'GET    /api/employees',
    'GET    /api/employees/:id',
    'GET    /api/ratings',
    'GET    /api/ratings/:employeeId',
    'GET    /api/requests',
    'GET    /api/requests/:id',
    'POST   /api/requests',
    'PATCH  /api/requests/:id',
  ],
}));

module.exports = router;
