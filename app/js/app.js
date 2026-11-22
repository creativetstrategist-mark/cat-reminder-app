import { TYPES, TYPE_INFO, upcoming, dueStatus, doseLabels, dueList, mostUrgent } from './schedule.js';
import { todayISO, formatDate, ageText, isValidDate } from './dates.js';
import { exportBackup, parseBackup, newId } from './store.js';
import * as cloud from './cloud.js';

const state = {
  authReady: false, // has Firebase told us whether someone is signed in?
  user: null,
  cats: [],
  catsLoaded: false,
  loadError: '',
  authMode: 'signin', // or 'signup'
};
let stopWatchingCats = null;

const app = document.getElementById('app');
const accountLink = document.getElementById('account-link');
const toast = document.getElementById('toast');
const catDialog = document.getElementById('cat-dialog');
const catForm = document.getElementById('cat-form');
const recordDialog = document.getElementById('record-dialog');
const recordForm = document.getElementById('record-form');
const importInput = document.getElementById('import-file');
// Read inputs through .elements: catForm.name would be the form's own name, not the input.
const catFields = catForm.elements;
const recordFields = recordForm.elements;

// ---------- helpers ----------

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const findCat = (id) => state.cats.find((cat) => cat.id === id);
const byName = (a, b) => a.name.localeCompare(b.name);

function hue(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function avatar(cat, size = '') {
  const initial = [...cat.name][0]?.toUpperCase() ?? '?';
  return `<span class="avatar ${size}" style="--hue:${hue(cat.name)}" aria-hidden="true">${esc(initial)}</span>`;
}

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

let toastTimer;
function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 6000);
}

// ---------- saving ----------
// Changes show on screen straight away; Firebase saves them in the background
// (and queues them while offline), then the live update confirms them.

function commitCat(cat) {
  const exists = state.cats.some((c) => c.id === cat.id);
  state.cats = exists ? state.cats.map((c) => (c.id === cat.id ? cat : c)) : [...state.cats, cat];
  render();
  cloud.saveCat(state.user.uid, cat).catch((error) => notify(`Couldn’t save ${cat.name}. ${cloud.friendlyError(error)}`));
}

function dropCat(cat) {
  state.cats = state.cats.filter((c) => c.id !== cat.id);
  render();
  cloud.removeCat(state.user.uid, cat.id).catch((error) => notify(`Couldn’t delete ${cat.name}. ${cloud.friendlyError(error)}`));
}

// ---------- views: signed out ----------

