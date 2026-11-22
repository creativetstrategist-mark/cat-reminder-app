import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCat, exportBackup, parseBackup } from '../app/js/store.js';

const mochi = {
  id: 'cat-1',
  name: ' Mochi ',
  birthDate: '2026-01-01',
  sex: 'female',
  outdoor: false,
  notes: '',
  records: [{ id: 'r-1', type: 'fvrcp', date: '2026-02-26', product: 'Felocell', notes: '', nextDue: '2026-03-26' }],
};

test('normalizeCat trims text and fills in missing fields', () => {
  const cat = normalizeCat(mochi);
  assert.equal(cat.name, 'Mochi');
  assert.equal(cat.records[0].product, 'Felocell');

  const luna = normalizeCat({ name: 'Luna', birthDate: '2024-05-10' });
  assert.equal(luna.sex, '');
  assert.equal(luna.outdoor, false);
  assert.deepEqual(luna.records, []);
  assert.ok(luna.id);
});

test('normalizeCat drops unknown fields, such as database timestamps', () => {
  const cat = normalizeCat({ ...mochi, updatedAt: { seconds: 1 }, isAdmin: true });
  assert.deepEqual(Object.keys(cat).sort(), ['birthDate', 'coat', 'id', 'name', 'notes', 'outdoor', 'records', 'sex']);
});

test('coat colour is kept when known and cleared otherwise', () => {
  assert.equal(normalizeCat({ ...mochi, coat: 'calico' }).coat, 'calico');
  assert.equal(normalizeCat({ ...mochi, coat: 'rainbow' }).coat, '');
  assert.equal(normalizeCat(mochi).coat, '');
});

test('ids that are unsafe as database paths are replaced', () => {
  assert.notEqual(normalizeCat({ ...mochi, id: '../../users/bob' }).id, '../../users/bob');
  assert.equal(normalizeCat({ ...mochi, id: 'abc-123_X' }).id, 'abc-123_X');
});

test('a backup file round-trips', () => {
  const cats = [normalizeCat(mochi), normalizeCat({ name: 'Luna', birthDate: '2024-05-10' })];
  assert.deepEqual(parseBackup(exportBackup(cats)), cats);
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
