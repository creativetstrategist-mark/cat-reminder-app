// The parts of the Firebase SDK the app uses. `npm run build:firebase` bundles
// these into app/vendor/firebase.js so the app needs no build step and works offline.
export { initializeApp } from 'firebase/app';
export {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  deleteUser,
} from 'firebase/auth';
export {
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
} from 'firebase/firestore';
