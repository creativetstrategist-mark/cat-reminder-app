// Date helpers. Every date in the app is a plain "YYYY-MM-DD" string, and all
// arithmetic is done in UTC so time zones and daylight saving never shift a day.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isValidDate(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's date on this device, in local time. */
export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, days) {
  return fromUTC(toUTC(iso) + days * DAY_MS);
}

/** Adds calendar months. Jan 31 + 1 month is the last day of February. */
export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromUTC(Date.UTC(year, month, Math.min(d, lastDay)));
}

export function addYears(iso, years) {
  return addMonths(iso, years * 12);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from, to) {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

/** Whole calendar months from `from` to `to`. */
export function monthsBetween(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

export function formatDate(iso) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(toUTC(iso));
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function ageText(birthDate, today) {
  const days = daysBetween(birthDate, today);
  if (days < 0) return 'Not born yet';
  if (days < 7) return `${plural(days, 'day')} old`;
  if (days < 16 * 7) return `${plural(Math.floor(days / 7), 'week')} old`;
  const months = monthsBetween(birthDate, today);
  if (months < 12) return `${plural(months, 'month')} old`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years < 2 && rest > 0) return `${plural(years, 'year')}, ${plural(rest, 'month')} old`;
  return `${plural(years, 'year')} old`;
}
