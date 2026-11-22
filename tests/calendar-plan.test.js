import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catSchedule, eventFor, desiredEvents, planSync, KEY_PROP, FINGERPRINT_PROP } from '../app/js/calendar-plan.js';

const opts = { timeZone: 'Asia/Singapore', appUrl: 'https://example.github.io/cat-reminder-app/' };
const rec = (type, date) => ({ id: `${type}-${date}`, type, date });
const kitten = (records = []) => ({ id: 'mochi', name: 'Mochi', birthDate: '2026-01-01', outdoor: false, records });

test('catSchedule lists every upcoming dose, soonest first, with stable keys', () => {
  const items = catSchedule(kitten(), '2026-01-01');
  assert.deepEqual(
    items.slice(0, 6).map((i) => [i.date, i.type, i.dose]),
    [
      ['2026-01-15', 'deworm', 1],
      ['2026-01-29', 'deworm', 2],
      ['2026-02-12', 'deworm', 3],
      ['2026-02-26', 'deworm', 4],
      ['2026-02-26', 'fvrcp', 1],
      ['2026-03-26', 'deworm', 5],
    ],
  );
  assert.equal(items[0].key, 'mochi.deworm.1');
  // Nothing more than 12 months out, apart from each type's next dose.
  assert.ok(items.every((i) => i.isNext || i.date <= '2027-01-01'));
});

test('only the next dose of each type can be ticked', () => {
  const next = catSchedule(kitten(), '2026-01-01').filter((i) => i.isNext);
  assert.deepEqual(next.map((i) => [i.type, i.dose]), [['deworm', 1], ['fvrcp', 1], ['rabies', 1]]);
});

test('dose numbers carry on from what has been recorded', () => {
  const cat = kitten([rec('deworm', '2026-01-15'), rec('deworm', '2026-01-29')]);
  const first = catSchedule(cat, '2026-02-01').find((i) => i.type === 'deworm');
  assert.equal(first.key, 'mochi.deworm.3');
  assert.equal(first.date, '2026-02-12');
});

test('eventFor makes a 9am event with reminders the day before and on the day', () => {
  const [item] = catSchedule(kitten(), '2026-01-01');
  const event = eventFor(item, opts);
  assert.equal(event.summary, '🐾 Mochi: Deworming');
  assert.deepEqual(event.start, { dateTime: '2026-01-15T09:00:00', timeZone: 'Asia/Singapore' });
  assert.deepEqual(event.reminders.overrides.map((r) => r.minutes), [1440, 0]);
  assert.equal(event.extendedProperties.private[KEY_PROP], 'mochi.deworm.1');
  assert.match(event.description, /example\.github\.io/);

  const shot = catSchedule(kitten(), '2026-01-01').find((i) => i.type === 'fvrcp');
  assert.equal(eventFor(shot, opts).summary, '🐾 Mochi: 4-in-1 vaccine (Shot 1)');
});

test('the fingerprint changes when the date moves and not otherwise', () => {
  const fp = (cat, today) => desiredEvents([cat], today, opts).get('mochi.fvrcp.2').extendedProperties.private[FINGERPRINT_PROP];
  const onTime = kitten([rec('fvrcp', '2026-02-26')]);
  const late = kitten([rec('fvrcp', '2026-03-05')]);
  assert.equal(fp(onTime, '2026-03-01'), fp(onTime, '2026-03-02'));
  assert.notEqual(fp(onTime, '2026-03-01'), fp(late, '2026-03-06'));
});

const existingFrom = (desired) => [...desired].map(([key, body], i) => ({ id: `ev${i}`, extendedProperties: body.extendedProperties, key }));

test('planSync creates everything for a fresh calendar', () => {
  const desired = desiredEvents([kitten()], '2026-01-01', opts);
  const plan = planSync(desired, []);
  assert.equal(plan.toCreate.length, desired.size);
  assert.deepEqual([plan.toUpdate.length, plan.toDelete.length], [0, 0]);
});

test('planSync does nothing when the calendar is already up to date', () => {
  const desired = desiredEvents([kitten()], '2026-01-01', opts);
  assert.deepEqual(planSync(desired, existingFrom(desired)), { toCreate: [], toUpdate: [], toDelete: [] });
});

test('ticking a dose removes its event and moves the later ones', () => {
  const before = desiredEvents([kitten([rec('fvrcp', '2026-02-26')])], '2026-02-26', opts);
  const existing = existingFrom(before);
  // Shot 2 was given a week late, so shot 3 and the booster move too.
  const after = desiredEvents([kitten([rec('fvrcp', '2026-02-26'), rec('fvrcp', '2026-04-02')])], '2026-04-02', opts);
  const plan = planSync(after, existing);
  const idOf = (key) => existing.find((e) => e.key === key).id;
  assert.ok(plan.toDelete.includes(idOf('mochi.fvrcp.2')));
  assert.ok(plan.toUpdate.some((u) => u.id === idOf('mochi.fvrcp.3')));
  assert.equal(plan.toCreate.filter((b) => b.extendedProperties.private[KEY_PROP].startsWith('mochi.fvrcp')).length, 0);
});

test('deleting a cat removes all its events', () => {
  const luna = { id: 'luna', name: 'Luna', birthDate: '2024-05-10', records: [] };
  const existing = existingFrom(desiredEvents([kitten(), luna], '2026-01-01', opts));
  const plan = planSync(desiredEvents([kitten()], '2026-01-01', opts), existing);
  const lunaIds = existing.filter((e) => e.key.startsWith('luna.')).map((e) => e.id);
  assert.deepEqual(plan.toDelete.sort(), lunaIds.sort());
});

test('planSync leaves hand-made events alone and removes duplicates', () => {
  const desired = desiredEvents([kitten()], '2026-01-01', opts);
  const existing = [...existingFrom(desired), { id: 'mine', extendedProperties: {} }, { id: 'dup', extendedProperties: existingFrom(desired)[0].extendedProperties }];
  const plan = planSync(desired, existing);
  assert.deepEqual(plan.toDelete, ['dup']);
  assert.equal(plan.toCreate.length, 0);
});
