import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, loadState, saveState, exportState, parseBackup, normalizeState } from '../app/js/store.js';

class MemoryStorage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
}

const sample = {
  version: 1,
  cats: [
    {
      id: 'cat-1',
      name: ' Mochi ',
      birthDate: '2026-01-01',
      sex: 'female',
      outdoor: false,
      notes: '',
      records: [{ id: 'r-1', type: 'fvrcp', date: '2026-02-26', product: 'Felocell', notes: '', nextDue: '2026-03-26' }],
    },
    { name: 'Luna', birthDate: '2024-05-10' },
  ],
};

test('saved cats load back the same', () => {
  const storage = new MemoryStorage();
  const state = normalizeState(sample);
  saveState(state, storage);
  assert.deepEqual(loadState(storage), state);
});

test('normalizeState trims text and fills in missing fields', () => {
  const state = normalizeState(sample);
  assert.equal(state.cats[0].name, 'Mochi');
  assert.equal(state.cats[1].sex, '');
  assert.equal(state.cats[1].outdoor, false);
  assert.deepEqual(state.cats[1].records, []);
  assert.ok(state.cats[1].id);
});

test('an empty device starts with no cats', () => {
  assert.deepEqual(loadState(new MemoryStorage()), { version: 1, cats: [] });
});

test('unreadable saved data is kept aside, not thrown away', () => {
  const storage = new MemoryStorage({ [STORAGE_KEY]: '{broken' });
  assert.deepEqual(loadState(storage).cats, []);
  const kept = [...storage.map.keys()].find((key) => key.startsWith(`${STORAGE_KEY}:unreadable-`));
  assert.equal(storage.getItem(kept), '{broken');
});

test('a backup file round-trips', () => {
  const state = normalizeState(sample);
  assert.deepEqual(parseBackup(exportState(state)), state);
});

test('bad backup files are rejected with a clear message', () => {
  assert.throws(() => parseBackup('not json'), /not a Cat Reminders backup/);
  assert.throws(() => parseBackup('{"hello": 1}'), /not a Cat Reminders backup/);
  assert.throws(() => parseBackup('{"cats": [{"name": "", "birthDate": "2026-01-01"}]}'), /has no name/);
  assert.throws(() => parseBackup('{"cats": [{"name": "Tom", "birthDate": "2026-02-30"}]}'), /Tom has no valid birthday/);
  assert.throws(
    () => parseBackup('{"cats": [{"name": "Tom", "birthDate": "2026-01-01", "records": [{"type": "flea", "date": "2026-02-01"}]}]}'),
    /Record 1 for Tom has an unknown type/,
  );
});
