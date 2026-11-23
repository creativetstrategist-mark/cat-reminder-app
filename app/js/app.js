import { TYPES, TYPE_INFO, nextDue, dueStatus, doseLabels } from './schedule.js';
import { catSchedule } from './calendar-plan.js';
import { todayISO, formatDate, ageText, isValidDate, daysBetween } from './dates.js';
import { COATS, exportBackup, parseBackup, newId } from './store.js';
import { catFace, coatFor, COAT_NAMES, icon, paw } from './art.js';
import * as cloud from './cloud.js';
import * as calendar from './calendar.js';
import { photoFromFile } from './photo.js';
import { dashboardCard, avatarRing } from './dashboard.js';
import { earnedBadges, BADGES } from './progress.js';
import { confetti } from './confetti.js';

const state = {
  authReady: false, // has Firebase said whether someone is signed in?
  user: null,
  cats: [],
  catsLoaded: false,
  catsFromServer: false, // true once the server has confirmed the list; only then is it safe to sync the calendar
  loadError: '',
  settings: { calendarId: '', calendarEmail: '' },
  authMode: 'signin', // or 'signup'
  cal: { status: 'idle', message: '', lastSynced: 0 }, // status: idle | syncing | error
  photos: new Map(), // cat id → photo (data: URL)
  period: 'month', // dashboard: 'month' or 'year'
  animateRings: false, // play the ring animation on the next render only
};
const closedDetails = new Set();
let unsubscribers = [];

const app = document.getElementById('app');
const accountLink = document.getElementById('account-link');
const toast = document.getElementById('toast');
const toastText = toast.querySelector('.toast-text');
const toastButton = toast.querySelector('.toast-action');
const catDialog = document.getElementById('cat-dialog');
const catForm = document.getElementById('cat-form');
const recordDialog = document.getElementById('record-dialog');
const recordForm = document.getElementById('record-form');
const importInput = document.getElementById('import-file');
const photoInput = document.getElementById('photo-file');
// Read inputs through .elements: catForm.name would be the form's own name, not the input.
const catFields = catForm.elements;
const recordFields = recordForm.elements;

document.getElementById('coat-options').innerHTML = COATS.map(
  (coat) => `<label class="coat"><input type="radio" name="coat" value="${coat}">${catFace(coat, { size: 44 })}<span>${COAT_NAMES[coat]}</span></label>`,
).join('');

// ---------- helpers ----------

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const findCat = (id) => state.cats.find((cat) => cat.id === id);
const byName = (a, b) => a.name.localeCompare(b.name);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const catLink = (cat) => `#/cat/${encodeURIComponent(cat.id)}`;

/** The cat's photo if it has one, otherwise its cartoon face. */
function catAvatar(cat, size, { label = '' } = {}) {
  const photo = state.photos.get(cat.id);
  if (photo) {
    return `<img class="cat-photo" src="${esc(photo)}" width="${size}" height="${size}" alt="${esc(label)}"${label ? '' : ' aria-hidden="true"'}>`;
  }
  return catFace(coatFor(cat), { size, label });
}
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const appUrl = () => location.origin + location.pathname;

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function whenText({ status, days, catchUp }) {
  if (catchUp) return 'Due now';
  if (status === 'overdue') return `${plural(-days, 'day')} overdue`;
  if (status === 'today') return 'Due today';
  if (days === 1) return 'Tomorrow';
  if (days < 14) return `In ${days} days`;
  if (days < 60) return `In ${Math.round(days / 7)} weeks`;
  return `In ${Math.round(days / 30.44)} months`;
}

function monthTitle(iso) {
  const [y, m] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1));
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning!' : hour < 18 ? 'Good afternoon!' : 'Good evening!';
}

let toastTimer;
let toastCallback = null;
function notify(message, { action = '', onAction = null } = {}) {
  toastText.textContent = message;
  toastButton.textContent = action;
  toastButton.hidden = !action;
  toastCallback = onAction;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 7000 : 5000);
}
function hideToast() {
  toast.hidden = true;
  toastCallback = null;
}
toastButton.addEventListener('click', () => {
  const callback = toastCallback;
  hideToast();
  callback?.();
});

// ---------- saving ----------
// Changes show straight away; Firebase saves them in the background (queued
// while offline) and the live update confirms them. The calendar follows.

function commitCat(cat) {
  const exists = state.cats.some((c) => c.id === cat.id);
  state.cats = exists ? state.cats.map((c) => (c.id === cat.id ? cat : c)) : [...state.cats, cat];
  render();
  cloud.saveCat(state.user.uid, cat).catch((error) => notify(`Couldn’t save ${cat.name}. ${cloud.friendlyError(error)}`));
  scheduleSync();
}

function dropCat(cat) {
  state.cats = state.cats.filter((c) => c.id !== cat.id);
  render();
  cloud.removeCat(state.user.uid, cat.id).catch((error) => notify(`Couldn’t delete ${cat.name}. ${cloud.friendlyError(error)}`));
  if (state.photos.delete(cat.id)) cloud.removePhoto(state.user.uid, cat.id).catch(() => {});
  scheduleSync();
}

// ---------- Google Calendar ----------

const calConnected = () => calendar.isAvailable && Boolean(state.settings.calendarId);
let syncTimer;
let syncing = false;
let syncAgain = false;

function setCal(status, message = '') {
  state.cal = { ...state.cal, status, message };
  paintCalendar();
}

/** Syncs soon, once it is safe: connected, signed in to Google, and the cat list confirmed by the server. */
function scheduleSync(delay = 600) {
  if (!state.user || !calConnected() || !state.catsFromServer) return;
  if (!calendar.hasToken()) return paintCalendar();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}

