'use strict';
const audit = require('../services/audit.service');

/**
 * Запись запроса в журнал действий.
 *
 * Пишем ПОСЛЕ ответа (событие 'finish'), а не до: до ответа неизвестно,
 * чем дело кончилось — прошло, отказано по правам или упало. И пользователь
 * из токена к этому моменту уже разобран, а при отказе по правам — тоже
 * известен, что для журнала как раз самое ценное.
 *
 * Ответ клиенту не ждёт записи: он уже отправлен.
 */
module.exports = function auditMiddleware(req, res, next) {
  const rule = audit.match(req.method, req.path);
  if (!rule) return next();

  res.on('finish', () => {
    const user = req.user || null;
    const entry = {
      userId: user ? user.id : null,
      userLogin: user ? user.login : loginFromBody(req),
      role: user ? user.role : null,
      action: rule.action,
      entity: rule.entity,
      entityId: rule.entityId,
      result: audit.resultOf(res.statusCode),
      statusCode: res.statusCode,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip || (req.socket && req.socket.remoteAddress) || null,
      details: detailsOf(req, res),
    };
    audit.write(entry);
  });

  return next();
};

/**
 * При неудачном входе пользователя в req.user нет, а знать, какую учётку
 * перебирали, нужно. Берём логин из тела — пароль не трогаем.
 */
function loginFromBody(req) {
  const login = req.body && req.body.login;
  return login ? String(login).slice(0, 255) : null;
}

/**
 * Подробности события. Осторожно: сюда не должно попасть ничего лишнего —
 * ни пароля, ни содержимого файла. Берём только то, что помогает понять,
 * что происходило.
 */
function detailsOf(req, res) {
  const d = {};
  if (res.statusCode >= 400) d.denied = true;

  if (req.method === 'PATCH' && req.body && req.body.status) d.new_status = req.body.status;
  if (req.body && req.body.nomination_code) d.nomination = req.body.nomination_code;
  if (req.file) {
    d.file = { name: req.file.originalname, size: req.file.size, type: req.file.mimetype };
  }
  return Object.keys(d).length ? d : null;
}