const GOOGLE_ICON = `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

function authView() {
  const signup = state.authMode === 'signup';
  return `
    <section class="card auth">
      <img src="icons/icon.svg" alt="" width="64" height="64">
      <h1>${signup ? 'Create your account' : 'Welcome back'}</h1>
      <p class="muted">Keep every cat’s deworming and vaccines on time, on all your devices.</p>
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
      <img src="icons/icon.svg" alt="" width="64" height="64">
      <h1>Almost ready</h1>
      <p class="muted">This app isn’t connected to its Firebase project yet, so nobody can sign in. The setup steps are in the project’s README.</p>
    </section>`;
}

const loadingView = () => '<p class="loading muted" role="status">Loading…</p>';

function loadErrorView() {
  return `
    <section class="card empty">
      <h1>Couldn’t load your cats</h1>
      <p class="muted">${esc(state.loadError)}</p>
      <button class="btn primary" data-action="reload">Try again</button>
    </section>`;
}

// ---------- views: signed in ----------

function dueRow(item) {
  const info = TYPE_INFO[item.type];
  return `
    <li class="due-item" data-status="${item.status}">
      <span class="dot" aria-hidden="true"></span>
      <div class="due-text">
        <div class="due-title">
          <a href="#/cat/${encodeURIComponent(item.cat.id)}">${esc(item.cat.name)}</a>
          <span>${esc(info.name)}</span>
        </div>
        <div class="due-meta">${[
          `<span class="when">${esc(whenText(item))}</span>`,
          `<span>${item.catchUp ? 'Not recorded yet' : esc(formatDate(item.date))}</span>`,
          item.label && `<span>${esc(item.label)}</span>`,
        ].filter(Boolean).join(' · ')}</div>
      </div>
      <button class="btn small" data-action="log" data-cat="${esc(item.cat.id)}" data-type="${item.type}">Done</button>
    </li>`;
}

function catCard(cat, today) {
  const next = mostUrgent(cat, today);
  return `
    <li>
      <a class="cat-card" href="#/cat/${encodeURIComponent(cat.id)}">
        ${avatar(cat)}
        <span class="cat-card-body">
          <span class="cat-name">${esc(cat.name)}</span>
          <span class="muted">${esc(ageText(cat.birthDate, today))}</span>
        </span>
        <span class="cat-next" data-status="${next.status}">
          <span class="chip">${esc(whenText(next))}</span>
          <span class="muted small">${esc(TYPE_INFO[next.type].name)}</span>
        </span>
      </a>
    </li>`;
}

const disclaimer = () =>
  '<p class="disclaimer">Default schedules follow common vet guidelines. Your vet knows your cat best, so enter the dates they give you when you have them.</p>';

function homeView(today) {
  if (state.cats.length === 0) {
    return `
      <section class="empty card">
        <img src="icons/icon.svg" alt="" width="72" height="72">
        <h1>Keep every cat’s shots on time</h1>
        <p class="muted">Add your cats and the app works out when deworming, the 4-in-1 vaccine and the anti-rabies vaccine are due.</p>
        <button class="btn primary" data-action="add-cat">Add your first cat</button>
      </section>
      ${disclaimer()}`;
  }

  const cats = [...state.cats].sort(byName);
  const due = dueList(cats, today, 30);
  return `
    <section>
      <div class="section-head">
        <h2>Coming up</h2>
        <span class="muted small">Overdue and next 30 days</span>
      </div>
      ${due.length
        ? `<ul class="due-list card">${due.map(dueRow).join('')}</ul>`
        : '<p class="card muted">Nothing due in the next 30 days.</p>'}
    </section>
    <section>
      <div class="section-head">
        <h2>Your cats <span class="count">${cats.length}</span></h2>
        <button class="btn small" data-action="add-cat">Add cat</button>
      </div>
      <ul class="cat-list">${cats.map((cat) => catCard(cat, today)).join('')}</ul>
    </section>
    ${disclaimer()}`;
}

function scheduleCard(cat, type, today) {
  const info = TYPE_INFO[type];
  const plan = upcoming(cat, type, today);
  const next = { ...plan[0], ...dueStatus(plan[0].date, today) };
  const later = plan.slice(1);
  const history = doseLabels(cat, type).reverse();

  return `
    <article class="card schedule" data-status="${next.status}">
      <header class="schedule-head">
        <div>
          <h3>${esc(info.name)}</h3>
          <p class="muted small">${esc(info.about)}</p>
        </div>
        <span class="chip">${esc(whenText(next))}</span>
      </header>

      <div class="next">
        <div>
          <div class="next-label">Next${next.label ? ` · ${esc(next.label)}` : ''}</div>
          <div class="next-date">${next.catchUp ? 'As soon as you can' : esc(formatDate(next.date))}</div>
          <div class="muted small">${esc(next.reason)}${next.fromVet ? ' <span class="badge">Vet</span>' : ''}</div>
        </div>
        <button class="btn primary" data-action="log" data-cat="${esc(cat.id)}" data-type="${type}">Mark as done</button>
      </div>

      ${later.length ? `
        <details class="plan">
          <summary>Schedule after that (${later.length})</summary>
          <ol class="timeline">
            ${later.map((item) => `<li><span>${esc(formatDate(item.date))}</span><span class="muted">${esc(item.label ?? '')}</span></li>`).join('')}
          </ol>
          <p class="muted small">Assumes each one is done on its due date. Dates move when you record what was given.</p>
        </details>` : ''}

      <details class="history" open>
        <summary>Already given (${history.length})</summary>
        ${history.length ? `
          <ul class="records">
            ${history.map(({ record, label }) => `
              <li>
                <div>
                  <div>${esc(formatDate(record.date))}${label ? ` <span class="muted">· ${esc(label)}</span>` : ''}</div>
                  ${record.product || record.notes || record.nextDue ? `<div class="muted small">${[
                    record.product && esc(record.product),
                    record.notes && esc(record.notes),
                    record.nextDue && `Vet’s next date: ${esc(formatDate(record.nextDue))}`,
                  ].filter(Boolean).join(' · ')}</div>` : ''}
                </div>
                <button class="btn small ghost" data-action="edit-record" data-cat="${esc(cat.id)}" data-record="${esc(record.id)}" aria-label="Edit record from ${esc(formatDate(record.date))}">Edit</button>
              </li>`).join('')}
          </ul>` : '<p class="muted small">Nothing recorded yet.</p>'}
      </details>
    </article>`;
}

function catView(cat, today) {
  const facts = [
    ageText(cat.birthDate, today),
    `Born ${formatDate(cat.birthDate)}`,
    cat.sex === 'female' ? 'Female' : cat.sex === 'male' ? 'Male' : '',
    cat.outdoor ? 'Goes outside' : 'Indoor',
  ].filter(Boolean);
  const noRecords = cat.records.length === 0;

  return `
    <a href="#/" class="back">← All cats</a>
    <section class="card cat-header">
      ${avatar(cat, 'large')}
      <div class="cat-header-body">
        <h1>${esc(cat.name)}</h1>
        <p class="muted">${facts.map(esc).join(' · ')}</p>
        ${cat.notes ? `<p class="notes">${esc(cat.notes)}</p>` : ''}
      </div>
      <button class="btn small ghost" data-action="edit-cat" data-cat="${esc(cat.id)}">Edit</button>
    </section>

    ${noRecords ? `
      <section class="card tip">
        <p><strong>Already had shots or deworming?</strong> Add them from the vaccine card so ${esc(cat.name)}’s schedule is right.</p>
        <button class="btn small" data-action="log" data-cat="${esc(cat.id)}">Add past record</button>
      </section>` : ''}

    <div class="section-head">
      <h2>Schedule</h2>
      <button class="btn small" data-action="log" data-cat="${esc(cat.id)}">Add record</button>
    </div>
    ${TYPES.map((type) => scheduleCard(cat, type, today)).join('')}

    <div class="danger-zone">
      <button class="btn danger-ghost" data-action="delete-cat" data-cat="${esc(cat.id)}">Delete ${esc(cat.name)}</button>
    </div>`;
}

function accountView() {
  const { user } = state;
  const withGoogle = user.providerData.some((p) => p.providerId === 'google.com');
  return `
    <a href="#/" class="back">← All cats</a>
    <section class="card account">
      <h1>Account</h1>
      <p class="muted">Signed in as <strong class="email">${esc(user.email ?? 'unknown')}</strong>${withGoogle ? ' with Google' : ''}.</p>
      <div class="row"><button class="btn" data-action="sign-out">Sign out</button></div>
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
    // watchUser takes it from here.
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
  setBusy(true);
  try {
    await cloud.resetPassword(email);
    authMessage(form, { info: `If there’s an account for ${email}, a link to reset the password is on its way. Check your inbox.` });
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      authMessage(form, { info: `If there’s an account for ${email}, a link to reset the password is on its way. Check your inbox.` });
    } else {
      authMessage(form, { error: cloud.friendlyError(error) });
    }
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

