# Cat Reminders 🐾

A friendly, phone-first web app that keeps every cat's deworming and vaccines on time.

- **Accounts:** anyone can sign up with an email and password or a Google account. Each account sees only its own cats, and changes sync to every device you sign in on.
- **A full schedule from a birthday:** add a cat's name and birthday and the app lays out every upcoming **deworming**, **4-in-1 vaccine** and **anti-rabies vaccine** for the next year, grouped by month.
- **Tick it off:** tick each dose when it's done. The next one unlocks, later dates adjust, and there's an Undo. Past doses from the vaccine card can be added too, with the vet's next date if they gave one.
- **Google Calendar reminders:** connect Google Calendar once and every scheduled dose gets an event with a reminder the day before and on the day (9 am). Ticking a dose off removes its reminder, so you're only nagged about what isn't done.
- **Cat-face avatars** in eight coat colours, and it works offline and installs to your home screen.

## Default schedules

These follow common vet guidelines. Your vet may adjust them for your cat.

| | Kittens | After that |
|---|---|---|
| **Deworming** | Every 2 weeks from 2 to 8 weeks old, then every month until 6 months old | Every 3 months (every month if the cat goes outside) |
| **4-in-1 vaccine** | First shot at 8 weeks, then every 4 weeks until at least 16 weeks old (usually 3 shots). Cats first vaccinated after 16 weeks get 2 shots, 4 weeks apart | Booster 1 year after the first set of shots, then every year |
| **Anti-rabies vaccine** | First shot at 12 weeks | Booster 1 year later, then every year |

If a cat has nothing recorded and is already past the usual age for a first dose (for example, an adult you just adopted), the app shows it as due now.

## How Google Calendar reminders work

- The app asks Google for permission to **create and manage its own calendars only** (`calendar.app.created`). It makes a calendar called “Cat Reminders 🐾” and can't see or change any other events.
- Each scheduled dose for the next 12 months becomes a 9:00–9:30 event in that calendar, with pop-up reminders the day before and at the time.
- The app keeps the calendar in step whenever you change something: ticking a dose deletes its event, moves later ones if needed, and adds the next. Deleting a cat removes its events.
- Google's permission lasts about an hour. When it runs out, the next tap that changes the schedule asks Google again (usually a quick flash of a Google window), or the app shows an **Update** button.
- **Disconnect** (Account page) deletes the “Cat Reminders 🐾” calendar.
- Until Google reviews the app, people connecting their calendar see a “Google hasn't verified this app” screen (tap **Advanced**, then continue), and at most 100 people can connect. Getting verified needs a privacy policy page and Google's review.

## Setting up Firebase (one time)

Accounts and cats are stored in [Firebase](https://firebase.google.com), Google's app platform. The free plan is plenty for this app.

1. **Create a project** in the [Firebase console](https://console.firebase.google.com). Google Analytics isn't needed.
2. **Register a web app** (the `</>` icon) and paste its `firebaseConfig` into [`app/js/firebase-config.js`](app/js/firebase-config.js). These values are not secret.
3. **Turn on sign-in:** Security → Authentication → Sign-in method: enable **Email/Password** and **Google**. Under **Settings → Authorized domains**, add `creativetstrategist-mark.github.io`.
4. **Create the database:** Databases & Storage → Firestore → Create database, in production mode.
5. **Publish the rules:** in Firestore's **Rules** tab, replace everything with [`firestore.rules`](firestore.rules) and click **Publish**. Do this again whenever `firestore.rules` changes.

## Setting up Google Calendar (one time)

All in the [Google Cloud console](https://console.cloud.google.com) for the same project (`cat-reminders`):

1. **Turn on the Calendar API:** open [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=cat-reminders) and click **Enable**.
2. **Allow the website:** open [Credentials](https://console.cloud.google.com/apis/credentials?project=cat-reminders), click the OAuth client named **Web client (auto created by Google Service)**, add `https://creativetstrategist-mark.github.io` under **Authorized JavaScript origins**, and click **Save**.
3. **Copy its Client ID** (ends in `.apps.googleusercontent.com`) into `googleCalendarClientId` in [`app/js/firebase-config.js`](app/js/firebase-config.js).
4. **Let people in:** in [Google Auth Platform → Audience](https://console.cloud.google.com/auth/audience?project=cat-reminders), if the status is **Testing**, click **Publish app**. Otherwise only test users you list there can connect.

## Using it on your phone

Open **https://creativetstrategist-mark.github.io/cat-reminder-app/** and create an account, then add it to your home screen:

- **iPhone (Safari):** tap Share, then **Add to Home Screen**.
- **Android (Chrome):** tap the ⋮ menu, then **Add to Home screen** or **Install app**.

In the Google Calendar app, make sure the “Cat Reminders 🐾” calendar is switched on (Settings) so its reminders show.

## Publishing

GitHub Pages is set to **GitHub Actions** (Settings → Pages). Every push to `main` runs the tests and publishes `app/`.

## For developers

No build step for the app itself: plain HTML, CSS and JavaScript modules in [`app/`](app/). The Firebase SDK is bundled once into `app/vendor/firebase.js` and the Nunito font is in `app/fonts/`, so the app also opens offline.

| File | What it does |
|---|---|
| `app/js/schedule.js` | The schedule rules: when each dose is due |
| `app/js/calendar-plan.js` | Each cat's generated schedule, and which calendar events to add, move or delete |
| `app/js/calendar.js` | Google sign-in for the calendar, and the Google Calendar API |
| `app/js/dates.js` | Date maths on `YYYY-MM-DD` strings |
| `app/js/cloud.js` | Accounts and saving with Firebase |
| `app/js/store.js` | Checking cat data and backup files |
| `app/js/art.js` | Cat faces and icons (SVG) |
| `app/js/app.js` | Screens, forms, ticking and calendar syncing |
| `app/js/firebase-config.js` | Which Firebase project and Google client to use |
| `firestore.rules` | Who can read and write what in the database |
| `app/sw.js` | Offline support |

Data lives at `users/{user id}` (the account's calendar settings) and `users/{user id}/cats/{cat id}` (one document per cat, with its doses inside).

Install the tools (Node 20 or newer; the database tests also need Java 11 or newer):

```bash
npm install
```

Run the schedule, calendar-planning and data tests:

```bash
npm test
```

Run the database security rules tests (starts a local Firestore emulator):

```bash
npm run test:rules
```

Try the app with throwaway local accounts. Start the Firebase emulators:

```bash
npm run emulators
```

Then, in a second terminal, serve the app and open http://localhost:8000/?emulator:

```bash
python3 -m http.server 8000 --directory app
```

To update the Firebase SDK, change the `firebase` version in `package.json`, run `npm install`, then:

```bash
npm run build:firebase
```

When you change any file in `app/`, bump `CACHE` in `app/sw.js` (for example `cat-reminders-v4`) so installed copies pick up the change offline too.