async function runSync() {
  if (syncing) {
    syncAgain = true;
    return;
  }
  if (!calConnected() || !calendar.hasToken() || !state.catsFromServer) return paintCalendar();
  syncing = true;
  setCal('syncing');
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await calendar.syncCalendar(state.settings.calendarId, state.cats, { today: todayISO(), timeZone: timeZone(), appUrl: appUrl() });
        break;
      } catch (error) {
        if (error.status !== 404 || attempt > 0) throw error;
        // The calendar was deleted in Google Calendar: make a new one and try again.
        const calendarId = await calendar.createCalendar(timeZone());
        state.settings = { ...state.settings, calendarId };
        await cloud.saveSettings(state.user.uid, state.settings);
      }
    }
    state.cal.lastSynced = Date.now();
    setCal('idle');
  } catch (error) {
    setCal('error', calendar.friendlyCalendarError(error));
  } finally {
    syncing = false;
    if (syncAgain) {
      syncAgain = false;
      scheduleSync(0);
    }
  }
}

/**
 * Call at the start of any tap that changes the schedule. If Google's
 * permission has run out, this asks again while the tap still counts, which
 * is the only time browsers let the Google window open.
 */
function renewCalendarInTap() {
  if (!calConnected() || calendar.hasToken()) return;
  calendar
    .requestAccess({ hint: state.settings.calendarEmail })
    .then(() => {
      setCal('idle');
      scheduleSync(0);
    })
    .catch((error) => setCal(error.message ? 'error' : 'idle', calendar.friendlyCalendarError(error)));
}

async function connectCalendar() {
  const firstTime = !state.settings.calendarId;
  const asking = calendar.requestAccess({ consent: firstTime, hint: state.settings.calendarEmail });
  setCal('syncing');
  try {
    await asking;
    const email = (await calendar.accountEmail()) || state.settings.calendarEmail;
    let calendarId = state.settings.calendarId;
    if (!calendarId || !(await calendar.calendarExists(calendarId))) calendarId = await calendar.createCalendar(timeZone());
    state.settings = { calendarId, calendarEmail: email };
    await cloud.saveSettings(state.user.uid, state.settings);
    await runSync();
    if (state.cal.status === 'idle') {
      notify(firstTime ? 'Google Calendar connected! Each dose now has a reminder there.' : 'Google Calendar is up to date.');
    }
  } catch (error) {
    setCal(error.message ? 'error' : 'idle', calendar.friendlyCalendarError(error));
  }
}

function updateCalendarNow() {
  if (calendar.hasToken()) return runSync();
  renewCalendarInTap();
}

async function disconnectCalendar() {
  if (!confirm('Stop Google Calendar reminders? The “Cat Reminders” calendar and its reminders will be removed from Google Calendar.')) return;
  const { calendarId } = state.settings;
  try {
    if (!calendar.hasToken()) await calendar.requestAccess({ hint: state.settings.calendarEmail });
    await calendar.deleteCalendar(calendarId);
  } catch {
    notify('Couldn’t remove the calendar from Google. You can delete “Cat Reminders 🐾” in Google Calendar yourself.');
  }
  calendar.revokeAccess();
  state.settings = { calendarId: '', calendarEmail: '' };
  state.cal = { status: 'idle', message: '', lastSynced: 0 };
  await cloud.saveSettings(state.user.uid, state.settings).catch(() => {});
  render();
}

function calendarStatus() {
  if (!calendar.isAvailable) return 'unavailable';
  if (!state.settings.calendarId) return 'off';
  if (state.cal.status === 'syncing') return 'syncing';
  if (state.cal.status === 'error') return 'error';
  if (!calendar.hasToken()) return 'needs-auth';
  return state.cal.lastSynced ? 'ok' : 'syncing';
}

function calendarBanner(place) {
  const status = calendarStatus();
  const email = esc(state.settings.calendarEmail);
  switch (status) {
    case 'unavailable':
      return '';
    case 'off':
      if (place === 'cat') return '';
      return `<div class="cal">${icon('calendar', { size: 26 })}<div class="cal-text">Get reminders in Google Calendar<small>The day before and on the day each dose is due.</small></div><button class="btn small primary" data-action="cal-connect">Connect</button></div>`;
    case 'syncing':
      return `<div class="cal busy">${icon('sync', { size: 24 })}<div class="cal-text">Updating Google Calendar…</div></div>`;
    case 'needs-auth':
      return `<div class="cal problem">${icon('calendar', { size: 26 })}<div class="cal-text">Google Calendar needs updating<small>Tap Update so Google can check it’s you.</small></div><button class="btn small" data-action="cal-update">Update</button></div>`;
    case 'error':
      return `<div class="cal problem">${icon('calendar', { size: 26 })}<div class="cal-text">${esc(state.cal.message || 'Google Calendar didn’t update.')}</div><button class="btn small" data-action="cal-update">Try again</button></div>`;
    default:
      return `<div class="cal ok">${icon('check', { size: 24 })}<div class="cal-text">Reminders are in Google Calendar${email ? `<small>${email}</small>` : ''}</div></div>`;
  }
}

function paintCalendar() {
  document.querySelectorAll('.cal-status').forEach((el) => (el.innerHTML = calendarBanner(el.dataset.place)));
}

// ---------- views: signed out ----------

