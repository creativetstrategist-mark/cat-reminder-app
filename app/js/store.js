// Checks cat data (from the database or a backup file) and reads and writes
// backup files.

import { isValidDate } from './dates.js';
import { TYPES } from './schedule.js';

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const safeId = (value) => (typeof value === 'string' && SAFE_ID.test(value) ? value : newId());

function normalizeRecord(record, catName, index) {
  const where = `Record ${index + 1} for ${catName}`;
  if (!record || typeof record !== 'object') throw new Error(`${where} is not valid.`);
  if (!TYPES.includes(record.type)) throw new Error(`${where} has an unknown type.`);
  if (!isValidDate(record.date)) throw new Error(`${where} has no valid date.`);
  if (record.nextDue && !isValidDate(record.nextDue)) throw new Error(`${where} has an invalid next date.`);
  return {
    id: safeId(record.id),
    type: record.type,
    date: record.date,
    product: text(record.product),
    notes: text(record.notes),
    nextDue: record.nextDue || '',
  };
}

/** Checks one cat and returns a clean copy. Throws a readable error if it is not valid. */
export function normalizeCat(cat, index = 0) {
  if (!cat || typeof cat !== 'object') throw new Error(`Cat ${index + 1} is not valid.`);
  const name = text(cat.name);
  if (!name) throw new Error(`Cat ${index + 1} has no name.`);
  if (!isValidDate(cat.birthDate)) throw new Error(`${name} has no valid birthday.`);
  const records = Array.isArray(cat.records) ? cat.records : [];
  return {
    id: safeId(cat.id),
    name,
    birthDate: cat.birthDate,
    sex: cat.sex === 'female' || cat.sex === 'male' ? cat.sex : '',
    outdoor: cat.outdoor === true,
    notes: text(cat.notes),
    records: records.map((record, i) => normalizeRecord(record, name, i)),
  };
}

export function exportBackup(cats, now = new Date()) {
  return JSON.stringify({ app: 'cat-reminder-app', version: 1, exportedAt: now.toISOString(), cats }, null, 2);
}

/** Reads a backup file and returns its cats. Throws a readable error if it is not a valid backup. */
export function parseBackup(fileText) {
  let data;
  try {
    data = JSON.parse(fileText);
  } catch {
    throw new Error('This file is not a Cat Reminders backup.');
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.cats)) {
    throw new Error('This file is not a Cat Reminders backup.');
  }
  return data.cats.map(normalizeCat);
}
