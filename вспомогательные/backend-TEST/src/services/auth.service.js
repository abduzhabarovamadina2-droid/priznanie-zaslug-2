'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('../utils/AppError');
const repo = require('../repositories/auth.repo');
const { permissionsOf } = require('../config/permissions');

/**
 * Вход по логину и паролю.
 *
 * Ответ на неверный логин и на неверный пароль одинаковый — чтобы нельзя
 * было перебором выяснить, какие учётные записи существуют.
 * Ни пароль, ни хеш, ни токен не логируются.
 */
async function login({ login, password }) {
  if (!config.jwtSecret) throw new AppError('Аутентификация не настроена: не задан JWT_SECRET', 503);
  if (!login || !password) throw AppError.badRequest('Укажите логин и пароль');

  const user = await repo.findByLogin(String(login));
  const invalid = new AppError('Неверный логин или пароль', 401);
  if (!user) throw invalid;

  const hash = await repo.findPasswordHash(user.id);
  if (!hash) throw invalid;

  const ok = await bcrypt.compare(String(password), hash);
  if (!ok) throw invalid;

  // Проверяем активность после пароля: иначе по разнице ответов
  // можно было бы отличить существующую учётку от несуществующей.
  if (!user.is_active) throw new AppError('Учётная запись деактивирована', 403);

  const token = jwt.sign(
    { userId: user.id, login: user.login, role: user.role, employeeId: user.employee_id },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn });

  return { token, expiresIn: config.jwtExpiresIn, user: publicProfile(user) };
}

/** Текущий пользователь. Приходит из requireAuth, повторный запрос не нужен. */
async function me(user) {
  if (!user) throw new AppError('Требуется авторизация', 401);
  return publicProfile(user);
}

/** Единая форма профиля наружу. password_hash сюда не попадает никогда. */
function publicProfile(u) {
  return {
    id: u.id,
    login: u.login,
    email: u.email || null,
    role: u.role,
    roleName: u.role_name,
    groupCode: u.group_code || null,
    permissions: permissionsOf(u.role),
    pointsBalance: u.points_balance,
    isActive: u.is_active,
    employee: u.employee_id ? {
      id: u.employee_id, tnumber: u.tnumber, fio: u.fio, shortName: u.short_name,
      post: u.post, dept: u.dept, dep: u.dep, branch: u.branch,
    } : null,
  };
}

module.exports = { login, me, publicProfile };
