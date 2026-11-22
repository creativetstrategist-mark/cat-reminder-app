// Your Firebase project's web app settings, from the Firebase console:
// Project settings → General → Your apps → SDK setup and configuration → Config.
//
// These values are not secret. They only say which project to talk to; who can
// read and change data is decided by firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyDhyLKZTGvad4_6NkfoN0nymfLcbmuDwwQ',
  authDomain: 'cat-reminders.firebaseapp.com',
  projectId: 'cat-reminders',
  storageBucket: 'cat-reminders.firebasestorage.app',
  messagingSenderId: '631565757918',
  appId: '1:631565757918:web:cfeedbd30ca2825aa9814f',
  measurementId: 'G-3Z7E049MN7',
};

// The Google sign-in "Web client ID" used to connect Google Calendar. Find it in
// Firebase: Authentication → Sign-in method → Google → Web SDK configuration.
// While this is null, the Google Calendar option is hidden.
export const googleCalendarClientId = '631565757918-u9ototf6vh8tvu5ok4omajpspupfm5fu.apps.googleusercontent.com';
