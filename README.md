# Field Visit Tracker — local dev setup

Two React apps sharing one JSON-file "database":

- **Staff app** — `staff.html` → sign in, log visits, feedback, complaints
  (with a real photo attachment), story feed (with a real photo), a
  "My Complaints" tab, and — for anyone tagged with the `fixer` role — a
  "Fixer Queue" tab right in the same app. Fixers are just employees with
  an extra role, so there's no separate fixer login.
- **Admin console** — `admin.html` → assign complaints to each department's
  fixer, set deadlines, manage departments/employees, and a Sent Emails log.

Both talk to a small local API server (`server/index.js`) that reads and
writes `server/db.json`. Every change is saved to that file, so data
survives a refresh or a restart.

## 1. Prerequisites

- **Node.js 18+** — https://nodejs.org (LTS). Check with `node -v`.

## 2. Install & run

```bash
npm install
npm run dev
```

This starts the API server (**http://localhost:4000**) and the Vite dev
server (**http://localhost:5173**) together. Open:

- http://localhost:5173/staff.html — staff app (also where fixers work)
- http://localhost:5173/admin.html — admin console
- http://localhost:5173/ — landing page linking to both

## 3. Signing in

Every employee is tracked by a **unique PIN** and can sign in with **PIN +
password**, or **email + password** — password is required either way.
Registering asks for name, phone number, email, PIN, password, and a
re-typed password, all required.

Demo accounts seeded in `server/db.json`:
- **Staff**: PIN `1234` + password `password123` (Ayaz Elahi) — or email
  `ayaz.elahi@brac.org` + the same password
- **Fixer**: PIN `3001` + password `fixer123` (Tariqul Islam, Software) —
  signs in through the *same* staff login; the "Fixer Queue" tab appears
  automatically because this account carries the `fixer` role

**Admin console** is separate — one shared operator login (no PIN, no
self-registration):
- `admin@brac.org` / `admin123`
A small "Login as admin" link sits at the bottom-right of the staff login
screen. (Change the password in `server/db.json` → `"adminAuth"`.)

**Staying signed in**: the staff/fixer session (which employee is active)
is remembered in the browser's `localStorage`, so a page reload does not
log you out — it re-resolves your id against the live employee list, so
if admin changes your role/department it takes effect without needing to
log out and back in. The admin session is remembered in `sessionStorage`
(survives a reload, clears when the tab is closed — appropriate for a
single shared operator credential).

Because PINs are the tracking key, they must be **unique across every
employee** — both the register screen and the admin console's manual
"Add Employee" form enforce this.

## 4. The complaint workflow, end to end

1. A field employee files a complaint during a visit (staff app), choosing
   a department or "Other", and optionally attaching a real photo (taken
   or picked from the device — resized client-side before it's stored).
2. In the admin console's **Complaints** tab, an "Open" complaint is
   assigned: if it was filed as "Other", the admin picks the real
   department; otherwise the department is already known. Either way, the
   admin sets how many days the assignee gets, and clicks **Confirm
   Assignment & Set Deadline** — this is the one admin action that:
   - assigns it to **that department's one fixer** (each department has
     exactly one — see §4a),
   - sets the deadline,
   - generates an **assignment email** (logged, not actually sent — see §7).
3. **Reminder**: 24 hours before the deadline (or 48 hours, if more than 2
   days were given), a reminder email is generated for the assignee.
4. **Escalation**: if the deadline passes and the complaint isn't resolved,
   an escalation email is generated automatically to the assignee's
   **supervisor** — no admin action needed. The complaint shows up under
   "Escalated — Awaiting Extension" in the admin console.
5. Once the supervisor (in real life) tells the admin how much extra time
   to grant, the admin opens that complaint and clicks **Grant Extension**
   with the number of days. This resets the deadline and the whole
   reminder/escalation cycle repeats against the new deadline.
6. The assigned fixer sees the complaint in their **Fixer Queue** tab
   (staff app), with the full timeline and photo, and marks it
   **Resolved** themselves when it's done. Admin sees this too (read-only)
   in the Complaints tab.

Departments and employees (name, number, email, PIN, password, department,
supervisor, and role tags `field` / `fixer` / `supervisor`) are all managed
from the admin console — no code changes needed to add either. An admin
turns any existing employee into a fixer just by checking the `fixer` role
on their record; their Fixer Queue tab appears the next time they load
the staff app.

### 4a. One fixer per department

Each department has **exactly one** fixer — there's no round robin or
queueing between multiple people. Checking the `fixer` role on an employee
(admin console → Employees) automatically un-checks it on whoever held it
before for that same department, so the invariant always holds. Assigning
a complaint always goes straight to that one person.

## 5. Photos (complaints & stories)

Photo capture is real: `<input type="file" accept="image/*" capture>` →
the image is drawn onto a canvas and downscaled (max ~1000px, JPEG ~72%
quality) client-side → stored as a data URL directly on the complaint or
story record. There's no separate file server for this prototype, so:
- Photos live inside `server/db.json` itself (as base64 strings) — fine
  for demoing, but will bloat that file with heavy use. Swap in real
  object storage (S3, Cloudinary, etc.) before this sees production
  traffic.
- The resize step keeps individual photos reasonably small, but there's
  no cap on *how many* photos accumulate over time.

## 6. Reminders/escalations without anyone logged in

The server runs a background check every 5 minutes
(`DEADLINE_CHECK_INTERVAL_MS` in `server/index.js`) that generates any
reminder/escalation emails that are due — independent of whether the
admin console is open.

**Caveat for Render's free tier**: the service sleeps after a period of
inactivity, so the 5-minute timer only runs while the service is awake.
For demos, use the **"Run deadline check now"** button in the admin
console's Complaints tab to trigger the same check on demand.

## 7. About the emails — this is a log, not real delivery

Every email the system "sends" (assignment / reminder / escalation /
extension) is generated as a record in the `emailLog` collection and shown
in the admin console's **Sent Emails** tab — full subject and body,
searchable. **No real email is dispatched.** To wire in real delivery,
add an SMTP or transactional-email API call (e.g. Nodemailer, Resend,
SendGrid) inside `pushEmail()` in `server/logic.js`, using environment
variables for credentials — never hardcode them.

## 8. Dark / light mode

Every app has a theme toggle in its nav bar. The choice is saved per
browser (`localStorage`, key `fvt-theme`) via `src/lib/theme.js`. Both
apps also reset the page's default browser margin/background to the
theme's own background color, so there's no stray white edge showing
around the app in dark mode (a common gotcha when the `<body>`'s default
white background peeks out from behind a themed app div).

## 9. Data model

`server/db.json` collections:

```
employees        — every person: field staff, fixers, supervisors (role
                    tags can overlap — a field employee can also be a fixer).
                    `pin` is unique across every employee (it's the login
                    key). { id, name, phone, pin, email, password,
                    departmentId, supervisorId, roles: ["field"|"fixer"|"supervisor"] }
visits           — one record per field visit; complaints are nested
                    inside visits[].complaints[] (see below).
departments      — { id, name }, managed from the admin console.
adminAuth        — { email, password } — single shared admin login.
emailLog         — every generated email (see §7).
```

A complaint, nested inside its visit's `complaints` array, carries:

```json
{
  "id": "FC-XXXXXX",
  "department": "Construction",
  "description": "...", "urgency": "Medium", "status": "Open|In Progress|Resolved",
  "photoUrl": null,
  "filedBy": "...", "filedDate": "...",
  "assignedEmployeeId": null, "assignedTo": null, "assignedEmployeeEmail": null,
  "supervisorId": null, "supervisor": null, "supervisorEmail": null,
  "deadline": null, "deadlineSetAt": null, "deadlineDays": null,
  "deadlineHistory": [],
  "reminderSent": false, "escalated": false, "escalatedAt": null,
  "resolvedAt": null, "resolvedBy": null,
  "log": [ { "label": "...", "time": "..." } ]
}
```

## 10. How the persistence works

`src/lib/usePersistedCollection.js` fetches a collection on mount and PUTs
the whole array back to the server on every change (it also exposes a
`loaded` flag as a third return value, used to avoid flashing the login
screen while a saved session is still being resolved). The four workflow
actions (assign / extend / resolve / run-deadline-check) are the exception
— they're server-side business logic (`server/logic.js`) reached via
`POST /api/actions/*`, since they have to run atomically and on a timer
independent of any browser tab. After calling one, the app
manually re-fetches `visits` and `emailLog` to pick up what the server
changed.

This is intentionally simple (JSON file, no real auth hashing, single
shared admin account, photos as inline base64) — built for prototyping,
not production traffic.

## 11. Project structure

```
field-visit-tracker/
├── package.json
├── vite.config.js          # multi-page build (index/staff/admin) + /api proxy
├── index.html / staff.html / admin.html
├── server/
│   ├── index.js             # Express API: generic /api/:collection + /api/actions/*
│   ├── logic.js              # complaint assignment, deadline math, email generation
│   └── db.json                 # the database
└── src/
    ├── lib/
    │   ├── usePersistedCollection.js
    │   ├── ids.js             # makeId(), todayStr()
    │   ├── theme.js            # dark/light mode hook (per-browser)
    │   ├── ThemeToggle.jsx
    │   └── AuthScreen.jsx      # shared login/register (PIN+password or email+password)
    ├── staff/    (main.jsx, App.jsx)   — visit wizard, dashboard, My Complaints, Fixer Queue
    └── admin/    (main.jsx, App.jsx)   — complaints queue, departments, employees, sent emails
```

## 12. Deploying to Render

Same as before — one web service:
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Render assigns `PORT` automatically; `server/index.js` already reads
  `process.env.PORT`.
- Free tier sleeps after inactivity — see §6 for what that means for the
  automatic deadline check.

## 13. Common issues

- **"Could not load ... from the server" warning** — the API server isn't
  running. Run `npm run dev` (or `npm run dev:server`).
- **Assign button disabled / "no fixer set up"** — that department has no
  employee tagged with the `fixer` role yet. Add the role under the admin
  console's Employees tab (only one employee per department can hold it).
- **Fixer Queue tab doesn't show up** — the signed-in employee doesn't have
  the `fixer` role checked on their employee record (admin console →
  Employees).
- **Changes don't seem to save** — check the Network tab for a failing
  `PUT` or `POST /api/actions/*` request.
- **Want a clean slate?** Stop the server and edit `server/db.json`
  directly, or reset `visits`/`emailLog` to `[]`.
