// Works out which Google Calendar events should exist for a set of cats, and
// what to create, change or delete to get there. No network code here.

import { TYPES, TYPE_INFO, upcoming, recordsOf } from './schedule.js';
import { addMonths } from './dates.js';

/** Private event properties that tie a calendar event to a scheduled item. */
export const KEY_PROP = 'catReminderKey';
export const FINGERPRINT_PROP = 'catReminderFp';

/** Reminder events start at 9:00 in the person's time zone. */
const EVENT_START = '09:00:00';
const EVENT_END = '09:30:00';
const ONE_DAY = 24 * 60;

/**
 * One cat's generated schedule for the next `months` months: every upcoming
 * dose of every type, soonest first. Only the first item of each type
 * (`isNext`) can be ticked; the rest assume each dose is done on time.
 * Each item has a stable `key`: cat, type and which dose it is (1st, 2nd…).
 */
export function catSchedule(cat, today, { months = 12 } = {}) {
  const horizon = addMonths(today, months);
  const items = [];
  for (const type of TYPES) {
    const given = recordsOf(cat, type).length;
    upcoming(cat, type, today, { months, max: 24 }).forEach((item, i) => {
      if (i > 0 && item.date > horizon) return;
      const dose = given + i + 1;
      items.push({ ...item, key: `${cat.id}.${type}.${dose}`, catId: cat.id, catName: cat.name, type, dose, isNext: i === 0 });
    });
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : TYPES.indexOf(a.type) - TYPES.indexOf(b.type)));
}

/** FNV-1a: a short, stable fingerprint so unchanged events are left alone. */
function fingerprint(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** The Google Calendar event for one scheduled item. */
export function eventFor(item, { timeZone, appUrl }) {
  const what = `${TYPE_INFO[item.type].name}${item.label ? ` (${item.label})` : ''}`;
  const summary = `🐾 ${item.catName}: ${what}`;
  const description = [`${item.reason}.`, '', 'Tick it off in Cat Reminders once it’s done:', appUrl].join('\n');
  return {
    summary,
    description,
    start: { dateTime: `${item.date}T${EVENT_START}`, timeZone },
    end: { dateTime: `${item.date}T${EVENT_END}`, timeZone },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: ONE_DAY },
        { method: 'popup', minutes: 0 },
      ],
    },
    transparency: 'transparent',
    extendedProperties: {
      private: {
        [KEY_PROP]: item.key,
        [FINGERPRINT_PROP]: fingerprint([item.date, summary, description, timeZone].join('|')),
      },
    },
  };
}

/** Every event that should be in the calendar, by key. */
export function desiredEvents(cats, today, options) {
  const events = new Map();
  for (const cat of cats) {
    for (const item of catSchedule(cat, today)) events.set(item.key, eventFor(item, options));
  }
  return events;
}

/**
 * Compares the events that should exist with those already in the calendar.
 * Events without our key (added by hand) are never touched.
 */
export function planSync(desired, existing) {
  const toDelete = [];
  const toUpdate = [];
  const found = new Set();
  for (const event of existing) {
    const props = event.extendedProperties?.private ?? {};
    const key = props[KEY_PROP];
    if (!key) continue;
    if (!desired.has(key) || found.has(key)) {
      toDelete.push(event.id);
      continue;
    }
    found.add(key);
    const body = desired.get(key);
    if (props[FINGERPRINT_PROP] !== body.extendedProperties.private[FINGERPRINT_PROP]) toUpdate.push({ id: event.id, body });
  }
  const toCreate = [...desired].filter(([key]) => !found.has(key)).map(([, body]) => body);
  return { toCreate, toUpdate, toDelete };
}
