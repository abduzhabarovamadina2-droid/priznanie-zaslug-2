'use strict';
const service = require('../services/attachments.service');
const asyncHandler = require('../middleware/asyncHandler');
const { can } = require('../config/permissions');

exports.listForRequest = asyncHandler(async (req, res) => {
  const data = await service.listForRequest(req.params.id);
  res.json({ ok: true, ...data });
});

exports.add = asyncHandler(async (req, res) => {
  const item = await service.add(req.params.id, req.file, req.user);
  res.status(201).json({ ok: true, item });
});

exports.download = asyncHandler(async (req, res) => {
  const { row, fullPath, downloadName } = await service.open(req.params.id);
  res.type(row.mime_type || 'application/octet-stream');
  // Имя отдаём дважды: латиницей для старых клиентов и в UTF-8 для остальных,
  // иначе русское имя файла приезжает искажённым.
  res.setHeader('Content-Disposition',
    `attachment; filename="${downloadName.replace(/[^\x20-\x7E]/g, '_')}"; ` +
    `filename*=UTF-8''${encodeURIComponent(downloadName)}`);
  res.sendFile(fullPath);
});

exports.remove = asyncHandler(async (req, res) => {
  const removed = await service.remove(req.params.id, req.user, can);
  res.json({ ok: true, removed });
});
