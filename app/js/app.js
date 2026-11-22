import { TYPES, TYPE_INFO, nextDue, dueStatus, upcoming, doseLabels, dueList, mostUrgent } from './schedule.js';
import { todayISO, formatDate, ageText, isValidDate } from './dates.js';
import { loadState, saveState, exportState, parseBackup, newId } from './store.js';

let state = loadState();

const app = document.getElementById('app');
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

function persist() {
  try {
    saveState(state);
    return true;
  } catch (error) {
    alert(`Could not save on this device: ${error.message}`);
    return false;
  }
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

// ---------- views ----------

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

function backupSection() {
  return `
    <section class="card backup">
      <h2>Backup</h2>
      <p class="muted">Your cats are saved on this device only. Download a backup now and then, and use it to move everything to a new phone.</p>
      <div class="row">
        <button class="btn" data-action="export"${state.cats.length ? '' : ' disabled'}>Download backup</button>
        <button class="btn ghost" data-action="import">Restore from backup</button>
      </div>
    </section>
    <p class="disclaimer">Default schedules follow common vet guidelines. Your vet knows your cat best, so enter the dates they give you when you have them.</p>`;
}

function homeView(today) {
  if (state.cats.length === 0) {
    return `
      <section class="empty card">
        <img src="icons/icon.svg" alt="" width="72" height="72">
        <h1>Keep every cat's shots on time</h1>
        <p class="muted">Add your cats and the app works out when deworming, the 4-in-1 vaccine and the anti-rabies vaccine are due.</p>
        <button class="btn primary" data-action="add-cat">Add your first cat</button>
      </section>
      ${backupSection()}`;
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
    ${backupSection()}`;
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
                    record.nextDue && `Vet's next date: ${esc(formatDate(record.nextDue))}`,
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
  const noRecords = (cat.records ?? []).length === 0;

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
        <p><strong>Already had shots or deworming?</strong> Add them from the vaccine card so ${esc(cat.name)}'s schedule is right.</p>
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

function currentRoute() {
  const match = location.hash.match(/^#\/cat\/(.+)$/);
  return match ? { view: 'cat', id: decodeURIComponent(match[1]) } : { view: 'home' };
}

function render() {
  const today = todayISO();
  const route = currentRoute();
  if (route.view === 'cat') {
    const cat = findCat(route.id);
    if (!cat) {
      location.replace('#/');
      return;
    }
    app.innerHTML = catView(cat, today);
    document.title = `${cat.name} · Cat Reminders`;
  } else {
    app.innerHTML = homeView(today);
    document.title = 'Cat Reminders';
  }
}

// ---------- forms ----------

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
    Object.assign(existing, fields);
  } else {
    const cat = { id: newId(), ...fields, records: [] };
    state.cats.push(cat);
    location.hash = `#/cat/${encodeURIComponent(cat.id)}`;
  }
  persist();
  catDialog.close();
  render();
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
  if (date < cat.birthDate) return showError(recordForm, `The date cannot be before ${cat.name}'s birthday.`);
  if (nextDueDate && nextDueDate <= date) return showError(recordForm, "The vet's next date must be after the date given.");

  const fields = {
    type: recordFields.type.value,
    date,
    product: recordFields.product.value.trim(),
    notes: recordFields.notes.value.trim(),
    nextDue: nextDueDate,
  };
  const existing = editing.recordId && cat.records.find((r) => r.id === editing.recordId);
  if (existing) Object.assign(existing, fields);
  else cat.records.push({ id: newId(), ...fields });
  persist();
  recordDialog.close();
  render();
});

recordDialog.querySelector('#record-delete').addEventListener('click', () => {
  const cat = findCat(editing.catId);
  const record = cat?.records.find((r) => r.id === editing.recordId);
  if (!record) return;
  if (!confirm(`Delete the ${TYPE_INFO[record.type].name.toLowerCase()} record from ${formatDate(record.date)}?`)) return;
  cat.records = cat.records.filter((r) => r.id !== record.id);
  persist();
  recordDialog.close();
  render();
});

for (const dialog of [catDialog, recordDialog]) {
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) dialog.close();
  });
}

// ---------- backup ----------

function downloadBackup() {
  const blob = new Blob([exportState(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cat-reminders-backup-${todayISO()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;
  try {
    const restored = parseBackup(await file.text());
    const message = state.cats.length
      ? `Replace the ${plural(state.cats.length, 'cat')} on this device with the ${plural(restored.cats.length, 'cat')} in the backup?`
      : `Restore ${plural(restored.cats.length, 'cat')} from the backup?`;
    if (!confirm(message)) return;
    state = restored;
    persist();
    location.hash = '#/';
    render();
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

  if (action === 'add-cat') openCatDialog();
  else if (action === 'edit-cat' && cat) openCatDialog(cat);
  else if (action === 'log' && cat) openRecordDialog(cat, { type: button.dataset.type });
  else if (action === 'edit-record' && cat) {
    const record = cat.records.find((r) => r.id === button.dataset.record);
    if (record) openRecordDialog(cat, { record });
  } else if (action === 'delete-cat' && cat) {
    if (!confirm(`Delete ${cat.name} and all of ${cat.name}'s records? This cannot be undone.`)) return;
    state.cats = state.cats.filter((c) => c.id !== cat.id);
    persist();
    location.hash = '#/';
    render();
  } else if (action === 'export') downloadBackup();
  else if (action === 'import') importInput.click();
});

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

// Refresh "today" when the app comes back to the foreground.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});

render();

// Ask the browser not to clear our data when space runs low.
navigator.storage?.persist?.().catch(() => {});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
