# Cat Reminders

A phone-friendly web app that keeps track of deworming and vaccines for all your cats.

- Add as many cats as you like. Each cat has its own schedule and its own list of what has already been given.
- The app works out when the next **deworming**, **4-in-1 vaccine** and **anti-rabies vaccine** are due from the cat's birthday and its records.
- The home screen shows everything overdue or due in the next 30 days, across all cats.
- If your vet writes a next date on the vaccine card, enter it with the record and the app uses that date instead.
- Works offline and can be added to your phone's home screen.

## Default schedules

These follow common vet guidelines. Your vet may adjust them for your cat.

| | Kittens | After that |
|---|---|---|
| **Deworming** | Every 2 weeks from 2 to 8 weeks old, then every month until 6 months old | Every 3 months (every month if the cat goes outside) |
| **4-in-1 vaccine** | First shot at 8 weeks, then every 4 weeks until at least 16 weeks old (usually 3 shots). Cats first vaccinated after 16 weeks get 2 shots, 4 weeks apart | Booster 1 year after the first set of shots, then every year |
| **Anti-rabies vaccine** | First shot at 12 weeks | Booster 1 year later, then every year |

If a cat has nothing recorded and is already past the usual age for a first dose (for example, an adult you just adopted), the app shows it as due now.

## Using it on your phone

Once GitHub Pages is on (see below), open **https://creativetstrategist-mark.github.io/cat-reminder-app/** on your phone:

- **iPhone (Safari):** tap Share, then **Add to Home Screen**.
- **Android (Chrome):** tap the ⋮ menu, then **Add to Home screen** or **Install app**.

### Where your data lives

Everything is saved on the phone itself, not on a server, so nothing about your cats leaves your device. That also means:

- Each phone or browser has its own separate list.
- Clearing your browser's data for the site deletes your cats. Use **Download backup** now and then, and **Restore from backup** to move everything to a new phone.

## Turning on GitHub Pages

1. In this repository on GitHub, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Every change pushed to `main` is then tested and published automatically.

## For developers

No build step and no dependencies: plain HTML, CSS and JavaScript modules in [`app/`](app/).

| File | What it does |
|---|---|
| `app/js/schedule.js` | The schedule rules: when each dose is due |
| `app/js/dates.js` | Date maths on `YYYY-MM-DD` strings |
| `app/js/store.js` | Saving to the browser and backup files |
| `app/js/app.js` | Screens, forms and buttons |
| `app/sw.js` | Offline support |

Run the tests (Node 20 or newer):

```bash
npm test
```

Run the app locally, then open http://localhost:8000:

```bash
python3 -m http.server 8000 --directory app
```

When you change any file in `app/`, bump `CACHE` in `app/sw.js` (for example `cat-reminders-v2`) so installed copies pick up the change offline too.
