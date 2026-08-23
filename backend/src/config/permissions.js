'use strict';
/**
 * Матрица прав. Источник — MR_can прототипа, уточнённый решением по роли
 * руководителя: head получает только просмотр и отчёты (конфликт C-2 закрыт).
 *
 * Право — это действие, а не endpoint: один и тот же маршрут может требовать
 * разных прав в зависимости от операции.
 */
const PERMISSIONS = {
  initiator: ['create', 'view', 'reports', 'form', 'withdraw', 'attach'],
  moderator: ['create', 'view', 'reports', 'refsView', 'moderate', 'state'],
  admin: ['create', 'view', 'reports', 'form', 'withdraw', 'attach',
          'refsView', 'refsEdit', 'moderate', 'state', 'remove'],
  head: ['view', 'reports'],
};

/** Есть ли у роли право. Неизвестная роль прав не имеет. */
function can(role, permission) {
  const list = PERMISSIONS[role];
  return Array.isArray(list) && list.includes(permission);
}

/** Все права роли — удобно отдавать клиенту вместе с профилем. */
function permissionsOf(role) {
  return (PERMISSIONS[role] || []).slice();
}

const ALL_PERMISSIONS = [...new Set(Object.values(PERMISSIONS).flat())].sort();

module.exports = { PERMISSIONS, ALL_PERMISSIONS, can, permissionsOf };