async function deleteAccount() {
  const { user } = state;
  if (!confirm('Delete your account and all your cats’ records? This cannot be undone.')) return;
  if (!cloud.signedInRecently(user)) {
    alert('For your security, please sign in again, then delete your account.');
    await cloud.signOut();
    return;
  }
  try {
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

function openCatDialog(cat = null) {
  editingCatId = cat?.id ?? null;
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
  }
  catDialog.showModal();
}

catForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = catFields.name.value.trim();
  const birthDate = catFields.birthDate.value;
  if (!name) return showError(catForm, 'Please enter a name.');
  if (!isValidDate(birthDate)) return showError(catForm, 'Please enter a birthday. An estimate is fine.');
  if (birthDate > todayISO()) return showError(catForm, 'The birthday cannot be in the future.');

  const fields = { name, birthDate, sex: catFields.sex.value, outdoor: catFields.outdoor.checked, notes: catFields.notes.value.trim() };
  const existing = editingCatId && findCat(editingCatId);
  if (existing) {
    const firstRecord = existing.records.map((r) => r.date).sort()[0];
    if (firstRecord && birthDate > firstRecord) {
      return showError(catForm, `The birthday cannot be after the first record (${formatDate(firstRecord)}).`);
    }
    catDialog.close();
    commitCat({ ...existing, ...fields });
  } else {
    const cat = { id: newId(), ...fields, records: [] };
    catDialog.close();
    commitCat(cat);
    location.hash = `#/cat/${encodeURIComponent(cat.id)}`;
  }
});

