import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodRange, typeProgress, catProgress, mood, onTimeStreak, doseTimeliness, earnedBadges, level } from '../app/js/progress.js';

const rec = (type, date, extra = {}) => ({ id: `${type}-${date}`, type, date, ...extra });
const kitten = (records = []) => ({ id: 'mochi', name: 'Mochi', birthDate: '2026-01-01', outdoor: false, records });

test('periodRange covers the whole month or year', () => {
  assert.deepEqual(periodRange('2026-02-14', 'month'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(periodRange('2028-02-14', 'month'), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(periodRange('2026-12-31', 'month'), { start: '2026-12-01', end: '2026-12-31' });
  assert.deepEqual(periodRange('2026-07-04', 'year'), { start: '2026-01-01', end: '2026-12-31' });
});

test('a kitten’s month: done, due now and coming up', () => {
  // Born 1 Jan; on 20 Jan the 2-week deworming (15 Jan) is done, the next is due 29 Jan.
  const cat = kitten([rec('deworm', '2026-01-15')]);
  assert.deepEqual(
    (({ done, dueNow, comingUp, total }) => ({ done, dueNow, comingUp, total }))(typeProgress(cat, 'deworm', '2026-01-20', 'month')),
    { done: 1, dueNow: 0, comingUp: 1, total: 2 },
  );
  // The 4-in-1 isn't due until 26 Feb, so January has nothing for it.
  assert.equal(typeProgress(cat, 'fvrcp', '2026-01-20', 'month').total, 0);
});

test('overdue doses count as due now in any period', () => {
  const cat = kitten([rec('deworm', '2026-08-01')]); // next was due 1 Nov
  const p = typeProgress(cat, 'deworm', '2026-12-10', 'month');
  assert.equal(p.dueNow, 1);
  assert.equal(p.done, 0);
});

test('catProgress adds the types up; nothing due counts as 100%', () => {
  const cat = kitten([rec('deworm', '2026-01-15')]);
  const p = catProgress(cat, '2026-01-20', 'month');
  assert.deepEqual([p.done, p.dueNow, p.comingUp, p.total, p.percent], [1, 0, 1, 2, 50]);

  const adult = { id: 'luna', name: 'Luna', birthDate: '2020-01-01', records: [rec('deworm', '2026-06-01'), rec('fvrcp', '2026-06-01'), rec('fvrcp', '2026-06-29'), rec('rabies', '2026-06-01')] };
  const quiet = catProgress(adult, '2026-07-15', 'month'); // next deworming is 1 Sep
  assert.deepEqual([quiet.total, quiet.percent], [0, 100]);
});

test('the year view counts everything given and still due this year', () => {
  const cat = kitten([rec('deworm', '2026-01-15'), rec('deworm', '2026-01-29')]);
  const p = typeProgress(cat, 'deworm', '2026-02-01', 'year');
  // 2 done; 12 Feb, 26 Feb, then monthly to 6 months, then every 3 months, all within 2026.
  assert.equal(p.done, 2);
  assert.equal(p.dueNow, 0);
  assert.equal(p.comingUp, 8);
});

test('mood sums up the period', () => {
  assert.equal(mood({ dueNow: 1, total: 3, done: 1 }), 'alert');
  assert.equal(mood({ dueNow: 0, total: 0, done: 0 }), 'clear');
  assert.equal(mood({ dueNow: 0, total: 2, done: 2 }), 'perfect');
  assert.equal(mood({ dueNow: 0, total: 3, done: 1 }), 'ontrack');
});

test('doses given within a week of their due date are on time', () => {
  const cat = kitten([
    rec('deworm', '2026-01-15'), // first ever: on time
    rec('deworm', '2026-01-29'), // due 29 Jan: on time
    rec('deworm', '2026-02-20'), // due 12 Feb: 8 days late
    rec('deworm', '2026-03-06'), // due 6 Mar: 2 weeks on, as she was under 8 weeks at the last one
  ]);
  const timeliness = doseTimeliness(cat);
  assert.deepEqual(timeliness.map((d) => [d.date, d.onTime]), [
    ['2026-03-06', true],
    ['2026-02-20', false],
    ['2026-01-29', true],
    ['2026-01-15', true],
  ]);
  assert.equal(onTimeStreak(cat), 1);
});

test('a vet’s next date counts as the due date', () => {
  const cat = kitten([rec('rabies', '2026-04-01', { nextDue: '2026-06-01' }), rec('rabies', '2026-06-05')]);
  assert.equal(doseTimeliness(cat)[0].onTime, true);
});

test('the first dose for an adopted adult is never late', () => {
  const adult = { id: 'luna', name: 'Luna', birthDate: '2018-01-01', records: [rec('rabies', '2026-03-01')] };
  assert.equal(onTimeStreak(adult), 1);
});

test('purr-fect month waits until everything due that month is done', () => {
  const cat = kitten([rec('deworm', '2026-04-26')]);
  assert.ok(!earnedBadges(cat, '2026-05-01').has('purrfect-month')); // 26 May still to come
});

test('badges are earned as the cat gets up to date', () => {
  const today = '2026-05-27';
  assert.deepEqual([...earnedBadges(kitten(), today)], []);

  // Every dose on time; May's only dose (26 May) is done, so May is purr-fect.
  const cat = kitten([
    rec('deworm', '2026-01-15'), rec('deworm', '2026-01-29'), rec('deworm', '2026-02-12'), rec('deworm', '2026-02-26'),
    rec('deworm', '2026-03-26'), rec('deworm', '2026-04-26'), rec('deworm', '2026-05-26'),
    rec('fvrcp', '2026-02-26'), rec('fvrcp', '2026-03-26'), rec('fvrcp', '2026-04-23'),
    rec('rabies', '2026-03-26'),
  ]);
  const earned = earnedBadges(cat, today);
  assert.deepEqual([...earned].sort(), ['first-steps', 'hot-streak', 'purrfect-month', 'rabies-ready', 'shot-star', 'worm-warrior'].sort());
  assert.deepEqual(level(earned), { number: 6, title: 'Legendary cat' });
});

test('an overdue dose loses its badge', () => {
  const cat = kitten([rec('rabies', '2026-03-26')]); // booster due 26 Mar 2027
  assert.ok(earnedBadges(cat, '2027-03-01').has('rabies-ready'));
  assert.ok(!earnedBadges(cat, '2027-04-01').has('rabies-ready'));
});

test('levels follow the number of badges', () => {
  assert.deepEqual(level(new Set()), { number: 0, title: 'Newbie kitten' });
  assert.deepEqual(level(new Set(['a', 'b', 'c'])), { number: 3, title: 'Clever cat' });
});
