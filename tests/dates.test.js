import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDate, todayISO, addDays, addMonths, addYears, daysBetween, monthsBetween, ageText } from '../app/js/dates.js';

test('isValidDate accepts real dates only', () => {
  assert.equal(isValidDate('2026-02-28'), true);
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2026-1-5'), false);
  assert.equal(isValidDate(''), false);
  assert.equal(isValidDate(undefined), false);
});

test('todayISO uses the local date', () => {
  assert.equal(todayISO(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(todayISO(new Date(2026, 11, 31, 0, 1)), '2026-12-31');
});

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-01-01', 56), '2026-02-26');
  assert.equal(addDays('2026-12-25', 14), '2027-01-08');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('addMonths keeps the day, or uses the last day of a shorter month', () => {
  assert.equal(addMonths('2026-01-15', 1), '2026-02-15');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(addYears('2028-02-29', 1), '2029-02-28');
});

test('daysBetween and monthsBetween count whole units', () => {
  assert.equal(daysBetween('2026-01-01', '2026-03-26'), 84);
  assert.equal(daysBetween('2026-03-26', '2026-01-01'), -84);
  assert.equal(monthsBetween('2026-01-15', '2026-07-14'), 5);
  assert.equal(monthsBetween('2026-01-15', '2026-07-15'), 6);
});

test('ageText reads naturally at every age', () => {
  assert.equal(ageText('2026-11-20', '2026-11-22'), '2 days old');
  assert.equal(ageText('2026-11-15', '2026-11-22'), '1 week old');
  assert.equal(ageText('2026-09-01', '2026-11-22'), '11 weeks old');
  assert.equal(ageText('2026-05-01', '2026-11-22'), '6 months old');
  assert.equal(ageText('2025-08-10', '2026-11-22'), '1 year, 3 months old');
  assert.equal(ageText('2025-11-22', '2026-11-22'), '1 year old');
  assert.equal(ageText('2020-03-15', '2026-11-22'), '6 years old');
});
