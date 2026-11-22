// Default deworming and vaccine schedules, based on common vet guidelines.
//
// Each rule looks at the cat's birthday and the doses already given (oldest
// first) and returns when the next one is due. A "next date from the vet" on
// the latest record always wins over the default rule.

import { addDays, addMonths, addYears, daysBetween } from './dates.js';

export const TYPES = ['deworm', 'fvrcp', 'rabies'];

export const TYPE_INFO = {
  deworm: {
    name: 'Deworming',
    about: 'Treats and prevents intestinal worms.',
  },
  fvrcp: {
    name: '4-in-1 vaccine',
    about: 'Protects against cat flu viruses, panleukopenia and chlamydia.',
  },
  rabies: {
    name: 'Anti-rabies vaccine',
    about: 'Protects against rabies. Many places require it every year by law.',
  },
};

/** Items due within this many days count as "soon". */
export const SOON_DAYS = 14;

const WEEKS = 7;
const KITTEN_SERIES_END = 16 * WEEKS;

const RULES = {
  deworm(cat, doses) {
    if (doses.length === 0) {
      return {
        date: addDays(cat.birthDate, 2 * WEEKS),
        label: null,
        reason: 'First deworming at 2 weeks old',
        catchUpReason: 'No deworming recorded yet',
      };
    }
    const last = doses.at(-1).date;
    if (daysBetween(cat.birthDate, last) < 8 * WEEKS) {
      return { date: addDays(last, 2 * WEEKS), label: null, reason: 'Every 2 weeks until 8 weeks old' };
    }
    if (last < addMonths(cat.birthDate, 6)) {
      return { date: addMonths(last, 1), label: null, reason: 'Every month until 6 months old' };
    }
    if (cat.outdoor) {
      return { date: addMonths(last, 1), label: null, reason: 'Every month for cats that go outside' };
    }
    return { date: addMonths(last, 3), label: null, reason: 'Every 3 months for adult cats' };
  },

  fvrcp(cat, doses) {
    if (doses.length === 0) {
      return {
        date: addDays(cat.birthDate, 8 * WEEKS),
        label: 'Shot 1',
        reason: 'First shot at 6–8 weeks old',
        catchUpReason: 'No 4-in-1 shot recorded yet',
      };
    }
    const ageAt = (dose) => daysBetween(cat.birthDate, dose.date);
    const last = doses.at(-1).date;
    // The first set is done once there are 2+ shots and one was given at 16 weeks or older.
    const firstSetDoneAt = doses.findIndex((dose, i) => i >= 1 && ageAt(dose) >= KITTEN_SERIES_END);
    if (firstSetDoneAt === -1) {
      const startedLate = ageAt(doses[0]) >= KITTEN_SERIES_END;
      return {
        date: addDays(last, 4 * WEEKS),
        label: `Shot ${doses.length + 1}`,
        reason: startedLate
          ? 'Second shot 4 weeks after the first (first shot was after 16 weeks old)'
          : 'Every 4 weeks until 16 weeks old',
      };
    }
    if (firstSetDoneAt === doses.length - 1) {
      return { date: addYears(last, 1), label: '1-year booster', reason: '1 year after the first set of shots' };
    }
    return { date: addYears(last, 1), label: 'Yearly booster', reason: 'Every year' };
  },

  rabies(cat, doses) {
    if (doses.length === 0) {
      return {
        date: addDays(cat.birthDate, 12 * WEEKS),
        label: 'First shot',
        reason: 'First shot at 12–16 weeks old',
        catchUpReason: 'No anti-rabies shot recorded yet',
      };
    }
    const last = doses.at(-1).date;
    if (doses.length === 1) {
      return { date: addYears(last, 1), label: '1-year booster', reason: '1 year after the first shot' };
    }
    return { date: addYears(last, 1), label: 'Yearly booster', reason: 'Every year' };
  },
};

/** Records of one type, oldest first. */
export function recordsOf(cat, type) {
  return (cat.records ?? [])
    .filter((record) => record.type === type)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * When the next dose of `type` is due for `cat`.
 * Returns { date, label, reason, fromVet, catchUp }.
 * catchUp is true when nothing is recorded and the first dose is already past
 * its usual age: the date is then today, not years ago.
 */
export function nextDue(cat, type, today) {
  const doses = recordsOf(cat, type);
  const { catchUpReason, ...rule } = RULES[type](cat, doses);
  const latest = doses.at(-1);
  if (latest?.nextDue) {
    return { ...rule, date: latest.nextDue, reason: 'Date set by your vet', fromVet: true, catchUp: false };
  }
  if (doses.length === 0 && rule.date < today) {
    return { ...rule, date: today, reason: catchUpReason, fromVet: false, catchUp: true };
  }
  return { ...rule, fromVet: false, catchUp: false };
}

export function dueStatus(date, today) {
  const days = daysBetween(today, date);
  if (days < 0) return { status: 'overdue', days };
  if (days === 0) return { status: 'today', days };
  if (days <= SOON_DAYS) return { status: 'soon', days };
  return { status: 'later', days };
}

/**
 * The next few due dates for one type, assuming each is done on its due date
 * (or today, if it is already overdue). The first item is always nextDue().
 */
export function upcoming(cat, type, today, { months = 18, max = 12 } = {}) {
  const horizon = addMonths(today, months);
  const records = [...(cat.records ?? [])];
  const items = [];
  while (items.length < max) {
    const item = nextDue({ ...cat, records }, type, today);
    if (items.length > 0 && item.date > horizon) break;
    items.push(item);
    records.push({ type, date: item.date < today ? today : item.date });
  }
  return items;
}

/** The dose label ("Shot 2", "Yearly booster"…) for each recorded dose, oldest first. */
export function doseLabels(cat, type) {
  const doses = recordsOf(cat, type);
  return doses.map((dose, i) => ({ record: dose, label: RULES[type](cat, doses.slice(0, i)).label }));
}

/** Everything due within `withinDays` (including overdue) across all cats, soonest first. */
export function dueList(cats, today, withinDays = 30) {
  const items = [];
  for (const cat of cats) {
    for (const type of TYPES) {
      const next = nextDue(cat, type, today);
      const status = dueStatus(next.date, today);
      if (status.days <= withinDays) items.push({ cat, type, ...next, ...status });
    }
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cat.name.localeCompare(b.cat.name)));
}

/** The most urgent next item for a cat. */
export function mostUrgent(cat, today) {
  return TYPES.map((type) => ({ type, ...nextDue(cat, type, today) }))
    .map((item) => ({ ...item, ...dueStatus(item.date, today) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0];
}
