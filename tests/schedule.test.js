import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDue, dueStatus, upcoming, doseLabels, dueList, mostUrgent } from '../app/js/schedule.js';

const kitten = (records = [], extra = {}) => ({ name: 'Mochi', birthDate: '2026-01-01', outdoor: false, records, ...extra });
const rec = (type, date, extra = {}) => ({ type, date, ...extra });
const dates = (items) => items.map((item) => item.date);

test('a newborn kitten gets its first doses at 2, 8 and 12 weeks', () => {
  const cat = kitten();
  assert.equal(nextDue(cat, 'deworm', '2026-01-01').date, '2026-01-15');
  assert.equal(nextDue(cat, 'fvrcp', '2026-01-01').date, '2026-02-26');
  assert.equal(nextDue(cat, 'rabies', '2026-01-01').date, '2026-03-26');
});

test('deworming: every 2 weeks until 8 weeks, monthly until 6 months, then every 3 months', () => {
  const today = '2026-01-01';
  assert.equal(nextDue(kitten([rec('deworm', '2026-02-12')]), 'deworm', today).date, '2026-02-26');
  assert.equal(nextDue(kitten([rec('deworm', '2026-02-26')]), 'deworm', today).date, '2026-03-26');
  assert.equal(nextDue(kitten([rec('deworm', '2026-06-26')]), 'deworm', today).date, '2026-07-26');
  assert.equal(nextDue(kitten([rec('deworm', '2026-07-26')]), 'deworm', today).date, '2026-10-26');
});

test('deworming: adult cats that go outside are dewormed monthly', () => {
  const cat = kitten([rec('deworm', '2026-07-26')], { outdoor: true });
  const next = nextDue(cat, 'deworm', '2026-08-01');
  assert.equal(next.date, '2026-08-26');
  assert.match(next.reason, /go outside/);
});

test('4-in-1: shots every 4 weeks until 16 weeks, then a 1-year booster, then yearly', () => {
  const today = '2026-01-01';
  const shots = [rec('fvrcp', '2026-02-26'), rec('fvrcp', '2026-03-26')];
  assert.deepEqual(
    [nextDue(kitten(shots), 'fvrcp', today).date, nextDue(kitten(shots), 'fvrcp', today).label],
    ['2026-04-23', 'Shot 3'],
  );
  shots.push(rec('fvrcp', '2026-04-23'));
  assert.equal(nextDue(kitten(shots), 'fvrcp', today).date, '2027-04-23');
  assert.equal(nextDue(kitten(shots), 'fvrcp', today).label, '1-year booster');
  shots.push(rec('fvrcp', '2027-04-20'));
  assert.equal(nextDue(kitten(shots), 'fvrcp', today).date, '2028-04-20');
  assert.equal(nextDue(kitten(shots), 'fvrcp', today).label, 'Yearly booster');
});

test('4-in-1: a cat first vaccinated after 16 weeks gets 2 shots 4 weeks apart', () => {
  const adult = { name: 'Luna', birthDate: '2024-05-10', records: [rec('fvrcp', '2026-01-10')] };
  const second = nextDue(adult, 'fvrcp', '2026-01-10');
  assert.equal(second.date, '2026-02-07');
  assert.equal(second.label, 'Shot 2');
  adult.records.push(rec('fvrcp', '2026-02-07'));
  const booster = nextDue(adult, 'fvrcp', '2026-02-07');
  assert.equal(booster.date, '2027-02-07');
  assert.equal(booster.label, '1-year booster');
});

test('anti-rabies: first shot at 12 weeks, booster 1 year later, then yearly', () => {
  const today = '2026-01-01';
  assert.equal(nextDue(kitten(), 'rabies', today).label, 'First shot');
  const one = kitten([rec('rabies', '2026-04-01')]);
  assert.equal(nextDue(one, 'rabies', today).date, '2027-04-01');
  assert.equal(nextDue(one, 'rabies', today).label, '1-year booster');
  const two = kitten([rec('rabies', '2026-04-01'), rec('rabies', '2027-04-03')]);
  assert.equal(nextDue(two, 'rabies', today).date, '2028-04-03');
  assert.equal(nextDue(two, 'rabies', today).label, 'Yearly booster');
});

test("the vet's next date on the latest record replaces the default", () => {
  const cat = kitten([rec('rabies', '2026-04-01', { nextDue: '2026-12-01' })]);
  const next = nextDue(cat, 'rabies', '2026-05-01');
  assert.equal(next.date, '2026-12-01');
  assert.equal(next.fromVet, true);

  cat.records.push(rec('rabies', '2026-12-01'));
  const after = nextDue(cat, 'rabies', '2026-12-01');
  assert.equal(after.date, '2027-12-01');
  assert.equal(after.fromVet, false);
});

