// Google Calendar: connecting with Google Identity Services, and keeping a
// "Cat Reminders" calendar in step with the cats' schedules.
//
// The app asks only for permission to manage calendars it creates itself
// (calendar.app.created), so it can never see or change anyone's other events.

import { googleCalendarClientId } from './firebase-config.js';
import { useEmulators } from './cloud.js';
import { desiredEvents, planSync } from './calendar-plan.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
// "email" lets the app show which Google account the calendar is in.
const SCOPES = `${SCOPE} email`;
const API = 'https://www.googleapis.com/calendar/v3';
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GIS_URL = 'https://accounts.google.com/gsi/client';

// Local testing (?emulator) uses a stand-in Google, so it needs no real client ID.
const clientId = googleCalendarClientId ?? (useEmulators ? 'emulator-test-client' : null);
export const isAvailable = Boolean(clientId);

export class CalendarError extends Error {
  constructor(status, message, reason = '') {
    super(message || `Google Calendar error ${status}`);
    this.status = status;
    this.reason = reason;
  }
}

// ---------- signing in to Google ----------

let gisLoading = null;
let tokenClient = null;
let token = null; // { value, expiresAt }
let tokenKey = '';

/** Loads Google's sign-in script ahead of time, so a tap can open the Google window straight away. */
export function preload() {
  if (!isAvailable) return Promise.resolve();
  gisLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_URL;
    script.async = true;
    script.onload = () => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: () => {},
      });
      resolve();
    };
    script.onerror = () => {
      gisLoading = null;
      reject(new CalendarError(0, 'Couldn’t reach Google. Check your internet connection.'));
    };
    document.head.append(script);
  });
  return gisLoading;
}

/** Remembers the token for this tab and account, so reloading the page doesn't ask again. */
export function useAccount(uid) {
  tokenKey = `cat-reminders-gcal:${uid}`;
  token = null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(tokenKey) ?? 'null');
    if (saved?.expiresAt > Date.now()) token = saved;
  } catch {
    /* no saved token */
  }
}

export function hasToken() {
  return Boolean(token && token.expiresAt - Date.now() > 60_000);
}

function forgetToken() {
  token = null;
  try {
    sessionStorage.removeItem(tokenKey);
  } catch {
    /* ignore */
  }
}

/**
 * Asks Google for permission. Call this straight from a tap or click: it may
 * open Google's window, which browsers only allow right after a tap.
 * `consent` shows the full permission screen (first connection).
 */
export function requestAccess({ consent = false, hint = '' } = {}) {
  if (!tokenClient) return Promise.reject(new CalendarError(0, 'Google is still loading. Try again in a moment.'));
  return new Promise((resolve, reject) => {
    tokenClient.callback = (response) => {
      if (response.error) return reject(new CalendarError(0, 'Google didn’t give permission.', response.error));
      if (!window.google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) {
        return reject(new CalendarError(0, 'To get reminders, tick the box that lets Cat Reminders manage its own calendar.', 'scope_denied'));
      }
      token = { value: response.access_token, expiresAt: Date.now() + Number(response.expires_in ?? 3600) * 1000 };
      try {
        sessionStorage.setItem(tokenKey, JSON.stringify(token));
      } catch {
        /* ignore */
      }
      resolve();
    };
    tokenClient.error_callback = (error) => {
      reject(new CalendarError(0, error?.type === 'popup_closed' ? '' : 'The Google window didn’t open. Allow pop-ups for this site and try again.', error?.type));
    };
    tokenClient.requestAccessToken({ prompt: consent ? 'consent' : '', login_hint: hint || undefined });
  });
}

/** Forgets this tab's Google permission (used when signing out). */
export function forget() {
  forgetToken();
}

export function revokeAccess() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.value, () => {});
  forgetToken();
}

// ---------- Calendar API ----------

async function api(path, { method = 'GET', body } = {}) {
  if (!hasToken()) throw new CalendarError(401, 'Google sign-in expired.', 'authError');
  let response;
  try {
    response = await fetch(path.startsWith('https://') ? path : API + path, {
      method,
      headers: { Authorization: `Bearer ${token.value}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new CalendarError(0, 'Couldn’t reach Google Calendar. Check your internet connection.', 'network');
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data?.error?.errors?.[0]?.reason ?? data?.error?.status ?? '';
    if (response.status === 401) forgetToken();
    throw new CalendarError(response.status, data?.error?.message, reason);
  }
  return data;
}

const calendarPath = (calendarId) => `/calendars/${encodeURIComponent(calendarId)}`;

export async function createCalendar(timeZone) {
  const calendar = await api('/calendars', {
    method: 'POST',
    body: {
      summary: 'Cat Reminders 🐾',
      description: 'Deworming and vaccine reminders from the Cat Reminders app. Ticking a dose off in the app removes its reminder here.',
      timeZone,
    },
  });
  return calendar.id;
}

/** True if the calendar still exists (the person may have deleted it in Google Calendar). */
export async function calendarExists(calendarId) {
  try {
    await api(calendarPath(calendarId));
    return true;
  } catch (error) {
    if (error.status === 404 || error.status === 403) return false;
    throw error;
  }
}

export async function deleteCalendar(calendarId) {
  try {
    await api(calendarPath(calendarId), { method: 'DELETE' });
  } catch (error) {
    if (error.status !== 404 && error.status !== 410) throw error;
  }
}

async function listEvents(calendarId) {
  const events = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ maxResults: '2500', showDeleted: 'false', fields: 'items(id,extendedProperties),nextPageToken' });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await api(`${calendarPath(calendarId)}/events?${query}`);
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return events;
}

/** Runs `tasks` a few at a time. */
async function runAll(tasks, limit = 4) {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await queue.shift()();
  });
  await Promise.all(workers);
}

/** Makes the calendar match the cats' schedules. Returns how many events changed. */
export async function syncCalendar(calendarId, cats, { today, timeZone, appUrl }) {
  const desired = desiredEvents(cats, today, { timeZone, appUrl });
  const existing = await listEvents(calendarId);
  const { toCreate, toUpdate, toDelete } = planSync(desired, existing);
  const events = `${calendarPath(calendarId)}/events`;
  await runAll([
    ...toDelete.map((id) => () =>
      api(`${events}/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((error) => {
        if (error.status !== 404 && error.status !== 410) throw error;
      })),
    ...toUpdate.map(({ id, body }) => () => api(`${events}/${encodeURIComponent(id)}`, { method: 'PUT', body })),
    ...toCreate.map((body) => () => api(events, { method: 'POST', body })),
  ]);
  return toCreate.length + toUpdate.length + toDelete.length;
}

/** The Google account's email, to show which calendar the app is using. */
export async function accountEmail() {
  try {
    const info = await api(USERINFO);
    return typeof info?.email === 'string' ? info.email : '';
  } catch {
    return '';
  }
}

/** A message people can act on, for a calendar error. */
export function friendlyCalendarError(error) {
  if (!error) return '';
  if (error.reason === 'accessNotConfigured' || error.reason === 'SERVICE_DISABLED') {
    return 'Google Calendar isn’t switched on for this app yet (the Calendar API needs enabling in Google Cloud).';
  }
  if (error.status === 401) return 'Your Google sign-in expired. Tap “Update Google Calendar” to carry on.';
  if (error.status === 429 || error.reason === 'rateLimitExceeded') return 'Google Calendar is busy. Try again in a minute.';
  return error.message || 'Something went wrong with Google Calendar.';
}
