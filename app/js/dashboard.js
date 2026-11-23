// The gamified dashboard: progress rings, level, streak and badges.
// Builds HTML strings; app.js puts them on the page.

import { TYPES, TYPE_INFO } from './schedule.js';
import { formatDate } from './dates.js';
import { catProgress, mood, onTimeStreak, earnedBadges, level, BADGES } from './progress.js';

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * A ring chart (a pie with a hole): each segment's share of the whole, starting
 * at 12 o'clock and going clockwise, with a small gap between segments.
 * `segments`: [{ value, color, title }]. `center`: HTML shown in the hole.
 */
export function ring({ segments, size, stroke, label, center = '', animate = false }) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((n, s) => n + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  const gap = shown.length > 1 ? 2.5 : 0;
  let offset = 0;
  const arcs = total
    ? shown.map((s) => {
        const length = (s.value / total) * circumference;
        const dash = Math.max(length - gap, 0.01);
        const arc = `<circle class="seg" cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"><title>${esc(s.title)}</title></circle>`;
        offset += length;
        return arc;
      })
    : [`<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="${stroke}"/>`];
  return `
    <div class="ring-wrap${animate ? ' animate' : ''}" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">
        <g transform="rotate(-90 ${c} ${c})">${arcs.join('')}</g>
      </svg>
      <div class="ring-center">${center}</div>
    </div>`;
}

const RING_COLOR = { deworm: 'var(--ring-deworm)', fvrcp: 'var(--ring-fvrcp)', rabies: 'var(--ring-rabies)' };

function periodWords(period, today) {
  const [y, m] = today.split('-').map(Number);
  if (period === 'year') return { name: String(y), these: 'this year' };
  const month = new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1));
  return { name: month, these: 'this month' };
}

function typeRing(progress, period, animate) {
  const info = TYPE_INFO[progress.type];
  const { done, dueNow, comingUp, total } = progress;
  const words = period === 'year' ? 'this year' : 'this month';
  const label = total
    ? `${info.name} ${words}: ${done} done, ${dueNow} due now, ${comingUp} coming up`
    : `${info.name}: nothing due ${words}`;
  const legend = total
    ? [
        done ? `<span><i style="background:${RING_COLOR[progress.type]}"></i>${done} done</span>` : '',
        dueNow ? `<span><i style="background:var(--ring-due)"></i>${dueNow} due now</span>` : '',
        comingUp ? `<span><i style="background:var(--ring-track)"></i>${comingUp} to come</span>` : '',
      ].join('')
    : `<span>Nothing due</span>`;
  return `
    <li class="type-ring">
      ${ring({
        size: 92,
        stroke: 11,
        label,
        animate,
        segments: [
          { value: done, color: RING_COLOR[progress.type], title: `${done} done` },
          { value: dueNow, color: 'var(--ring-due)', title: `${dueNow} due now` },
          { value: comingUp, color: 'var(--ring-track)', title: `${comingUp} coming up` },
        ],
        center: total ? `<strong>${done}<small>/${total}</small></strong>` : `<span class="ring-zzz" aria-hidden="true">💤</span>`,
      })}
      <strong class="type-ring-name">${esc(info.name)}</strong>
      <span class="ring-legend">${legend}</span>
    </li>`;
}

function moodLine(progress, period, today, catName) {
  const words = periodWords(period, today);
  switch (mood(progress)) {
    case 'alert':
      return `<p class="mood alert">${plural(progress.dueNow, 'dose')} due now. Tick ${progress.dueNow === 1 ? 'it' : 'them'} off once done!</p>`;
    case 'clear':
      return `<p class="mood">Nothing due ${words.these}. Nap time 😴</p>`;
    case 'perfect':
      return `<p class="mood perfect">Purr-fect! Everything for ${esc(words.name)} is done 🎉</p>`;
    default: {
      const next = progress.byType.map((t) => t.next).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      return `<p class="mood">On track! Next for ${esc(catName)}: ${esc(TYPE_INFO[next.type].name.toLowerCase())} on ${esc(formatDate(next.date))}.</p>`;
    }
  }
}

/** The whole dashboard card for one cat. */
export function dashboardCard(cat, today, { period = 'month', animate = false } = {}) {
  const progress = catProgress(cat, today, period);
  const earned = earnedBadges(cat, today);
  const lvl = level(earned);
  const streak = onTimeStreak(cat);
  const words = periodWords(period, today);
  const pressed = (p) => (p === period ? 'true' : 'false');

  return `
    <section class="card dash" aria-label="${esc(cat.name)}’s progress">
      <div class="dash-head">
        <h2>Progress</h2>
        <div class="seg-control" role="group" aria-label="Show progress for">
          <button type="button" data-action="period" data-period="month" aria-pressed="${pressed('month')}">This month</button>
          <button type="button" data-action="period" data-period="year" aria-pressed="${pressed('year')}">This year</button>
        </div>
      </div>

      <div class="dash-top">
        ${ring({
          size: 128,
          stroke: 14,
          animate,
          label: `${words.name}: ${progress.done} of ${progress.total} doses done`,
          segments: [
            { value: progress.done, color: 'var(--ring-score)', title: `${progress.done} done` },
            { value: progress.total - progress.done, color: 'var(--ring-track)', title: `${progress.total - progress.done} to do` },
          ],
          center: `<strong class="score">${progress.percent}%</strong><small>${progress.total ? `${progress.done} of ${progress.total} done` : 'all clear'}</small>`,
        })}
        <div class="dash-summary">
          <p class="level"><span class="level-pill">Lv ${lvl.number}</span> ${esc(lvl.title)}</p>
          ${moodLine(progress, period, today, cat.name)}
          <p class="streak">${streak ? `🔥 <strong>${streak}</strong> on time in a row` : '<span class="muted">Give doses on time to start a streak 🔥</span>'}</p>
        </div>
      </div>

      <h3 class="dash-sub">${esc(words.name)} by type</h3>
      <ul class="type-rings">${TYPES.map((type) => typeRing(progress.byType.find((t) => t.type === type), period, animate)).join('')}</ul>

      <div class="badges">
        <div class="dash-sub-row"><h3 class="dash-sub">Badges</h3><span class="muted small">${earned.size} of ${BADGES.length}</span></div>
        <ul class="badge-grid">
          ${BADGES.map((b) => {
            const has = earned.has(b.id);
            return `<li class="badge-tile${has ? ' earned' : ''}" title="${esc(has ? b.name : b.hint)}">
              <span class="badge-emoji" aria-hidden="true">${b.emoji}</span>
              <span class="badge-name">${esc(b.name)}</span>
              <span class="badge-state">${has ? 'Earned' : esc(b.hint)}</span>
            </li>`;
          }).join('')}
        </ul>
      </div>
    </section>`;
}

/** This year's progress as a ring around the cat's picture, for the home screen. */
export function avatarRing(cat, today, avatarHtml) {
  const year = catProgress(cat, today, 'year');
  const lvl = level(earnedBadges(cat, today));
  return `
    <span class="avatar-ring">
      ${ring({
        size: 92,
        stroke: 6,
        label: `${cat.name}, this year: ${year.done} of ${year.total} doses done`,
        segments: [
          { value: year.done, color: 'var(--ring-score)', title: `${year.done} done this year` },
          { value: year.total - year.done, color: 'var(--ring-track)', title: `${year.total - year.done} to do this year` },
        ],
        center: avatarHtml,
      })}
      <span class="level-pill small" title="${esc(lvl.title)}">Lv ${lvl.number}</span>
    </span>`;
}