const GOOGLE_ICON = `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

function authView() {
  const signup = state.authMode === 'signup';
  return `
    <section class="card auth">
      ${catFace('ginger', { size: 92 })}
      <h1>${signup ? 'Join the clowder!' : 'Welcome back!'}</h1>
      <p class="muted">Deworming and vaccine reminders for every cat in your life.</p>
      <button type="button" class="btn google" data-action="google">${GOOGLE_ICON}<span>Continue with Google</span></button>
      <div class="divider"><span>or with email</span></div>
      <form id="auth-form" novalidate>
        <label class="field">
          <span>Email</span>
          <input type="email" name="email" autocomplete="email" inputmode="email" required>
        </label>
        <label class="field">
          <span>Password</span>
          <input type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required minlength="6">
          ${signup ? '<small class="hint">At least 6 characters.</small>' : ''}
        </label>
        <p class="form-error" role="alert" hidden></p>
        <p class="form-info" role="status" hidden></p>
        <button type="submit" class="btn primary">${signup ? 'Create account' : 'Sign in'}</button>
        ${signup ? '' : '<button type="button" class="link" data-action="forgot">Forgot password?</button>'}
      </form>
      <p class="switch">
        ${signup
          ? 'Already have an account? <button type="button" class="link" data-action="auth-mode" data-mode="signin">Sign in</button>'
          : 'New here? <button type="button" class="link" data-action="auth-mode" data-mode="signup">Create an account</button>'}
      </p>
    </section>`;
}

function setupView() {
  return `
    <section class="card empty">
      ${catFace('ginger', { size: 80, sleepy: true })}
      <h1>Almost ready</h1>
      <p class="muted">This app isn’t connected to its Firebase project yet, so nobody can sign in. The setup steps are in the project’s README.</p>
    </section>`;
}

const loadingView = () => `<div class="loading" role="status">${catFace('ginger', { size: 64 })}<span>Loading…</span></div>`;

function loadErrorView() {
  return `
    <section class="card empty">
      ${catFace('gray', { size: 80, sleepy: true })}
      <h1>Couldn’t load your cats</h1>
      <p class="muted">${esc(state.loadError)}</p>
      <button class="btn primary" data-action="reload">Try again</button>
    </section>`;
}

// ---------- views: signed in ----------

function taskRow(item, today, { showCat = false } = {}) {
  const status = dueStatus(item.date, today);
  const info = TYPE_INFO[item.type];
  const locked = !item.isNext;
  const cat = findCat(item.catId);
  const what = `${info.name}${item.label ? ` (${item.label})` : ''}`;
  const meta = [
    `<span class="when">${esc(whenText({ ...status, catchUp: item.catchUp }))}</span>`,
    `<span>${esc(formatDate(item.date))}</span>`,
    item.catchUp ? '<span>not recorded yet</span>' : '',
    item.fromVet ? '<span class="badge">Vet’s date</span>' : '',
  ].filter(Boolean);
  return `
    <li class="task${locked ? ' locked' : ''}" data-status="${status.status}">
      <label class="tick"${locked ? ' data-action="locked" title="Unlocks after the one before it is ticked off"' : ' title="Tick when done"'}>
        <input type="checkbox" data-action="tick" data-cat="${esc(item.catId)}" data-type="${item.type}"${locked ? ' disabled' : ''} aria-label="${esc(`${item.catName}: ${what} is done`)}">
        <span class="tick-box">${paw(18)}</span>
      </label>
      <span class="type-badge type-${item.type}">${icon(item.type, { size: 22 })}</span>
      <div class="task-text">
        ${showCat && cat ? `<a class="who" href="${catLink(cat)}">${catAvatar(cat, 20)}${esc(cat.name)}</a>` : ''}
        <div class="task-title"><span>${esc(info.name)}</span>${item.label ? `<span class="dose">${esc(item.label)}</span>` : ''}</div>
        <div class="task-meta">${meta.join(' · ')}</div>
      </div>
    </li>`;
}

function doneRow(cat, { record, label, type }) {
  const info = TYPE_INFO[type];
  const extra = [
    record.product && esc(record.product),
    record.notes && esc(record.notes),
    record.nextDue && `Vet’s next date: ${esc(formatDate(record.nextDue))}`,
  ].filter(Boolean);
  return `
    <li class="task done">
      <label class="tick" title="Untick">
        <input type="checkbox" checked data-action="untick" data-cat="${esc(cat.id)}" data-record="${esc(record.id)}" aria-label="${esc(`${info.name} on ${formatDate(record.date)} is done. Untick to undo`)}">
        <span class="tick-box">${paw(18)}</span>
      </label>
      <span class="type-badge type-${type}">${icon(type, { size: 22 })}</span>
      <div class="task-text">
        <div class="task-title"><span>${esc(info.name)}</span>${label ? `<span class="dose">${esc(label)}</span>` : ''}</div>
        <div class="task-meta"><span>Done ${esc(formatDate(record.date))}</span>${extra.length ? ` · ${extra.join(' · ')}` : ''}</div>
      </div>
      <button class="btn small ghost" data-action="edit-record" data-cat="${esc(cat.id)}" data-record="${esc(record.id)}" aria-label="Edit ${esc(info.name)} from ${esc(formatDate(record.date))}">Edit</button>
    </li>`;
}

const disclaimer = () =>
  '<p class="disclaimer">Schedules follow common vet guidelines. Your vet knows your cat best, so use the dates they give you when you have them.</p>';

function homeView(today) {
  if (state.cats.length === 0) {
    return `
      <section class="empty card">
        ${catFace('ginger', { size: 110 })}
        <h1>Meow! Who’s your cat?</h1>
        <p class="muted">Add your cat’s name and birthday, and their whole deworming and vaccine schedule appears. Tick each one off as it’s done.</p>
        <button class="btn primary" data-action="add-cat">${icon('plus')} Add your first cat</button>
      </section>
      <div class="cal-status" data-place="home">${calendarBanner('home')}</div>
      ${disclaimer()}`;
  }

  const cats = [...state.cats].sort(byName);
  const todo = cats
    .flatMap((cat) => catSchedule(cat, today).filter((item) => item.isNext && daysBetween(today, item.date) <= 30))
    .sort((a, b) => byDate(a, b) || a.catName.localeCompare(b.catName));
  const overdue = todo.filter((item) => item.date < today).length;
  const line = todo.length
    ? `${plural(todo.length, 'thing')} to do in the next 30 days${overdue ? `, ${overdue} overdue` : ''}.`
    : 'Everyone is up to date. Time for a nap.';

  return `
    <section class="hello">
      <h1>${greeting()}</h1>
      <p>${line}</p>
    </section>
    <div class="cal-status" data-place="home">${calendarBanner('home')}</div>
    <section>
      <div class="section-head"><h2>To do</h2><span class="muted small">Next 30 days</span></div>
      ${todo.length
        ? `<ul class="checklist card">${todo.map((item) => taskRow(item, today, { showCat: true })).join('')}</ul>`
        : `<div class="card caught-up">${catFace('cream', { size: 56, sleepy: true })}<div><strong>All caught up!</strong><span class="muted">Nothing due in the next 30 days.</span></div></div>`}
    </section>
    <section>
      <div class="section-head"><h2>Your cats</h2></div>
      <ul class="cat-grid">
        ${cats.map((cat) => catCard(cat, today)).join('')}
        <li><button class="cat-card add-tile" data-action="add-cat"><span class="plus">${icon('plus', { size: 28 })}</span>Add a cat</button></li>
      </ul>
    </section>
    ${disclaimer()}`;
}

function catCard(cat, today) {
  const [next] = catSchedule(cat, today);
  const status = dueStatus(next.date, today);
  return `
    <li>
      <a class="cat-card" href="${catLink(cat)}">
        ${avatarRing(cat, today, catAvatar(cat, 72))}
        <span class="cat-name">${esc(cat.name)}</span>
        <span class="muted small">${esc(ageText(cat.birthDate, today))}</span>
        <span class="chip" data-status="${status.status}">${esc(whenText({ ...status, catchUp: next.catchUp }))}</span>
        <span class="muted small">${esc(TYPE_INFO[next.type].name)}</span>
      </a>
    </li>`;
}

function catView(cat, today) {
  const schedule = catSchedule(cat, today);
  const done = TYPES.flatMap((type) => doseLabels(cat, type).map((entry) => ({ ...entry, type }))).sort(
    (a, b) => byDate(b.record, a.record),
  );
  const groups = [];
  for (const item of schedule) {
    const title = item.date < today ? 'Overdue' : monthTitle(item.date);
    if (groups.at(-1)?.title !== title) groups.push({ title, items: [] });
    groups.at(-1).items.push(item);
  }
  const overdue = schedule.filter((item) => item.date < today).length;
  const next = schedule[0];
  const summary = overdue
    ? `<p class="summary" style="color: var(--overdue)">${plural(overdue, 'thing')} overdue. Tick each one off once it’s done.</p>`
    : `<p class="summary">Next up: ${esc(TYPE_INFO[next.type].name.toLowerCase())}, ${esc(whenText({ ...dueStatus(next.date, today), catchUp: next.catchUp }).toLowerCase())}.</p>`;
  const facts = [
    ageText(cat.birthDate, today),
    `Born ${formatDate(cat.birthDate)}`,
    cat.sex === 'female' ? 'Girl' : cat.sex === 'male' ? 'Boy' : '',
    cat.outdoor ? 'Goes outside' : 'Indoor',
  ].filter(Boolean);
  const doneKey = `done-${cat.id}`;

  return `
    <a href="#/" class="back">${icon('back')} All cats</a>
    <section class="card cat-hero">
      <button class="btn small ghost edit" data-action="edit-cat" data-cat="${esc(cat.id)}">Edit</button>
      <div class="hero-avatar">
        ${catAvatar(cat, 116, { label: `${cat.name}’s picture` })}
        <button class="photo-btn" data-action="photo" data-cat="${esc(cat.id)}" aria-label="${state.photos.has(cat.id) ? 'Change' : 'Add'} ${esc(cat.name)}’s photo" title="${state.photos.has(cat.id) ? 'Change photo' : 'Add a photo'}">${icon('camera', { size: 20 })}</button>
      </div>
      <h1>${esc(cat.name)}</h1>
      <div class="facts">${facts.map((f) => `<span>${esc(f)}</span>`).join('')}</div>
      ${cat.notes ? `<p class="notes">${esc(cat.notes)}</p>` : ''}
      ${summary}
    </section>
    ${dashboardCard(cat, today, { period: state.period, animate: state.animateRings })}
    <div class="cal-status" data-place="cat">${calendarBanner('cat')}</div>

    ${cat.records.length === 0 ? `
      <section class="card tip">
        <p><strong>Already had some shots or deworming?</strong> Add them from the vaccine card so ${esc(cat.name)}’s schedule starts in the right place.</p>
        <button class="btn small" data-action="log" data-cat="${esc(cat.id)}">Add a past dose</button>
      </section>` : ''}

    <section>
      <div class="section-head">
        <h2>Schedule</h2>
        ${cat.records.length ? `<button class="btn small" data-action="log" data-cat="${esc(cat.id)}">Add a past dose</button>` : ''}
      </div>
      <p class="muted small">Tick each one off when it’s done. The next one unlocks after that.</p>
      ${groups.map((group) => `
        <h3 class="month${group.title === 'Overdue' ? ' overdue' : ''}">${esc(group.title)}</h3>
        <ul class="checklist card">${group.items.map((item) => taskRow(item, today)).join('')}</ul>`).join('')}
    </section>

    <section>
      <details class="done-list" data-keep="${esc(doneKey)}"${closedDetails.has(doneKey) ? '' : ' open'}>
        <summary>Done (${done.length})</summary>
        ${done.length
          ? `<ul class="checklist card">${done.map((entry) => doneRow(cat, entry)).join('')}</ul>`
          : '<p class="muted">Nothing ticked off yet.</p>'}
      </details>
    </section>

    <div class="danger-zone">
      <button class="btn danger-ghost" data-action="delete-cat" data-cat="${esc(cat.id)}">Delete ${esc(cat.name)}</button>
    </div>`;
}

function calendarSection() {
  if (!calendar.isAvailable) {
    return '<p class="muted">Google Calendar reminders aren’t set up for this app yet.</p>';
  }
  if (!state.settings.calendarId) {
    return `
      <p class="muted">Get a reminder in Google Calendar the day before and on the day each dose is due. Ticking a dose off here removes its reminder.</p>
      <p class="muted small">The app gets its own “Cat Reminders 🐾” calendar and can’t see your other events.</p>
      <div class="row"><button class="btn primary" data-action="cal-connect">${icon('calendar')} Connect Google Calendar</button></div>`;
  }
  return `
    <p class="muted">Reminders go to the “Cat Reminders 🐾” calendar${state.settings.calendarEmail ? ` in <strong class="email">${esc(state.settings.calendarEmail)}</strong>` : ''}.</p>
    <div class="cal-status" data-place="account">${calendarBanner('account')}</div>
    <p class="muted small">Not seeing it on your phone? In the Google Calendar app, open Settings and turn on “Cat Reminders 🐾”.</p>
    <div class="row">
      <button class="btn" data-action="cal-update">${icon('sync')} Update now</button>
      <button class="btn danger-ghost" data-action="cal-disconnect">Disconnect</button>
    </div>`;
}

function accountView() {
  const { user } = state;
  const withGoogle = user.providerData.some((p) => p.providerId === 'google.com');
  return `
    <a href="#/" class="back">${icon('back')} All cats</a>
    <section class="card account">
      <h1>Account</h1>
      <p class="muted">Signed in as <strong class="email">${esc(user.email ?? 'unknown')}</strong>${withGoogle ? ' with Google' : ''}.</p>
      <div class="row"><button class="btn" data-action="sign-out">Sign out</button></div>
    </section>
    <section class="card account">
      <h2>Google Calendar</h2>
      ${calendarSection()}
    </section>
    <section class="card backup">
      <h2>Your data</h2>
      <p class="muted">Your cats are saved to your account, so they show up on every phone or computer you sign in on. Only you can see them.</p>
      <div class="row">
        <button class="btn" data-action="export"${state.cats.length ? '' : ' disabled'}>Download a copy</button>
        <button class="btn ghost" data-action="import">Import from a backup file</button>
      </div>
    </section>
    <section class="card">
      <h2>Delete account</h2>
      <p class="muted">Permanently deletes your account and all your cats’ records.</p>
      <div class="row"><button class="btn danger-ghost" data-action="delete-account">Delete my account</button></div>
    </section>`;
}

// ---------- routing ----------

function currentRoute() {
  if (location.hash === '#/account') return { view: 'account' };
  const match = location.hash.match(/^#\/cat\/(.+)$/);
  return match ? { view: 'cat', id: decodeURIComponent(match[1]) } : { view: 'home' };
}

function render() {
  const signedIn = Boolean(state.user);
  accountLink.hidden = !signedIn;
  if (signedIn) {
    const label = state.user.email ?? 'Account';
    accountLink.textContent = [...label][0].toUpperCase();
    accountLink.title = `Account: ${label}`;
  }

  if (!cloud.isConfigured) return show(setupView(), 'Cat Reminders');
  if (!state.authReady) return show(loadingView(), 'Cat Reminders');
  if (!signedIn) return show(authView(), 'Sign in · Cat Reminders');
  if (state.loadError) return show(loadErrorView(), 'Cat Reminders');
  if (!state.catsLoaded) return show(loadingView(), 'Cat Reminders');

  const today = todayISO();
  const route = currentRoute();
  if (route.view === 'account') return show(accountView(), 'Account · Cat Reminders');
  if (route.view === 'cat') {
    const cat = findCat(route.id);
    if (!cat) {
      location.replace('#/');
      return;
    }
    return show(catView(cat, today), `${cat.name} · Cat Reminders`);
  }
  return show(homeView(today), 'Cat Reminders');
}

function show(html, title) {
  app.innerHTML = html;
  document.title = title;
  state.animateRings = false;
}

// ---------- ticking ----------

// A quick double tap shouldn't tick two doses: the next one appears right after a tick.
let lastTickAt = 0;

function tick(catId, type) {
  const cat = findCat(catId);
  if (!cat) return;
  if (Date.now() - lastTickAt < 800) return render();
  lastTickAt = Date.now();
  renewCalendarInTap();
  const today = todayISO();
  const record = { id: newId(), type, date: today, product: '', notes: '', nextDue: '' };
  const updated = { ...cat, records: [...cat.records, record] };
  const before = earnedBadges(cat, today);
  const after = earnedBadges(updated, today);
  const fresh = BADGES.filter((b) => after.has(b.id) && !before.has(b.id));
  commitCat(updated);
  const next = nextDue(updated, type, today);
  const badgeText = fresh.length ? ` New badge: ${fresh.map((b) => `${b.emoji} ${b.name}`).join(', ')}!` : '';
  if (fresh.length) confetti();
  notify(`Purr-fect! ${TYPE_INFO[type].name} ticked off for ${cat.name}. Next one: ${formatDate(next.date)}.${badgeText}`, {
    action: 'Undo',
    onAction: () => {
      renewCalendarInTap();
      const latest = findCat(catId);
      if (latest) commitCat({ ...latest, records: latest.records.filter((r) => r.id !== record.id) });
    },
  });
}

function untick(catId, recordId) {
  const cat = findCat(catId);
  const record = cat?.records.find((r) => r.id === recordId);
  if (!record) return;
  renewCalendarInTap();
  commitCat({ ...cat, records: cat.records.filter((r) => r.id !== recordId) });
  notify(`Unticked ${TYPE_INFO[record.type].name.toLowerCase()} from ${formatDate(record.date)}.`, {
    action: 'Undo',
    onAction: () => {
      renewCalendarInTap();
      const latest = findCat(catId);
      if (latest) commitCat({ ...latest, records: [...latest.records, record] });
    },
  });
}

// ---------- signing in ----------

function authMessage(form, { error = '', info = '' }) {
  const errorBox = form.querySelector('.form-error');
  const infoBox = form.querySelector('.form-info');
  errorBox.textContent = error;
  errorBox.hidden = !error;
  infoBox.textContent = info;
  infoBox.hidden = !info;
}

function setBusy(busy) {
  app.querySelectorAll('.auth button').forEach((button) => (button.disabled = busy));
}

async function submitAuth(form) {
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  const signup = state.authMode === 'signup';
  authMessage(form, {});
  if (!email) return authMessage(form, { error: 'Enter your email address.' });
  if (!password) return authMessage(form, { error: 'Enter your password.' });
  if (signup && password.length < 6) return authMessage(form, { error: 'Use a password with at least 6 characters.' });

  setBusy(true);
  try {
    await (signup ? cloud.signUp(email, password) : cloud.signIn(email, password));
  } catch (error) {
    authMessage(form, { error: cloud.friendlyError(error) });
    setBusy(false);
  }
}

async function forgotPassword() {
  const form = document.getElementById('auth-form');
  const email = form.elements.email.value.trim();
  if (!email) {
    authMessage(form, { error: 'Enter your email address above, then tap “Forgot password?” again.' });
    form.elements.email.focus();
    return;
  }
  const sent = `If there’s an account for ${email}, a link to reset the password is on its way. Check your inbox.`;
  setBusy(true);
  try {
    await cloud.resetPassword(email);
    authMessage(form, { info: sent });
  } catch (error) {
    authMessage(form, error?.code === 'auth/user-not-found' ? { info: sent } : { error: cloud.friendlyError(error) });
  } finally {
    setBusy(false);
  }
}

async function googleSignIn() {
  const form = document.getElementById('auth-form');
  authMessage(form, {});
  setBusy(true);
  try {
    await cloud.signInWithGoogle();
  } catch (error) {
    if (!cloud.isCancelled(error)) authMessage(form, { error: cloud.friendlyError(error) });
    setBusy(false);
  }
}

function switchAuthMode(mode) {
  const email = document.getElementById('auth-form')?.elements.email.value ?? '';
  state.authMode = mode;
  render();
  const form = document.getElementById('auth-form');
  form.elements.email.value = email;
  (email ? form.elements.password : form.elements.email).focus();
}

async function signOut() {
  calendar.forget();
  await cloud.signOut();
}

async function deleteAccount() {
  const { user } = state;
  if (!confirm('Delete your account and all your cats’ records? This cannot be undone.')) return;
  if (!cloud.signedInRecently(user)) {
    alert('For your security, please sign in again, then delete your account.');
    await signOut();
    return;
  }
  try {
    if (calConnected() && calendar.hasToken()) await calendar.deleteCalendar(state.settings.calendarId).catch(() => {});
    calendar.revokeAccess();
    await cloud.deleteAccount(user);
  } catch (error) {
    alert(cloud.friendlyError(error));
  }
}

// ---------- cat and record forms ----------

function showError(form, message) {
  const box = form.querySelector('.form-error');
  box.textContent = message;
  box.hidden = !message;
}

let editingCatId = null;
// The photo chosen in the cat form: undefined = unchanged, '' = removed, else a data: URL.
let dialogPhoto;

function paintPhotoPreview() {
  const preview = document.getElementById('photo-preview');
  const current = dialogPhoto === undefined ? (editingCatId ? state.photos.get(editingCatId) ?? '' : '') : dialogPhoto;
  const coat = catFields.coat.value || coatFor({ name: catFields.name.value || 'cat' });
  preview.innerHTML = current ? `<img class="cat-photo" src="${esc(current)}" width="72" height="72" alt="">` : catFace(coat, { size: 72 });
  document.getElementById('photo-remove').hidden = !current;
  document.getElementById('photo-choose').textContent = current ? 'Change photo' : 'Choose photo';
}

function openCatDialog(cat = null) {
  editingCatId = cat?.id ?? null;
  dialogPhoto = undefined;
  catForm.reset();
  showError(catForm, '');
  catDialog.querySelector('#cat-dialog-title').textContent = cat ? `Edit ${cat.name}` : 'Add a cat';
  catFields.birthDate.max = todayISO();
  if (cat) {
    catFields.name.value = cat.name;
    catFields.birthDate.value = cat.birthDate;
    catFields.sex.value = cat.sex;
    catFields.outdoor.checked = cat.outdoor;
    catFields.notes.value = cat.notes;
    if (cat.coat) catFields.coat.value = cat.coat;
  }
  paintPhotoPreview();
  catDialog.showModal();
}

catForm.addEventListener('change', (event) => {
  if (event.target.name === 'coat') paintPhotoPreview();
});
document.getElementById('photo-choose').addEventListener('click', () => {
  photoTarget = 'dialog';
  photoInput.click();
});
document.getElementById('photo-remove').addEventListener('click', () => {
  dialogPhoto = '';
  paintPhotoPreview();
});

/** Saves (or with '' removes) a cat's photo; the screen updates straight away. */
function storePhoto(catId, dataUrl) {
  if (dataUrl) state.photos.set(catId, dataUrl);
  else state.photos.delete(catId);
  render();
  const saving = dataUrl ? cloud.savePhoto(state.user.uid, catId, dataUrl) : cloud.removePhoto(state.user.uid, catId);
  saving.catch((error) => notify(`Couldn’t save the photo. ${cloud.friendlyError(error)}`));
}

// Where a chosen photo goes: 'dialog' (the cat form) or a cat id (the camera button).
let photoTarget = null;
photoInput.addEventListener('change', async () => {
  const file = photoInput.files[0];
  photoInput.value = '';
  if (!file || !photoTarget) return;
  const target = photoTarget;
  try {
    const dataUrl = await photoFromFile(file);
    if (target === 'dialog') {
      dialogPhoto = dataUrl;
      paintPhotoPreview();
    } else if (findCat(target)) {
      storePhoto(target, dataUrl);
      notify(`Lovely photo of ${findCat(target).name}!`);
    }
  } catch (error) {
    if (target === 'dialog') showError(catForm, error.message);
    else notify(error.message);
  }
});

catForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = catFields.name.value.trim();
  const birthDate = catFields.birthDate.value;
  if (!name) return showError(catForm, 'Please enter a name.');
  if (!isValidDate(birthDate)) return showError(catForm, 'Please enter a birthday. A guess is fine.');
  if (birthDate > todayISO()) return showError(catForm, 'The birthday can’t be in the future.');

  const fields = {
    name,
    birthDate,
    sex: catFields.sex.value,
    outdoor: catFields.outdoor.checked,
    coat: catFields.coat.value,
    notes: catFields.notes.value.trim(),
  };
  const existing = editingCatId && findCat(editingCatId);
  if (existing) {
    const firstRecord = existing.records.map((r) => r.date).sort()[0];
    if (firstRecord && birthDate > firstRecord) {
      return showError(catForm, `The birthday can’t be after the first dose (${formatDate(firstRecord)}).`);
    }
    renewCalendarInTap();
    catDialog.close();
    commitCat({ ...existing, ...fields });
    if (dialogPhoto !== undefined) storePhoto(existing.id, dialogPhoto);
  } else {
    renewCalendarInTap();
    const cat = { id: newId(), ...fields, records: [] };
    catDialog.close();
    if (dialogPhoto) state.photos.set(cat.id, dialogPhoto);
    commitCat(cat);
    if (dialogPhoto) storePhoto(cat.id, dialogPhoto);
    state.animateRings = true;
    location.hash = catLink(cat);
    notify(`${cat.name}’s schedule is ready! Tick each one off as it’s done.`);
  }
});

let editing = { catId: null, recordId: null };

function openRecordDialog(cat, { type = 'deworm', record = null } = {}) {
  editing = { catId: cat.id, recordId: record?.id ?? null };
  recordForm.reset();
  showError(recordForm, '');
  recordDialog.querySelector('#record-dialog-title').textContent = record ? 'Edit dose' : 'Add a past dose';
  recordDialog.querySelector('#record-dialog-cat').textContent = cat.name;
  recordFields.date.min = cat.birthDate;
  recordFields.date.max = todayISO();
  recordFields.type.value = record?.type ?? type;
  recordFields.date.value = record?.date ?? todayISO();
  recordFields.product.value = record?.product ?? '';
  recordFields.nextDue.value = record?.nextDue ?? '';
  recordFields.notes.value = record?.notes ?? '';
  recordFields.nextDue.min = recordFields.date.value;
  recordDialog.querySelector('#record-delete').hidden = !record;
  recordDialog.showModal();
}

recordFields.date.addEventListener('change', () => {
  recordFields.nextDue.min = recordFields.date.value;
});

recordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const cat = findCat(editing.catId);
  if (!cat) return recordDialog.close();
  const date = recordFields.date.value;
  const nextDueDate = recordFields.nextDue.value;
  if (!isValidDate(date)) return showError(recordForm, 'Please enter the date it was given.');
  if (date > todayISO()) return showError(recordForm, 'The date given can’t be in the future.');
  if (date < cat.birthDate) return showError(recordForm, `The date can’t be before ${cat.name}’s birthday.`);
  if (nextDueDate && nextDueDate <= date) return showError(recordForm, 'The vet’s next date must be after the date given.');

  const fields = {
    type: recordFields.type.value,
    date,
    product: recordFields.product.value.trim(),
    notes: recordFields.notes.value.trim(),
    nextDue: nextDueDate,
  };
  const records = editing.recordId
    ? cat.records.map((r) => (r.id === editing.recordId ? { ...r, ...fields } : r))
    : [...cat.records, { id: newId(), ...fields }];
  renewCalendarInTap();
  recordDialog.close();
  commitCat({ ...cat, records });
});

recordDialog.querySelector('#record-delete').addEventListener('click', () => {
  const cat = findCat(editing.catId);
  const record = cat?.records.find((r) => r.id === editing.recordId);
  if (!record) return;
  if (!confirm(`Delete the ${TYPE_INFO[record.type].name.toLowerCase()} from ${formatDate(record.date)}?`)) return;
  renewCalendarInTap();
  recordDialog.close();
  commitCat({ ...cat, records: cat.records.filter((r) => r.id !== record.id) });
});

for (const dialog of [catDialog, recordDialog]) {
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) dialog.close();
  });
}

// ---------- backup ----------

function downloadCopy() {
  const blob = new Blob([exportBackup(state.cats)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cat-reminders-${todayISO()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file || !state.user) return;
  try {
    const cats = parseBackup(await file.text());
    if (cats.length === 0) return alert('This backup has no cats in it.');
    if (!confirm(`Add ${plural(cats.length, 'cat')} from this backup to your account? Cats imported before are updated, not doubled.`)) return;
    cats.forEach((cat) => commitCat(cat));
    location.hash = '#/';
    notify(`Imported ${plural(cats.length, 'cat')}.`);
  } catch (error) {
    alert(error.message);
  }
});

// ---------- events ----------

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action } = target.dataset;
  const cat = target.dataset.cat ? findCat(target.dataset.cat) : null;

  switch (action) {
    case 'google': return googleSignIn();
    case 'forgot': return forgotPassword();
    case 'auth-mode': return switchAuthMode(target.dataset.mode);
    case 'reload': return location.reload();
    case 'sign-out': return signOut();
    case 'delete-account': return deleteAccount();
    case 'add-cat': return openCatDialog();
    case 'export': return downloadCopy();
    case 'import': return importInput.click();
    case 'cal-connect': return connectCalendar();
    case 'cal-update': return updateCalendarNow();
    case 'cal-disconnect': return disconnectCalendar();
    case 'locked': return notify('That one unlocks once the one before it is ticked off.');
    case 'period':
      state.period = target.dataset.period === 'year' ? 'year' : 'month';
      state.animateRings = true;
      return render();
  }
  if (!cat) return;
  if (action === 'photo') {
    photoTarget = cat.id;
    photoInput.click();
  } else if (action === 'edit-cat') openCatDialog(cat);
  else if (action === 'log') openRecordDialog(cat, { type: target.dataset.type });
  else if (action === 'edit-record') {
    const record = cat.records.find((r) => r.id === target.dataset.record);
    if (record) openRecordDialog(cat, { record });
  } else if (action === 'delete-cat') {
    if (!confirm(`Delete ${cat.name} and all of ${cat.name}’s records? This cannot be undone.`)) return;
    renewCalendarInTap();
    location.hash = '#/';
    dropCat(cat);
  }
});

document.addEventListener('change', (event) => {
  const box = event.target.closest('input[data-action]');
  if (!box) return;
  if (box.dataset.action === 'tick' && box.checked) tick(box.dataset.cat, box.dataset.type);
  if (box.dataset.action === 'untick' && !box.checked) untick(box.dataset.cat, box.dataset.record);
});

// <details> remember whether they were closed across re-renders.
document.addEventListener(
  'toggle',
  (event) => {
    const key = event.target.dataset?.keep;
    if (!key) return;
    if (event.target.open) closedDetails.delete(key);
    else closedDetails.add(key);
  },
  true,
);

document.addEventListener('submit', (event) => {
  if (event.target.id === 'auth-form') {
    event.preventDefault();
    submitAuth(event.target);
  }
});

window.addEventListener('hashchange', () => {
  state.animateRings = currentRoute().view === 'cat';
  render();
  window.scrollTo(0, 0);
});

// Refresh "today" (and the calendar) when the app comes back to the foreground.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user) {
    render();
    scheduleSync(0);
  }
});

// ---------- start ----------

render();

if (cloud.isConfigured) {
  cloud.watchUser((user) => {
    unsubscribers.forEach((stop) => stop());
    unsubscribers = [];
    Object.assign(state, {
      authReady: true,
      user,
      cats: [],
      catsLoaded: false,
      catsFromServer: false,
      loadError: '',
      settings: { calendarId: '', calendarEmail: '' },
      cal: { status: 'idle', message: '', lastSynced: 0 },
      photos: new Map(),
    });
    if (user) {
      calendar.useAccount(user.uid);
      calendar.preload().catch(() => {});
      const onError = (error) => {
        state.loadError = cloud.friendlyError(error);
        render();
      };
      unsubscribers.push(
        cloud.watchCats(
          user.uid,
          (cats, { fromServer }) => {
            state.cats = cats;
            state.catsLoaded = true;
            const firstServerList = fromServer && !state.catsFromServer;
            if (fromServer) state.catsFromServer = true;
            render();
            if (firstServerList) scheduleSync(0);
          },
          onError,
        ),
        cloud.watchSettings(
          user.uid,
          (settings) => {
            const changed = settings.calendarId !== state.settings.calendarId;
            state.settings = settings;
            if (changed) {
              paintCalendar();
              scheduleSync(0);
              if (currentRoute().view === 'account') render();
            }
          },
          () => {},
        ),
        cloud.watchPhotos(
          user.uid,
          (photos) => {
            state.photos = photos;
            render();
          },
          () => {},
        ),
      );
    } else {
      catDialog.close();
      recordDialog.close();
      // Signed out (here or on another device): start the next sign-in at home.
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    }
    render();
  });
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // When a new version of the app takes over, reload so it shows straight away
  // (or offer to, if a form is open).
  const updating = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updating || reloaded) return;
    if (document.querySelector('dialog[open]')) {
      notify('A new version of Cat Reminders is ready.', { action: 'Reload', onAction: () => location.reload() });
      return;
    }
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
