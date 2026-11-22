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

test('everything outside users/{id}/cats is closed', async () => {
  await assertFails(setDoc(doc(alice(), 'users/alice'), { name: 'Alice' }));
  await assertFails(setDoc(doc(alice(), 'cats/cat-1'), validCat()));
  await assertFails(getDocs(collection(alice(), 'users')));
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
    validCat({ notes: 'x'.repeat(1001) }),
    validCat({ records: 'none' }),
    validCat({ updatedAt: new Date('2020-01-01') }),
    validCat({ isAdmin: true }),
  ];
  for (const cat of bad) await assertFails(setDoc(aliceCat(db), cat));

  const { records, ...noRecords } = validCat();
  await assertFails(setDoc(aliceCat(db), noRecords));
});
