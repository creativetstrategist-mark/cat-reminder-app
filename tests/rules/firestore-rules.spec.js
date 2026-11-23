// Checks firestore.rules against the Firestore emulator. Run with `npm run test:rules`.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cat-reminders',
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

const validCat = (extra = {}) => ({
  name: 'Mochi',
  birthDate: '2026-09-10',
  sex: 'female',
  outdoor: false,
  coat: 'calico',
  notes: '',
  records: [{ id: 'r1', type: 'deworm', date: '2026-09-24', product: '', notes: '', nextDue: '' }],
  updatedAt: serverTimestamp(),
  ...extra,
});

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const guest = () => env.unauthenticatedContext().firestore();
const aliceCat = (db) => doc(db, 'users/alice/cats/cat-1');

async function seedAliceCat() {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'users/alice/cats/cat-1'), { ...validCat(), updatedAt: new Date() }),
  );
}

test('a user can add, read, update and delete their own cats', async () => {
  const db = alice();
  await assertSucceeds(setDoc(aliceCat(db), validCat()));
  await assertSucceeds(getDoc(aliceCat(db)));
  await assertSucceeds(getDocs(collection(db, 'users/alice/cats')));
  await assertSucceeds(setDoc(aliceCat(db), validCat({ name: 'Mochi Jr' })));
  await assertSucceeds(deleteDoc(aliceCat(db)));
});

test("a user cannot read or list another user's cats", async () => {
  await seedAliceCat();
  await assertFails(getDoc(aliceCat(bob())));
  await assertFails(getDocs(collection(bob(), 'users/alice/cats')));
});

test("a user cannot add, change or delete another user's cats", async () => {
  await seedAliceCat();
  await assertFails(setDoc(aliceCat(bob()), validCat({ name: 'Stolen' })));
  await assertFails(setDoc(doc(bob(), 'users/alice/cats/cat-2'), validCat()));
  await assertFails(deleteDoc(aliceCat(bob())));
});

test('signed-out visitors cannot read or write anything', async () => {
  await seedAliceCat();
  await assertFails(getDoc(aliceCat(guest())));
  await assertFails(setDoc(doc(guest(), 'users/guest/cats/cat-1'), validCat()));
});

test('everything outside users/{id} and its cats is closed', async () => {
  await assertFails(setDoc(doc(alice(), 'cats/cat-1'), validCat()));
  await assertFails(setDoc(doc(alice(), 'users/alice/other/thing'), { a: 1 }));
  await assertFails(getDocs(collection(alice(), 'users')));
});

const settings = (extra = {}) => ({ calendarId: 'abc@group.calendar.google.com', calendarEmail: 'alice@gmail.com', updatedAt: serverTimestamp(), ...extra });

test('a user can save, read and clear their own calendar settings', async () => {
  const ref = doc(alice(), 'users/alice');
  await assertSucceeds(setDoc(ref, settings()));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(deleteDoc(ref));
});

test("a user cannot read or change another user's settings", async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users/alice'), { ...settings(), updatedAt: new Date() }));
  await assertFails(getDoc(doc(bob(), 'users/alice')));
  await assertFails(setDoc(doc(bob(), 'users/alice'), settings()));
  await assertFails(deleteDoc(doc(bob(), 'users/alice')));
  await assertFails(getDoc(doc(guest(), 'users/alice')));
});

test('badly formed settings are rejected', async () => {
  const ref = doc(alice(), 'users/alice');
  await assertFails(setDoc(ref, settings({ isAdmin: true })));
  await assertFails(setDoc(ref, settings({ calendarId: 42 })));
  await assertFails(setDoc(ref, settings({ calendarId: 'x'.repeat(301) })));
  await assertFails(setDoc(ref, settings({ updatedAt: new Date('2020-01-01') })));
});

const photo = (extra = {}) => ({ dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', updatedAt: serverTimestamp(), ...extra });

test("a user can save, read and delete their own cats' photos", async () => {
  const ref = doc(alice(), 'users/alice/photos/cat-1');
  await assertSucceeds(setDoc(ref, photo()));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(getDocs(collection(alice(), 'users/alice/photos')));
  await assertSucceeds(deleteDoc(ref));
});

test("a user cannot see or change another user's photos", async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users/alice/photos/cat-1'), { ...photo(), updatedAt: new Date() }));
  await assertFails(getDoc(doc(bob(), 'users/alice/photos/cat-1')));
  await assertFails(getDocs(collection(bob(), 'users/alice/photos')));
  await assertFails(setDoc(doc(bob(), 'users/alice/photos/cat-1'), photo()));
  await assertFails(deleteDoc(doc(bob(), 'users/alice/photos/cat-1')));
  await assertFails(getDoc(doc(guest(), 'users/alice/photos/cat-1')));
});

test('photos must be small JPEG, PNG or WebP images', async () => {
  const ref = doc(alice(), 'users/alice/photos/cat-1');
  await assertFails(setDoc(ref, photo({ dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })));
  await assertFails(setDoc(ref, photo({ dataUrl: 'https://example.com/cat.jpg' })));
  await assertFails(setDoc(ref, photo({ dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(300000) })));
  await assertFails(setDoc(ref, photo({ caption: 'hi' })));
  await assertFails(setDoc(ref, photo({ updatedAt: new Date('2020-01-01') })));
});

test('badly formed cats are rejected', async () => {
  const db = alice();
  const bad = [
    validCat({ name: '' }),
    validCat({ name: 'x'.repeat(61) }),
    validCat({ name: 42 }),
    validCat({ birthDate: 'yesterday' }),
    validCat({ sex: 'unknown' }),
    validCat({ outdoor: 'yes' }),
    validCat({ coat: 7 }),
    validCat({ coat: 'x'.repeat(21) }),
    validCat({ notes: 'x'.repeat(1001) }),
    validCat({ records: 'none' }),
    validCat({ updatedAt: new Date('2020-01-01') }),
    validCat({ isAdmin: true }),
  ];
  for (const cat of bad) await assertFails(setDoc(aliceCat(db), cat));

  const { records, ...noRecords } = validCat();
  await assertFails(setDoc(aliceCat(db), noRecords));
});
