# Field Visit Tracker

BRAC's field visit tracker: **Next.js** website, **NestJS** API, **PostgreSQL** database.
In production it runs as **one Node.js process** (the API also serves the built website) plus PostgreSQL.

```
field-visit-tracker/
├── api/                    NestJS API (TypeScript)
│   ├── prisma/schema.prisma    database tables  ← start here to understand the data
│   ├── prisma/migrations/      database changes, applied with `npm run db:migrate`
│   ├── prisma/seed.ts          creates the first admin
│   ├── prisma/import-json.ts   imports the prototype's db.json
│   └── src/
│       ├── main.ts                 starts the server (API + website + uploads)
│       ├── app.module.ts           list of every controller/service
│       ├── auth/                   sign-in, registration, who-may-call-what (access.ts)
│       ├── people/                 employees and admin accounts
│       ├── reference-data/         units/teams, settings, email log
│       ├── structure/              Division → Region → Area → Branch, regional/area/branch offices
│       ├── visits/                 saving visits; visit-rules.ts = the rules
│       ├── action-items/           assign / extend / start / fixed / long term / reminders,
│       │                           story likes and comments; action-items.logic.ts = the rules
│       ├── mail/                   SMTP sending + Email settings
│       ├── uploads/                voice notes
│       └── public/                 the public summary's data (no names)
├── web/                    Next.js website
│   ├── app/                    the four pages: / (sign in), /staff, /admin, /summary
│   └── src/                    the screens (React): staff/, admin/, landing/, summary/, lib/
└── deploy/                 server files: systemd service, Nginx, backups
```

## Run it on your PC (no admin rights, no Docker)

Needs Node.js 20.12 or newer. Open three terminals in `field-visit-tracker`:

```bash
npm run setup
```

