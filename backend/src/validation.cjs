'use strict';

const { ApiError } = require('./errors.cjs');
const colorCodes = new Set(require('./mard-codes.json'));
const { MAX_BODY_BYTES, MAX_GRID_EDGE, MAX_GRID_CELLS, MAX_PALETTE_COLORS } = require('./conversion-limits.cjs');
const MAX_REVISION = Number.MAX_SAFE_INTEGER - 1;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function invalid() {
  throw new ApiError('INVALID_REQUEST');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function fields(value, allowed, required) {
  if (!isObject(value)) invalid();
  if (Object.keys(value).some(key => allowed.indexOf(key) === -1)) invalid();
  if (required.some(key => !Object.prototype.hasOwnProperty.call(value, key))) invalid();
}

function integer(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) invalid();
  return value;
}

function clientId(value) {
  if (typeof value !== 'string' || !idPattern.test(value)) invalid();
  return value;
}

function validateRequest(value) {
  fields(value, ['action', 'payload'], ['action', 'payload']);
  if (['auth.login', 'works.list', 'works.save', 'works.delete'].indexOf(value.action) === -1 || !isObject(value.payload)) invalid();
  let serialized;
  try { serialized = JSON.stringify(value); } catch (error) { invalid(); }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE');
}

function loginPayload(value) {
  fields(value, ['code'], ['code']);
  if (typeof value.code !== 'string' || value.code.length < 1 || value.code.length > 256 || /[\s\u0000-\u001f\u007f]/.test(value.code)) invalid();
  return value.code;
}

function copyPattern(value) {
  return {
    version: value.version, paletteId: value.paletteId, name: value.name,
    width: value.width, height: value.height, beadSize: value.beadSize, cells: value.cells.slice()
  };
}

function pattern(value) {
  const keys = ['version', 'paletteId', 'name', 'width', 'height', 'beadSize', 'cells'];
  fields(value, keys, keys);
  if (value.version !== 1 || value.paletteId !== 'mard-221') invalid();
  integer(value.width, 1, MAX_GRID_EDGE);
  integer(value.height, 1, MAX_GRID_EDGE);
  const size = value.width * value.height;
  if (size > MAX_GRID_CELLS || (value.beadSize !== 2.6 && value.beadSize !== 5)) invalid();
  if (typeof value.name !== 'string' || !value.name.trim() || Array.from(value.name).length > 60 || /[\u0000-\u001f\u007f]/.test(value.name)) invalid();
  if (!Array.isArray(value.cells) || value.cells.length !== size) invalid();
  if (new Set(value.cells.filter(cell => cell !== null)).size > MAX_PALETTE_COLORS) invalid();
  for (const cell of value.cells) {
    if (cell !== null && (typeof cell !== 'string' || !colorCodes.has(cell))) invalid();
  }
  return copyPattern(value);
}

function imageId(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) invalid();
  return value;
}

function savePayload(value) {
  fields(value, ['work', 'baseRevision'], ['work', 'baseRevision']);
  fields(value.work, ['id', 'pattern', 'completedRows', 'sourceImageId', 'cutoutId', 'originPublicId'], ['id', 'pattern', 'completedRows']);
  const validatedPattern = pattern(value.work.pattern);
  const rows = value.work.completedRows;
  if (!Array.isArray(rows) || rows.length > validatedPattern.height || new Set(rows).size !== rows.length) invalid();
  for (const row of rows) integer(row, 0, validatedPattern.height - 1);
  return {
    work: { id: clientId(value.work.id), pattern: validatedPattern, completedRows: rows.slice(), sourceImageId: imageId(value.work.sourceImageId), cutoutId: imageId(value.work.cutoutId), originPublicId: imageId(value.work.originPublicId) },
    baseRevision: integer(value.baseRevision, 0, MAX_REVISION)
  };
}

function deletePayload(value) {
  fields(value, ['id', 'baseRevision'], ['id', 'baseRevision']);
  return { id: clientId(value.id), baseRevision: integer(value.baseRevision, 0, MAX_REVISION) };
}

function listPayload(value) {
  fields(value, ['cursor', 'limit'], []);
  const after = value.cursor == null || value.cursor === '' ? null : clientId(value.cursor);
  const limit = value.limit === undefined ? 20 : integer(value.limit, 1, 20);
  return { after, limit };
}

module.exports = { MAX_BODY_BYTES, isObject, fields, integer, clientId, imageId, pattern, validateRequest, loginPayload, savePayload, deletePayload, listPayload, copyPattern };
