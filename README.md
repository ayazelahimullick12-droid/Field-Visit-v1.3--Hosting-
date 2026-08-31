# Field Visit Tracker — local dev setup

Two separate React apps sharing one JSON-file "database":

- **Staff app** — `staff.html` → register/sign in, log visits, feedback, complaints, story feed
- **Admin console** — `admin.html` → complaints management, sourced live from the same database

Both talk to a small local API server (`server/index.js`) that reads and
writes `server/db.json`. Every change — creating an account, registering a
visit, filing a complaint, posting a story, an admin assigning or resolving
a complaint — is saved to that file, so your data survives a refresh or a
restart.

## 1. Prerequisites

- **Node.js 18+** — https://nodejs.org (LTS). Check with `node -v`.
- **VS Code** — open this folder (`File > Open Folder…`).

## 2. Install & run

```bash
npm install
npm run dev
```

This starts the API server (**http://localhost:4000**) and the Vite dev
server (**http://localhost:5173**) together. Open:

- http://localhost:5173/staff.html — staff app
- http://localhost:5173/admin.html — admin console
- http://localhost:5173/ — landing page linking to both

(Or run `npm run dev:server` and `npm run dev:client` in two separate
terminals if you'd rather see their logs separately.)

## 3. Signing in

The staff app has real accounts now — no more placeholder login. Use the
**Create account** tab to register with your name, phone number, and a
4–8 digit PIN; you'll sign back in later with just the phone number + PIN.

A demo account is seeded for you to try immediately:
- Phone: `01700000000`
- PIN: `1234`

Accounts are stored in `server/db.json` under `"employees"` — plaintext PIN,
since this is a local prototype, not something to expose publicly.

## 4. Data model — everything keyed by visit id

`server/db.json` has exactly two top-level collections:

```json
{
  "employees": [ { "id", "name", "phone", "pin", "createdAt" } ],
  "visits":    [ { "id": "V-XXXXXX", "...": "everything about that visit" } ]
}
```

Every field visit gets a unique id (`V-XXXXXX`) the moment it's registered,
and **all** information about that visit lives nested inside that one
record — nothing is split across separate tables:

```json
{
  "id": "V-4F2A9C",
  "employeeId": "EMP-XXXXXX",
  "employeeName": "Ayaz Elahi",
  "location": "Dhanmondi Branch",
  "date": "2026-08-10",
  "feedback": {
    "staff":  { "tags": ["..."], "rating": 5, "notes": "..." },
    "member": { "tags": ["..."], "rating": 5, "notes": "...", "count": "14" }
  },
  "complaints": [
    { "id": "FC-XXXXXX", "source": "staff", "status": "Open", "...": "..." },
    { "id": "FC-YYYYYY", "source": "member", "status": "In Progress", "...": "..." }
  ],
  "story": { "caption": "...", "posted": true, "likes": 24 }
}
```

- **A visit can have any number of complaints** (`complaints` is an array)
  — each one filed either by staff or by a member, each with its own id.
- The admin console never has its own copy of this data. It reads the same
  `visits` collection, flattens every complaint out of every visit into one
  list for its dashboard, and when an admin assigns/escalates/resolves a
  complaint, it finds that complaint's parent visit and updates the nested
  object in place — then saves the whole `visits` collection back. So the
  admin app only ever shows what's actually in the database.

## 5. How the persistence works

`src/lib/usePersistedCollection.js` is a drop-in replacement for `useState`
that:
1. fetches a collection (`employees` or `visits`) from `GET /api/<name>`
   when the app loads;
2. on every update — including functional updates like
   `setVisits(v => [...])` — sends the whole new array to
   `PUT /api/<name>`, which the server writes straight to `db.json`.

If the API server isn't running, both apps still work using in-memory
seed data — they just won't save anything, and a console warning will say
so.

This is intentionally simple (whole-collection replace, no auth beyond the
phone+PIN check, no real database) — built for local prototyping, not
production or many concurrent users. If this ever needs to be a real
deployed app, swap `server/db.json` for a real database (SQLite/Postgres)
behind the same `/api/*` shape and neither frontend needs to change much.

## 6. Project structure

```
field-visit-tracker/
├── package.json
├── vite.config.js          # multi-page build (index/staff/admin) + /api proxy
├── index.html               # landing page
├── staff.html                # staff app entry
├── admin.html                 # admin console entry
├── server/
│   ├── index.js             # Express API (GET/PUT /api/:collection)
│   └── db.json                # the database — employees + visits
└── src/
    ├── lib/
    │   ├── usePersistedCollection.js
    │   └── ids.js            # makeId(), todayStr()
    ├── staff/
    │   ├── main.jsx
    │   └── App.jsx            # auth + visit wizard + dashboard + story feed
    └── admin/
        ├── main.jsx
        └── App.jsx            # complaints console (derived from visits)
```

## 7. Recommended VS Code extensions

- **ESLint** (`dbaeumer.vscode-eslint`)
- **ES7+ React/Redux/React-Native snippets** (`dsznajder.es7-react-js-snippets`)
- **Prettier** (`esbenp.prettier-vscode`)

## 8. Common issues

- **"Could not load ... from the server" warning in the console** — the API
  server isn't running. Run `npm run dev` (or `npm run dev:server`), and
  make sure nothing else is using port 4000.
- **Port already in use** — change `PORT` in `server/index.js` and the
  proxy target in `vite.config.js` to match.
- **Registered but can't sign back in** — phone number + PIN must match
  exactly what you registered with; both are plain strings, so leading
  zeros etc. matter.
- **Changes don't seem to save** — check the Network tab for a failing
  `PUT /api/employees` or `PUT /api/visits` request; the response should
  echo back the array you sent.
- **Want a clean slate?** Stop the server and edit/replace
  `server/db.json` — e.g. `{ "employees": [], "visits": [] }` for a fully
  empty database.
