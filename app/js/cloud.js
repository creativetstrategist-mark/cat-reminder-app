// Accounts and cat storage, using Firebase Authentication and Cloud Firestore.
// Each account's cats live at users/{user id}/cats/{cat id}; firestore.rules
// makes sure nobody else can read or change them.

import {
  initializeApp,
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  deleteUser,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocs,
  serverTimestamp,
  terminate,
  clearIndexedDbPersistence,
} from '../vendor/firebase.js';
import { firebaseConfig } from './firebase-config.js';
import { normalizeCat } from './store.js';

// For local testing only: open the app at http://localhost:…/?emulator while
// `npm run emulators` is running to use throwaway local accounts and data.
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
export const useEmulators = isLocal && new URLSearchParams(location.search).has('emulator');

const EMULATOR_CONFIG = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-cat-reminders.firebaseapp.com',
  projectId: 'demo-cat-reminders',
  appId: 'demo-app',
};

const config = useEmulators ? EMULATOR_CONFIG : firebaseConfig;
export const isConfigured = Boolean(config);

let auth;
let db;

if (isConfigured) {
  const app = initializeApp(config);
  auth = getAuth(app);
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}

const catsOf = (uid) => collection(db, 'users', uid, 'cats');
const settingsOf = (uid) => doc(db, 'users', uid);
const photosOf = (uid) => collection(db, 'users', uid, 'photos');

/** Calls back with the signed-in user, or null, now and whenever it changes. */
export function watchUser(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Calls back with the user's cats now and whenever they change, on any device.
 * `fromServer` is false while the list may only be this device's saved copy.
 */
export function watchCats(uid, onCats, onError) {
  return onSnapshot(
    catsOf(uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      const cats = [];
      for (const snap of snapshot.docs) {
        try {
          cats.push(normalizeCat({ ...snap.data(), id: snap.id }));
        } catch (error) {
          console.warn(`Skipping unreadable cat ${snap.id}:`, error.message);
        }
      }
      onCats(cats, { fromServer: !snapshot.metadata.fromCache });
    },
    onError,
  );
}

/** Saves a cat. Resolves once the server has it; while offline it is queued and syncs later. */
export function saveCat(uid, cat) {
  const { id, ...fields } = cat;
  return setDoc(doc(catsOf(uid), id), { ...fields, updatedAt: serverTimestamp() });
}

export function removeCat(uid, catId) {
  return deleteDoc(doc(catsOf(uid), catId));
}

/** Calls back with the account's settings ({} if none) now and whenever they change. */
export function watchSettings(uid, onSettings, onError) {
  return onSnapshot(
    settingsOf(uid),
    (snap) => {
      const data = snap.data() ?? {};
      onSettings({
        calendarId: typeof data.calendarId === 'string' ? data.calendarId : '',
        calendarEmail: typeof data.calendarEmail === 'string' ? data.calendarEmail : '',
      });
    },
    onError,
  );
}

/** Calls back with a Map of cat id → photo (a data: URL) now and whenever they change. */
export function watchPhotos(uid, onPhotos, onError) {
  return onSnapshot(
    photosOf(uid),
    (snapshot) => {
      const photos = new Map();
      for (const snap of snapshot.docs) {
        const { dataUrl } = snap.data();
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) photos.set(snap.id, dataUrl);
      }
      onPhotos(photos);
    },
    onError,
  );
}

export function savePhoto(uid, catId, dataUrl) {
  return setDoc(doc(photosOf(uid), catId), { dataUrl, updatedAt: serverTimestamp() });
}

export function removePhoto(uid, catId) {
  return deleteDoc(doc(photosOf(uid), catId));
}

export function saveSettings(uid, { calendarId = '', calendarEmail = '' }) {
  return setDoc(settingsOf(uid), { calendarId, calendarEmail, updatedAt: serverTimestamp() });
}

export const signUp = (email, password) => createUserWithEmailAndPassword(auth, email, password);
export const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);
export const signInWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());

/** Signs out, clears this account's data from the device, and reloads at the home screen. */
export async function signOut() {
  await firebaseSignOut(auth);
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // Another tab still has the data open; it is cleared next time.
  }
  // Drop the #/… part so the next person to sign in starts at home, not on this account's page.
  location.replace(location.pathname + location.search);
}

/** Firebase only lets an account be deleted within a few minutes of signing in. */
export function signedInRecently(user, minutes = 5) {
  const last = Date.parse(user.metadata.lastSignInTime ?? '');
  return Number.isFinite(last) && Date.now() - last < minutes * 60_000;
}

/** Deletes all of the user's cats, photos and settings, then the account itself. */
export async function deleteAccount(user) {
  const [cats, photos] = await Promise.all([getDocs(catsOf(user.uid)), getDocs(photosOf(user.uid))]);
  const batch = writeBatch(db);
  [...cats.docs, ...photos.docs].forEach((snap) => batch.delete(snap.ref));
  batch.delete(settingsOf(user.uid));
  await batch.commit();
  await deleteUser(user);
  await signOut();
}

const AUTH_MESSAGES = {
  'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/missing-email': 'Enter your email address first.',
  'auth/missing-password': 'Enter your password.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/email-already-in-use': 'There is already an account with this email. Sign in instead.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Can’t reach the server. Check your internet connection.',
  'auth/popup-blocked': 'The Google sign-in window was blocked. Allow pop-ups for this site and try again.',
  'auth/account-exists-with-different-credential': 'This email already has an account. Sign in with your password instead.',
  'auth/requires-recent-login': 'For your security, sign out, sign in again, then try once more.',
  'auth/operation-not-allowed': 'This sign-in method isn’t turned on for the app yet.',
  'auth/unauthorized-domain': 'This website isn’t allowed to sign in yet. Add it under Authentication → Settings → Authorized domains.',
};

/** A message people can act on, for a Firebase error. */
export function friendlyError(error) {
  return AUTH_MESSAGES[error?.code] ?? error?.message ?? 'Something went wrong. Please try again.';
}

/** True for errors that mean the person simply closed the Google window. */
export const isCancelled = (error) =>
  error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request';
