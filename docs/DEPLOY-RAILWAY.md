# Putting the Field Visit Tracker on Railway — step by step

Railway builds the app from your GitHub repository and runs it with a PostgreSQL database.
The project already tells Railway how to build and start it (`railway.json` in the project
folder), so you only set up the pieces below. Allow about 30 minutes the first time.

**Cost:** new accounts get a one-time trial credit for about 30 days. After that you need the
**Hobby plan ($5/month, includes $5 of usage)**; the free plan's $1/month is not enough for an app
plus a database that run all day. Check railway.com/pricing for current prices.

**Data:** the app starts **empty** on Railway (one admin, no staff, no locations). Your demo data
stays on your PC.

---

## Before you start

- The code must be on GitHub (it is: `ayazelahimullick12-droid/Field-Visit-v1.3--Hosting-`, branch
  `main`) and must include the file `railway.json`.
- Have these ready (write them down somewhere safe; never put them in the code):
  - **A long random secret** for `APP_SECRET`. Make one on your PC:
    ```bash
    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
    ```
  - **The first admin's** name, PIN (4–8 digits) and a strong password.

---

## Step 1 — Create a Railway account

1. Go to **railway.com** and click **Login → Login with GitHub**.
2. Allow Railway to use your GitHub account.
3. If Railway asks you to verify your account (for the trial), follow its prompts.

## Step 2 — Create the project from your GitHub repository

1. On the dashboard click **New Project** (or **+ New**).
2. Choose **Deploy from GitHub repo**.
3. If your repository isn't listed, click **Configure GitHub App**, give Railway access to
   `Field-Visit-v1.3--Hosting-` (or "All repositories"), and come back.
4. Pick **Field-Visit-v1.3--Hosting-**.
5. Railway creates a box (a "service") for the app and starts building it straight away.
   **The first build or start will fail — that's expected**: the database and settings aren't
   there yet. Carry on.

## Step 3 — Add the database

1. In the project view (the "canvas"), click **+ Create** (or **New**) → **Database** →
   **Add PostgreSQL**.
2. A second box called **Postgres** appears. Wait until it shows as running (green).

## Step 4 — Add the app's settings (variables)

1. Click the **app's box** (named after the repository — not Postgres).
2. Open the **Variables** tab.
3. Add each of these with **+ New Variable** (name on the left, value on the right):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — type exactly this; Railway links it to the database. (Or use **Add Reference → Postgres → DATABASE_URL**.) |
   | `APP_SECRET` | the long random secret you made |
   | `NODE_ENV` | `production` |
   | `SEED_ADMIN_NAME` | the first admin's name, e.g. `System Admin` |
   | `SEED_ADMIN_PIN` | the first admin's PIN, e.g. `9001` |
   | `SEED_ADMIN_PASSWORD` | a strong password |
   | `UPLOAD_DIR` | `/data/uploads` |
   | `BRANCH_API_URL` | BRAC's branch API address (the list of all branches), from BRAC IT |
   | `BRANCH_API_TOKEN` | the API's access token, from BRAC IT; keep it secret |

   (`APP_URL` comes in step 6, once you have the address.)
4. Railway shows a banner with **Deploy** / **Apply changes** — don't click it yet; do step 5
   first, then deploy once.

## Step 5 — Add a volume for voice notes

Voice notes are saved as files. Railway wipes the app's own disk on every deploy, so they need a
permanent disk (a "volume"). Photos are stored in the database and don't need this.

1. **Right-click the app's box** → **Attach Volume**
   (or press **Ctrl+K** / ⌘K and type "volume").
2. Mount path: `/data/uploads` → confirm. A small disk icon appears on the app's box.
3. Now click **Deploy** (or **Apply changes**) in the banner.

## Step 6 — Give the site a web address

1. Click the app's box → **Settings** → **Networking** → **Generate Domain**.
2. If Railway asks for a port, open the app's **Deploy Logs** and use the number in the line
   `Field Visit Tracker running at http://localhost:XXXX` (Railway normally sets this itself).
3. You get an address like `https://field-visit-v13-hosting-production.up.railway.app`.
4. Back in **Variables**, add:

   | Name | Value |
   |---|---|
   | `APP_URL` | that address, without a trailing `/` |

   and deploy again (it's used for the link at the bottom of emails).

## Step 7 — Check it's running

1. Click the app's box → **Deployments** → the latest one → **View logs**.
2. In **Build Logs** you should see the website and API build finish.
3. In **Deploy Logs** you should see, in order:
   - `All migrations have been successfully applied.` (the tables)
   - `Created the first admin: PIN 9001` (only the first time; later: `An admin already exists`)
   - `Field Visit Tracker running at http://localhost:…`
4. The deployment shows **Active** / green once the health check (`/api/public/health`) answers.

## Step 8 — First sign-in and setup

1. Open your address. On the sign-in page choose **Admin**, enter the PIN and password from
   step 4.
2. **Email settings**: enter the sending account (full email address as the username; an app
   password for Gmail / Microsoft 365) → **Save settings** → **Send test**.
3. **Locations & lists → Sync**: press **Sync now**. Divisions, regions, areas, regional, area and
   branch offices all come from BRAC's branch API (all programmes) and refresh every night at 2 a.m.;
   they can't be edited by hand. Then check **Look-alike spellings** (merge the ones that are one
   place) and set the **Purposes of visit**. If the sync can't reach the API, see "If something
   goes wrong".
