// The game side of the app: how much of this month's or this year's schedule
// is done, the on-time streak, badges and levels. No screen code here.

import { TYPES, recordsOf, nextDue } from './schedule.js';
import { catSchedule } from './calendar-plan.js';
import { addDays, addMonths, daysBetween } from './dates.js';

/** A dose counts as on time if it was given no more than this many days after it was due. */
export const ON_TIME_GRACE_DAYS = 7;

/** First and last day of the month or year that contains `today`. */
export function periodRange(today, period) {
  const [y, m] = today.split('-');
  if (period === 'year') return { start: `${y}-01-01`, end: `${y}-12-31` };
  const start = `${y}-${m}-01`;
  return { start, end: addDays(addMonths(start, 1), -1) };
}

/**
 * One dose type's progress for the period:
 *   done      doses given during the period
 *   dueNow    doses due today or overdue (whenever they fell due: they still need doing)
 *   comingUp  doses due later in the period
 */
export function typeProgress(cat, type, today, period) {
  const { start, end } = periodRange(today, period);
  const done = recordsOf(cat, type).filter((r) => r.date >= start && r.date <= end).length;
  const pending = catSchedule(cat, today).filter((item) => item.type === type);
  const dueNow = pending.filter((item) => item.date <= today).length;
  const comingUp = pending.filter((item) => item.date > today && item.date <= end).length;
  return { type, done, dueNow, comingUp, total: done + dueNow + comingUp, next: pending[0] ?? null };
}

/** Progress across all dose types, with an overall percentage (100 when nothing is due). */
export function catProgress(cat, today, period) {
  const byType = TYPES.map((type) => typeProgress(cat, type, today, period));
  const sum = (key) => byType.reduce((n, t) => n + t[key], 0);
  const done = sum('done');
  const dueNow = sum('dueNow');
  const comingUp = sum('comingUp');
  const total = done + dueNow + comingUp;
  return { byType, done, dueNow, comingUp, total, percent: total ? Math.round((done / total) * 100) : 100 };
}

/** 'alert' (something due now), 'clear' (nothing in the period), 'perfect' (all done) or 'ontrack'. */
export function mood({ dueNow, total, done }) {
  if (dueNow > 0) return 'alert';
  if (total === 0) return 'clear';
  if (done === total) return 'perfect';
  return 'ontrack';
}

/** Every recorded dose with whether it was given on time, newest first. */
export function doseTimeliness(cat) {
  const doses = [];
  for (const type of TYPES) {
    const records = recordsOf(cat, type);
    records.forEach((record, i) => {
      // When was this dose due, judging by the doses before it? A first-ever dose is never late.
      const due = nextDue({ ...cat, records: records.slice(0, i) }, type, record.date).date;
      doses.push({ type, date: record.date, onTime: daysBetween(due, record.date) <= ON_TIME_GRACE_DAYS });
    });
  }
  return doses.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** How many of the most recent doses in a row were given on time. */
export function onTimeStreak(cat) {
  let streak = 0;
  for (const dose of doseTimeliness(cat)) {
    if (!dose.onTime) break;
    streak++;
  }
  return streak;
}

export const BADGES = [
  { id: 'first-steps', emoji: '🐾', name: 'First steps', hint: 'Tick off a first dose' },
  { id: 'worm-warrior', emoji: '💊', name: 'Worm warrior', hint: 'Keep deworming up to date' },
  { id: 'shot-star', emoji: '💉', name: 'Shot star', hint: 'Finish the first set of 4-in-1 shots' },
  { id: 'rabies-ready', emoji: '🛡️', name: 'Rabies ready', hint: 'Keep the anti-rabies shot up to date' },
  { id: 'hot-streak', emoji: '🔥', name: 'Hot streak', hint: 'Give 3 doses on time in a row' },
  { id: 'purrfect-month', emoji: '🏆', name: 'Purr-fect month', hint: 'Finish everything due this month' },
];

const LEVELS = ['Newbie kitten', 'Curious cat', 'Curious cat', 'Clever cat', 'Clever cat', 'Top cat', 'Legendary cat'];

/** Which badges the cat has earned right now. */
export function earnedBadges(cat, today) {
  const has = (type) => recordsOf(cat, type).length > 0;
  const upToDate = (type) => has(type) && nextDue(cat, type, today).date >= today;
  const fvrcpNext = nextDue(cat, 'fvrcp', today);
  const month = catProgress(cat, today, 'month');
  const earned = {
    'first-steps': (cat.records ?? []).length > 0,
    'worm-warrior': upToDate('deworm'),
    'shot-star': has('fvrcp') && !String(fvrcpNext.label).startsWith('Shot'),
    'rabies-ready': upToDate('rabies'),
    'hot-streak': onTimeStreak(cat) >= 3,
    'purrfect-month': month.total > 0 && month.done === month.total,
  };
  return new Set(BADGES.filter((b) => earned[b.id]).map((b) => b.id));
}

/** Level 0–6 (one per badge) and its title. */
export function level(earned) {
  const n = earned.size;
  return { number: n, title: LEVELS[Math.min(n, LEVELS.length - 1)] };
}
