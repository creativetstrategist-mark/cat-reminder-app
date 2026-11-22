# Cat Reminders

A phone-friendly web app that keeps track of deworming and vaccines for your cats.

- Anyone can create an account with an email and password, or with their Google account.
- Each account sees only its own cats. Cats are saved to the account, so they show up on every phone or computer you sign in on, and changes sync straight away.
- Add as many cats as you like. Each cat has its own schedule and its own list of what has already been given.
- The app works out when the next **deworming**, **4-in-1 vaccine** and **anti-rabies vaccine** are due from the cat's birthday and its records.
- The home screen shows everything overdue or due in the next 30 days, across all your cats.
- If your vet writes a next date on the vaccine card, enter it with the record and the app uses that date instead.
- Works offline (changes sync when you're back online) and can be added to your phone's home screen.

## Default schedules

These follow common vet guidelines. Your vet may adjust them for your cat.

| | Kittens | After that |
|---|---|---|
| **Deworming** | Every 2 weeks from 2 to 8 weeks old, then every month until 6 months old | Every 3 months (every month if the cat goes outside) |
| **4-in-1 vaccine** | First shot at 8 weeks, then every 4 weeks until at least 16 weeks old (usually 3 shots). Cats first vaccinated after 16 weeks get 2 shots, 4 weeks apart | Booster 1 year after the first set of shots, then every year |
| **Anti-rabies vaccine** | First shot at 12 weeks | Booster 1 year later, then every year |

If a cat has nothing recorded and is already past the usual age for a first dose (for example, an adult you just adopted), the app shows it as due now.

## Setting up Firebase (one time)

Accounts and cats are stored in [Firebase](https://firebase.google.com), Google's app platform. The free plan is plenty for this app.

1. **Create a project.** Go to the [Firebase console](https://console.firebase.google.com), click **Create a project**, give it a name (for example `cat-reminders`) and finish. Google Analytics isn't needed.
2. **Register the web app.** On the project's home page, click the **Web** icon (`</>`), give it a nickname, and click **Register app** (leave Firebase Hosting unticked). Copy the `firebaseConfig = { … }` block it shows and paste it into [`app/js/firebase-config.js`](app/js/firebase-config.js) in place of `null`. These values are not secret.
3. **Turn on sign-in.** Go to **Build → Authentication → Get started**. Under **Sign-in method**, enable **Email/Password**, then add **Google** and enable it (pick a support email).
4. **Allow the website.** Still in Authentication, open **Settings → Authorized domains**, click **Add domain**, and add `creativetstrategist-mark.github.io`.
5. **Create the database.** Go to **Build → Firestore Database → Create database**. Pick a location near you (it can't be changed later) and start in **production mode**.
6. **Protect the data.** In Firestore, open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**. These rules are what stop one account from seeing another's cats.

## Using it on your phone

Once GitHub Pages is on (see below), open **https://creativetstrategist-mark.github.io/cat-reminder-app/** on your phone and create an account:

- **iPhone (Safari):** tap Share, then **Add to Home Screen**.
- **Android (Chrome):** tap the ⋮ menu, then **Add to Home screen** or **Install app**.

## Turning on GitHub Pages

1. In this repository on GitHub, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Every change pushed to `main` is then tested and published automatically.

## For developers

No build step for the app itself: plain HTML, CSS and JavaScript modules in [`app/`](app/). The Firebase SDK is bundled once into `app/vendor/firebase.js` so the app also opens offline.

| File | What it does |
|---|---|
| `app/js/schedule.js` | The schedule rules: when each dose is due |
| `app/js/dates.js` | Date maths on `YYYY-MM-DD` strings |
| `app/js/cloud.js` | Accounts and saving cats with Firebase |
| `app/js/store.js` | Checking cat data and backup files |
| `app/js/app.js` | Screens, forms and buttons |
| `app/js/firebase-config.js` | Which Firebase project to use |
| `firestore.rules` | Who can read and write what in the database |
| `app/sw.js` | Offline support |

Each account's cats are stored at `users/{user id}/cats/{cat id}`, one document per cat with its records inside.

Install the tools (Node 20 or newer; the database tests also need Java 11 or newer):

```bash
npm install
```

Run the schedule and data tests:

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

When you change any file in `app/`, bump `CACHE` in `app/sw.js` (for example `cat-reminders-v3`) so installed copies pick up the change offline too.
