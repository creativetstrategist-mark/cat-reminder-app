// Saves cats and their records in this browser's localStorage, and reads and
// writes backup files.

import { isValidDate } from './dates.js';
import { TYPES } from './schedule.js';

export const STORAGE_KEY = 'cat-reminder-app';
const VERSION = 1;

export function emptyState() {
  return { version: VERSION, cats: [] };
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function normalizeRecord(record, catName, index) {
  const where = `Record ${index + 1} for ${catName}`;
  if (!record || typeof record !== 'object') throw new Error(`${where} is not valid.`);
  if (!TYPES.includes(record.type)) throw new Error(`${where} has an unknown type.`);
  if (!isValidDate(record.date)) throw new Error(`${where} has no valid date.`);
  if (record.nextDue && !isValidDate(record.nextDue)) throw new Error(`${where} has an invalid next date.`);
  return {
    id: text(record.id) || newId(),
    type: record.type,
    date: record.date,
    product: text(record.product),
    notes: text(record.notes),
    nextDue: record.nextDue || '',
  };
}

function normalizeCat(cat, index) {
  if (!cat || typeof cat !== 'object') throw new Error(`Cat ${index + 1} is not valid.`);
  const name = text(cat.name);
  if (!name) throw new Error(`Cat ${index + 1} has no name.`);
  if (!isValidDate(cat.birthDate)) throw new Error(`${name} has no valid birthday.`);
  const records = Array.isArray(cat.records) ? cat.records : [];
  return {
    id: text(cat.id) || newId(),
    name,
    birthDate: cat.birthDate,
    sex: cat.sex === 'female' || cat.sex === 'male' ? cat.sex : '',
    outdoor: cat.outdoor === true,
    notes: text(cat.notes),
    records: records.map((record, i) => normalizeRecord(record, name, i)),
  };
}

/** Checks saved or imported data and returns a clean copy. Throws a readable error if it is not valid. */
export function normalizeState(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.cats)) {
    throw new Error('This file is not a Cat Reminders backup.');
  }
  return { version: VERSION, cats: data.cats.map(normalizeCat) };
}

export function loadState(storage = globalThis.localStorage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return emptyState();
  }
  if (!raw) return emptyState();
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    // Keep the unreadable data rather than overwriting it on the next save.
    try {
      storage.setItem(`${STORAGE_KEY}:unreadable-${Date.now()}`, raw);
    } catch {
      /* storage full or blocked: nothing more we can do */
    }
    return emptyState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportState(state, now = new Date()) {
  return JSON.stringify({ app: 'cat-reminder-app', exportedAt: now.toISOString(), ...state }, null, 2);
}

export function parseBackup(fileText) {
  let data;
  try {
    data = JSON.parse(fileText);
  } catch {
    throw new Error('This file is not a Cat Reminders backup.');
  }
  return normalizeState(data);
}
