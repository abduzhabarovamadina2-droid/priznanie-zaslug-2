'use strict';
const AppError = require('../utils/AppError');
const { can, permissionsOf } = require('../config/permissions');

/**
 * Проверка права на действие. Ставится после requireAuth.
 *
 * 401 — если requireAuth не отработал и пользователя нет.
 * 403 — пользователь есть, но права на действие нет.
 */
function requirePermission(permission) {
  return function (req, _res, next) {
    if (!req.user) return next(new AppError('Требуется авторизация', 401));
    if (!can(req.user.role, permission)) {
      return next(new AppError(
        `Недостаточно прав: роль «${req.user.role}» не может выполнить действие «${permission}»`,
        403,
        { role: req.user.role, required: permission, granted: permissionsOf(req.user.role) }));
    }
    return next();
  };
}

/** Проверка конкретной роли — когда дело не в действии, а именно в роли. */
function requireRole(...roles) {
  const allowed = roles.flat();
  return function (req, _res, next) {
    if (!req.user) return next(new AppError('Требуется авторизация', 401));
    if (!allowed.includes(req.user.role)) {
      return next(new AppError(
        `Недостаточно прав: доступно ролям ${allowed.join(', ')}`,
        403,
        { role: req.user.role, allowed }));
    }
    return next();
  };
}

module.exports = { requirePermission, requireRole };