1. `npm run dev:db` — a private PostgreSQL on port 5433 (leave it running).
2. First time only, in `api/`: copy `.env.example` to `.env`, set
   `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/fvt?schema=public"` and a `SEED_ADMIN_PASSWORD`, then
   `npx prisma migrate deploy` and `npm run db:seed`
   (or `npm run db:import -- path/to/db.json` to load the prototype's demo data).
3. `npm run dev:api` — API on http://localhost:4000
4. `npm run dev:web` — website on http://localhost:3000 (open this one while developing)

## Put it on the server

Works on Linux (recommended: Ubuntu 22.04/24.04) or Windows Server.

1. Install **Node.js 20 or 22 LTS** and **PostgreSQL 14+**.
2. Create the database:
   ```sql
   CREATE USER fvt WITH PASSWORD 'a-strong-password';
   CREATE DATABASE fvt OWNER fvt ENCODING 'UTF8' TEMPLATE template0;
   ```
3. Copy this folder to the server (e.g. `/opt/field-visit-tracker`), then in `api/`:
   copy `.env.example` to `.env` and fill in `DATABASE_URL`, `APP_SECRET` (long random string),
   `APP_URL` and the `SEED_ADMIN_*` values.
4. In `field-visit-tracker/`:
   ```bash
   npm run setup
   npm run build
   npm run db:migrate
   npm run db:seed
   NODE_ENV=production npm start
   ```
   The site is now on port 4000. (`npm run build` downloads Prisma's database engine once; the
   server needs internet access for that step.)
5. Keep it running and add HTTPS:
   - **Linux:** `deploy/fvt.service` (systemd) and `deploy/nginx.conf` (HTTPS on 443).
   - **Windows:** run `npm start` as a service with NSSM or `pm2`, and put IIS (URL Rewrite + ARR)
     in front for HTTPS.
6. Backups: `deploy/backup.sh` nightly (database + voice notes).
7. Sign in at `/` → **Admin** with the seed admin PIN, then:
   - **Email settings**: enter the sending account (SMTP host, port, username, password,
     "send from" address) and **Send test**.
   - **Locations & lists**: add the Regions (each in a Division), the Areas (each in a Region),
     the Regional Offices (each in a Division), the Area Offices (each in a Region) and the
     Purposes of visit.
   - **Branch offices**: add the branches (each in an Area), one by one or by CSV
     (columns `Branch, Area, Region, Division, Latitude, Longitude`).
   - **Units**, **Employees**: set up the real data. Staff can also create their own
     accounts with their work email.

**Updating later:** copy the new code, then `npm run setup && npm run build && npm run db:migrate`,
and restart the service.

## Locations

**Division → Region → Area → Branch**, BRAC's own structure. It comes from **BRAC's ERP branch list**:

- Set `BRAC_BRANCH_API_URL` and `BRAC_BRANCH_API_TOKEN` in `api/.env` (the token never reaches the browser).
- The server fetches every page of the list **every day at 2:00 AM** (Bangladesh time), and when an
  admin presses **Sync now** in **Admin → Locations & lists**. The website only reads the copy saved
  in the database; it never calls the ERP itself.
- A branch is only rewritten when its `updated_at` is newer or its place changed. A Regional Office
  is made for each region and an Area Office for each area.
- A branch (or region, area, division) that's no longer in the list is **kept but switched off**:
  past visits still show it, the visit form no longer offers it. If it comes back, it's switched on.
- If a sync fails partway (no connection, token refused, missing pages), **nothing is changed** and
  the error shows on the sync card.
- Synced rows are read-only in the admin console ("From ERP"). The admin can still add divisions,
  regions, areas, regional/area offices and branches by hand; those stay editable.

The code is in `api/src/branch-sync/branch-sync.service.ts`. On the visit form, staff pick
Division → Region → Area, then:

| Picker | Shows |
|---|---|
| Regional Office | the Regional Offices of the chosen Division |
| Area Office | the Area Offices of the chosen Region |
| Branch Office | the branches of the chosen Area |

Renaming or moving a Region or Area also updates its offices and past visits. A Region or Area
that still has offices can't be deleted; switch it off instead (it disappears from the visit form).

## How emails work

The admin sets the sending account in **Admin console → Email settings** (the password is stored
encrypted with `APP_SECRET`). Emails go to the **fixers of the unit** an action item is assigned to,
at the email address each fixer registered with:

| When | Email |
|---|---|
| Admin assigns an action item to a unit | "New action item assigned" to every fixer in the unit |
| Admin extends the deadline | "Deadline extended" to the unit's fixers |
| 48 h before the deadline (24 h for short deadlines) | "Reminder" (checked every 5 minutes) |

Every email, with its status (Sent / Failed + reason / Not sent), is listed in **Sent emails**.

## Users

| Type | Signs in at | Can |
|---|---|---|
| Base user | `/` → User | register visits; record action items, client interactions, observations, stories |
| Fixer | `/` → User | + Action item queue for their unit (start, fixed, long term) |
| Management | `/` → User | + Management section (Summary always; Offices/People/Analytics if switched on in Admin → Features) |
| Admin | `/` → Admin | admin console |

Everyone signs in with **PIN + password** (passwords stored hashed). The session is an http-only
cookie: 30 days for staff, 12 hours for admins.

## Adding features

- **A new field on an entry form** (e.g. on Client interaction): add it to the form in
  `web/src/staff/visits/EntrySheet.jsx`. Visits are stored as one JSON document, so no database change is needed.
- **A new endpoint:** add a method to a controller in `api/src/...`. Mark who may call it with
  `@Public()`, `@StaffOnly()` or `@AdminOnly()` (from `auth/access.ts`); with none, anyone signed in can.
- **A new table:** add a `model` to `api/prisma/schema.prisma`, run `npx prisma migrate dev --name what-changed`
  (creates a migration), then use `this.prisma.<model>` in a controller.
- **A new admin tab:** add a component in `web/src/admin/` and a line in the `tabs` list in `web/src/admin/App.jsx`.
- **Workflow rules** (statuses, emails): `api/src/action-items/action-items.logic.ts`.