4. **Branch offices**: set the visit target (days).
5. **Units**: add units and teams. **Employees**: add staff (or let them create their own
   accounts on the sign-in page).
6. Check the staff side: sign in as a staff member and register a test visit.
7. Voice-note check: add an entry with a voice note, then in Railway **Deployments → ⋮ →
   Redeploy**; the voice note must still play afterwards.

## Demo data (optional)

For showing the app, `npm run db:demo` fills the database from your PC with about six months of
made-up visits to the real offices: client interactions, observations, action items at every
stage, stories, and the emails they would have sent (logged only). It also adds units and teams,
31 demo staff (PINs 51001–51031, emails at example.com), four client rating questions, and turns
the management tabs on. The locations must be loaded first (**Sync now**, step 8).

1. On the Postgres box open **Settings → Networking** and add public access for a few minutes;
   then copy `DATABASE_PUBLIC_URL` from its **Variables** (the eye icon shows the real value).
2. In PowerShell, from the `api` folder (add `?sslmode=disable` to the end of the address if
   it is refused: Railway's database uses its own certificate):

   ```powershell
   $env:DATABASE_URL = "<the DATABASE_PUBLIC_URL you copied>"
   $env:DEMO_PASSWORD = "<a password for all demo staff>"
   npm run db:demo
   Remove-Item Env:DATABASE_URL, Env:DEMO_PASSWORD
   ```

   The first line it prints names the database it writes to; check it is Railway's. It ends
   with the list of PINs. Running it again replaces the demo staff and visits (with dates up
   to that day).
3. Before real use, take the demo out (same first line, then):
   `npm run db:demo -- --remove`. This removes the demo staff, their visits and logged emails.
   Units and settings stay. Then remove the database's public access again.

If the server can't reach the branch API, the locations can be loaded from a saved copy of it
the same way: `npm run build` once, then `npm run db:locations -- path	oranches.json`.
To start completely fresh (every visit, and offices from before the API), use
`npm run db:locations -- --remove-old`, then load the locations again.

---

## Updating the site later

Every `git push` to `main` makes Railway build and deploy the new version by itself; database
changes (migrations) are applied automatically when it starts. Watch **Deployments** for the
result. If a deploy fails, the previous version keeps running.

## Backups

On the Postgres box, open **Backups** (if your plan offers it) and turn on scheduled backups.
You can also copy the database to your PC from the Postgres box's **Connect** tab (it shows a
connection URL to use with `pg_dump`).

## If something goes wrong

| You see | What to do |
|---|---|
| Build log: `npm ci` … *not in sync* | The lock files changed without being committed. Commit `api/package-lock.json` / `web/package-lock.json` and push. |
| Build log: Node version errors | Add the variable `NIXPACKS_NODE_VERSION` = `22` and redeploy. |
| Deploy log: `Can't reach database server` | `DATABASE_URL` isn't linked: set it to `${{Postgres.DATABASE_URL}}` and check the Postgres box is running. |
| Deploy log: `Set APP_SECRET … before starting in production` | Add `APP_SECRET` (step 4). |
| Deploy log: `Set SEED_ADMIN_PASSWORD first` | Add `SEED_ADMIN_PASSWORD` (step 4). |
| Site opens but sign-in doesn't stick | Open the site with `https://` (the address Railway gave you). |
| Voice notes vanish after a deploy | Check the volume is attached at `/data/uploads` and `UPLOAD_DIR` is `/data/uploads`. |
| "Application failed to respond" | Look at Deploy Logs for the first red line; most often a missing variable. |
| Locations → Sync: "not set up yet" | Add `BRANCH_API_URL` and `BRANCH_API_TOKEN` to the app's variables and redeploy. |
| Locations → Sync: failed, "answered 401/403" | The token is wrong or expired: get a new one from BRAC IT. |
| Locations → Sync: failed, timeout or "fetch failed" | The API may only accept BRAC's own network. Ask BRAC IT to allow Railway, or load the locations from a saved copy (see "Demo data"). |
| Locations → Sync: refused | The download was incomplete or much smaller than last time, so nothing was changed. Try again later; if branches really closed in large numbers, the limit is `MAX_DROP` in `api/src/locations/locations.service.ts`. |
| Forgot the admin password | Another admin can set a new one in **Employees → Admin accounts**, so add a second admin early. (Changing `SEED_ADMIN_PASSWORD` later does nothing: it's only used while there is no admin.) |

## Settings reference

| Variable | Needed | What it is |
|---|---|---|
| `DATABASE_URL` | yes | the PostgreSQL connection (link to the Postgres service) |
| `APP_SECRET` | yes | signs sign-in cookies and encrypts the email password; keep it secret and never change it after go-live (everyone would be signed out and the email password would need re-entering) |
| `NODE_ENV` | yes | `production` |
| `SEED_ADMIN_NAME`, `SEED_ADMIN_PIN`, `SEED_ADMIN_PASSWORD` | first start | the first admin, created only if there is no admin yet |
| `UPLOAD_DIR` | yes | `/data/uploads`, where the volume is mounted |
| `BRANCH_API_URL`, `BRANCH_API_TOKEN` | yes | BRAC's branch API and its token: the source of every location (nightly sync and **Sync now**) |
| `APP_URL` | recommended | the site's address, used in emails |
| `PORT` | no | set by Railway itself |