let editing = { catId: null, recordId: null };

function openRecordDialog(cat, { type = 'deworm', record = null } = {}) {
  editing = { catId: cat.id, recordId: record?.id ?? null };
  recordForm.reset();
  showError(recordForm, '');
  recordDialog.querySelector('#record-dialog-title').textContent = record ? 'Edit record' : 'Add a record';
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
  if (date > todayISO()) return showError(recordForm, 'The date given cannot be in the future.');
  if (date < cat.birthDate) return showError(recordForm, `The date cannot be before ${cat.name}’s birthday.`);
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
  recordDialog.close();
  commitCat({ ...cat, records });
});

recordDialog.querySelector('#record-delete').addEventListener('click', () => {
  const cat = findCat(editing.catId);
  const record = cat?.records.find((r) => r.id === editing.recordId);
  if (!record) return;
  if (!confirm(`Delete the ${TYPE_INFO[record.type].name.toLowerCase()} record from ${formatDate(record.date)}?`)) return;
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
    cats.forEach(commitCat);
    location.hash = '#/';
    notify(`Imported ${plural(cats.length, 'cat')}.`);
  } catch (error) {
    alert(error.message);
  }
});

// ---------- actions ----------

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action } = button.dataset;
  const cat = button.dataset.cat ? findCat(button.dataset.cat) : null;

  switch (action) {
    case 'google': return googleSignIn();
    case 'forgot': return forgotPassword();
    case 'auth-mode': return switchAuthMode(button.dataset.mode);
    case 'reload': return location.reload();
    case 'sign-out': return cloud.signOut();
    case 'delete-account': return deleteAccount();
    case 'add-cat': return openCatDialog();
    case 'export': return downloadCopy();
    case 'import': return importInput.click();
  }
  if (!cat) return;
  if (action === 'edit-cat') openCatDialog(cat);
  else if (action === 'log') openRecordDialog(cat, { type: button.dataset.type });
  else if (action === 'edit-record') {
    const record = cat.records.find((r) => r.id === button.dataset.record);
    if (record) openRecordDialog(cat, { record });
  } else if (action === 'delete-cat') {
    if (!confirm(`Delete ${cat.name} and all of ${cat.name}’s records? This cannot be undone.`)) return;
    location.hash = '#/';
    dropCat(cat);
  }
});

document.addEventListener('submit', (event) => {
  if (event.target.id === 'auth-form') {
    event.preventDefault();
    submitAuth(event.target);
  }
});

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

// Refresh "today" when the app comes back to the foreground.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user) render();
});

// ---------- start ----------

render();

if (cloud.isConfigured) {
  cloud.watchUser((user) => {
    stopWatchingCats?.();
    stopWatchingCats = null;
    Object.assign(state, { authReady: true, user, cats: [], catsLoaded: false, loadError: '' });
    if (user) {
      stopWatchingCats = cloud.watchCats(
        user.uid,
        (cats) => {
          state.cats = cats;
          state.catsLoaded = true;
          render();
        },
        (error) => {
          state.loadError = cloud.friendlyError(error);
          render();
        },
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
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