test('records are used in date order, whatever order they were added in', () => {
  const cat = kitten([rec('deworm', '2026-07-26'), rec('deworm', '2026-02-12')]);
  assert.equal(nextDue(cat, 'deworm', '2026-08-01').date, '2026-10-26');
});

test('an adult with nothing recorded is due today, not years ago', () => {
  const adult = { name: 'Tiger', birthDate: '2020-03-15', records: [] };
  for (const type of ['deworm', 'fvrcp', 'rabies']) {
    const next = nextDue(adult, type, '2026-11-22');
    assert.equal(next.date, '2026-11-22');
    assert.equal(next.catchUp, true);
  }
});

test('records for other types do not affect each other', () => {
  const cat = kitten([rec('deworm', '2026-02-26')]);
  assert.equal(nextDue(cat, 'fvrcp', '2026-01-01').date, '2026-02-26');
  assert.equal(nextDue(cat, 'rabies', '2026-01-01').date, '2026-03-26');
});

test('dueStatus sorts dates into overdue, today, soon and later', () => {
  assert.deepEqual(dueStatus('2026-11-20', '2026-11-22'), { status: 'overdue', days: -2 });
  assert.deepEqual(dueStatus('2026-11-22', '2026-11-22'), { status: 'today', days: 0 });
  assert.deepEqual(dueStatus('2026-12-06', '2026-11-22'), { status: 'soon', days: 14 });
  assert.deepEqual(dueStatus('2026-12-07', '2026-11-22'), { status: 'later', days: 15 });
});

test("upcoming lays out a newborn kitten's full schedule", () => {
  const cat = kitten();
  assert.deepEqual(dates(upcoming(cat, 'deworm', '2026-01-01')), [
    '2026-01-15', '2026-01-29', '2026-02-12', '2026-02-26', // every 2 weeks to 8 weeks
    '2026-03-26', '2026-04-26', '2026-05-26', '2026-06-26', '2026-07-26', // monthly to 6 months
    '2026-10-26', '2027-01-26', '2027-04-26', // every 3 months
  ]);
  assert.deepEqual(
    upcoming(cat, 'fvrcp', '2026-01-01').map((item) => [item.date, item.label]),
    [['2026-02-26', 'Shot 1'], ['2026-03-26', 'Shot 2'], ['2026-04-23', 'Shot 3'], ['2027-04-23', '1-year booster']],
  );
  assert.deepEqual(dates(upcoming(cat, 'rabies', '2026-01-01')), ['2026-03-26', '2027-03-26']);
});

test('upcoming plans from today when a dose is overdue', () => {
  const cat = kitten([rec('deworm', '2026-08-01')]);
  assert.deepEqual(dates(upcoming(cat, 'deworm', '2026-12-01', { months: 6 })), ['2026-11-01', '2027-03-01', '2027-06-01']);
});

test('doseLabels names each recorded shot', () => {
  const cat = kitten([rec('fvrcp', '2026-02-26'), rec('fvrcp', '2026-03-26'), rec('fvrcp', '2026-04-23'), rec('fvrcp', '2027-04-23')]);
  assert.deepEqual(doseLabels(cat, 'fvrcp').map((d) => d.label), ['Shot 1', 'Shot 2', 'Shot 3', '1-year booster']);
});

test('dueList gathers what is due across cats, soonest first', () => {
  const mochi = kitten([rec('deworm', '2026-11-01'), rec('fvrcp', '2026-11-01'), rec('rabies', '2026-11-01')]);
  const luna = { name: 'Luna', birthDate: '2024-05-10', records: [rec('deworm', '2026-09-01')] };
  const list = dueList([mochi, luna], '2026-11-22', 30);
  assert.deepEqual(
    list.map((item) => [item.cat.name, item.type, item.date]),
    [
      ['Luna', 'fvrcp', '2026-11-22'], // nothing recorded: due now
      ['Luna', 'rabies', '2026-11-22'],
      ['Mochi', 'fvrcp', '2026-11-29'], // second shot, 4 weeks after the first
      ['Luna', 'deworm', '2026-12-01'], // 3 months after the last one
      // Mochi's deworming (Feb 2027) and rabies booster (Nov 2027) are more than 30 days away.
    ],
  );
});

test('mostUrgent picks the earliest next item', () => {
  const cat = kitten([rec('deworm', '2026-11-01'), rec('fvrcp', '2026-11-01'), rec('rabies', '2026-11-01')]);
  const item = mostUrgent(cat, '2026-11-22');
  assert.equal(item.type, 'fvrcp');
  assert.equal(item.date, '2026-11-29');
});
