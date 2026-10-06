# Field Visit Tracker — local dev setup

Three React apps sharing one JSON-file "database":

- **Landing / sign-in** — `index.html` (served at `/`) → the one login
  screen for everyone, with an **Admin / User** picker up top. This is
  where every session starts now; there's no more plain link page.
- **Staff app** — `staff.html` → log visits, feedback, complaints (with a
  real photo attachment), story feed (with a real photo), a "My
  Complaints" tab, and — for anyone tagged with the `fixer` role — a
  "Fixer Queue" tab right in the same app. Employees tagged `management`
  additionally get a **Management view** on the dashboard (see §3a) and a
  **Branch 360° profile** for every field office. Fixers and management
  users are just employees with an extra role, so there's no separate
  login for either.
- **Admin console** — `admin.html` → assign complaints to each unit's
  fixer, set deadlines, see the **Network health** coverage view (admin-only
  for now), manage units & teams / employees, maintain the **field
  office master list** and the visit target (see §3b), and a Sent Emails log.

All three share one design system (`src/styles/brac.css`, see §8) styled
after brac.net — Helvetica Neue, brand magenta on deep forest green, pill
buttons, rounded white cards — with count-up numbers, staggered reveals, an
animated map and a mobile layout (bottom tab bar, sheets instead of modals,
tables that turn into cards). Animations switch off under
`prefers-reduced-motion`.

You never navigate to `staff.html`/`admin.html` directly with a browser
bookmark expecting a login form — both now redirect back to `/` if there's
no valid session, since signing in only happens on the landing page.

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

- http://localhost:5173/ — **start here.** Sign-in page with the Admin /
  User picker; successful login forwards you to the right app.
- http://localhost:5173/staff.html — staff app (redirects to `/` if you're
  not signed in)
- http://localhost:5173/admin.html — admin console (same redirect rule)

## 3. Signing in

The landing page (`/`) has two tabs:

- **User** — the same PIN/email + password sign-in and registration form
  as before. Every employee is tracked by a **unique PIN** and can sign in
  with **PIN + password**, or **email + password**. Registering asks for
  name, phone number, email, PIN, password, and a re-typed password, all
  required. New registrations land on this tab as a plain `field` employee.
- **Admin** — email + password against the `adminUsers` collection (now a
  list, not a single shared login — see §9).

Both tabs also show a **"Continue with SSO"** button. It's a placeholder:
clicking it just explains that SSO isn't wired up yet. It's there so the
UI already has a slot for a real SSO provider (Google/Microsoft/SAML/etc.)
to be plugged in later without another redesign.

**Demo accounts** seeded in `server/db.json`:

| Role | Name | Sign in with | Password |
|---|---|---|---|
| Normal user | Ayaz Elahi | PIN `1234` (or `ayaz.elahi@brac.org`) | `password123` |
| Normal user | Nusrat Jahan | PIN `6001` (or `nusrat.jahan@brac.org`) | `normal123` |
| Normal user | Kamal Uddin | PIN `6002` (or `kamal.uddin@brac.org`) | `normal123` |
| Fixer | Tariqul Islam (Software) | PIN `3001` (or `tariqul.islam@brac.org`) | `fixer123` |
| Management | Farzana Akter | PIN `7001` (or `farzana.akter@brac.org`) | `mgmt123` |
| Management | Delwar Hossain | PIN `7002` (or `delwar.hossain@brac.org`) | `mgmt123` |
| Admin | Ayaz Elahi Mullick | `admin@brac.org` | `admin123` |
| Admin | Rezwana Karim | `rezwana.admin@brac.org` | `admin456` |

Fixers and management users sign in through the *same* User tab as anyone
else — the Fixer queue tab and the Dashboard's Management view just appear
once signed in, because those are role tags on the employee record, not
separate accounts.

**Staying signed in**: the staff/fixer/management session (which employee
is active) is remembered in the browser's `localStorage`, so a page reload
does not log you out — it re-resolves your id against the live employee
list, so if admin changes your role/unit it takes effect without
needing to log out and back in. The admin session is remembered in
`sessionStorage` (survives a reload, clears when the tab is closed).
Signing out from either app sends you back to `/`.

Because PINs are the tracking key, they must be **unique across every
employee** — both the register screen and the admin console's manual
"Add Employee" form enforce this.

### 3a. Management role: Management view & Network health

Checking the `management` role on an employee (admin console → Employees)
gives them a **Management view** in the staff app, on top of whatever else
they can already do (a management user is usually still a plain `field`
employee too, or a fixer). It is read-only and organization-wide (every
visit and complaint on record, not just theirs). The separate **Network
health** view (below) is **admin-only for now**.

**Management view** — a section on the Dashboard, after "Your visits" and
before the "Story feed". Collapsed it shows four headline numbers (visits on
record, visits this month, open complaints, resolution rate); **Show
details** opens two analytics tabs:

- **Visits** — visit density, visits and average rating by division /
  district, visits over time, the mix of visit reasons (onboarding,
  monitoring, training…) and **"Was the information gathered properly?"**
  — each visit is scored on five equal checks (registered, staff feedback
  rated, member feedback rated with a members-consulted count, complaints
  step completed, tags or notes captured), so thin visits are visible.
- **Complaints** — the whole path **from visit to resolution**: a funnel
  (filed → assigned → in progress → resolved), how long open complaints have
  waited, complaints by unit, resolution ratio per unit
  (Success = resolved without ever missing its deadline, Fail = escalated at
  least once), status by unit, urgency mix and the busiest
  **teams**.

Both share a Division → District → Area → Branch location filter and a date
filter (on the Visits tab they sit beside its map; Complaints has no map, so
its filters are a bar above the charts).

**Network health** — in the admin console, its own tab right after
"Complaints" (admins only, for now). It answers *are all field offices being
visited?*. Management users don't see it, and their Management view map is
visits-only: no Coverage switch, no status-coloured pins, no "% on track"
figures. To give it to management as well, set
`managementSeesNetworkCoverage: true` in `src/lib/features.js` — that adds a
"Network health" tab beside "My complaints" and restores coverage on their
visits map.

- a coverage ring plus headline KPIs: offices never visited, offices overdue
  (not visited within the visit target — 90 days by default, see §3b), visits
  this month, average rating, **information completeness** and the complaint
  resolution rate;
- an interactive **coverage map** of Bangladesh with its **filters right
  beside it** (above it on phones), sized to fit the screen together, so
  choosing a division / district / area / branch and watching the map zoom
  happen in one view. Tap a division to zoom in,
  then a district, then an area cluster, then a branch pin; drag to pan,
  Ctrl/⌘ + scroll or the +/− buttons to zoom. Division and district names
  appear as you zoom, thinned out by a collision-aware label planner so the
  map never gets crowded. Fills show coverage % (green ≥ 80%, amber 50–79%,
  red < 50%) or, via the toggle, visit volume. Pins are coded by **shape and
  colour** (green dot = visited recently, amber diamond = overdue, crossed
  red dot = never visited);
- a **Needs attention** list (never visited first, then longest overdue), a
  coverage breakdown chart, and a searchable, CSV-exportable table of every
  office.

Clicking any office — on the map, in a list or via **Ctrl/⌘ + K** quick
search — opens its **Branch 360° profile**: status, visit history (with the
feedback givers' details when they were recorded), average ratings, open
complaints, information completeness and a one-click "Register a visit
here" (admins can open the profile too, without that button). Back returns
to whichever page you came from.

The map's boundary data — `src/lib/bd-divisions.geojson.json` (8 divisions)
and `src/lib/bd-districts.geojson.json` (64 districts, simplified from ~1.5MB
down to ~250KB with `@turf/simplify` so it doesn't bloat the bundle) — comes
from [geoBoundaries](https://www.geoboundaries.org) (ADM1/ADM2 Bangladesh,
CC0 / public domain) and is rendered client-side with `d3-geo` — no external
map tiles or API calls, so it works fully offline. **Note for anyone
re-fetching this data**: geoBoundaries' exports had every polygon ring wound
backwards for `d3-geo`'s purposes (it uses ring winding to know which side of
a boundary is "inside" a shape) — if you replace either file, re-run the
same fix: for every ring, if `d3.geoArea` on it comes out above 2π, reverse
the ring's point order.

Unlike `fixer`, there's no one-per-unit limit on `management` — check
it on as many employees as should see the dashboard.

### 3b. The field office master list & visit target

Coverage can only be measured against a list of *all* offices, so the app
keeps one: the `offices` collection (78 seeded branches across all 8
divisions). It drives three things — the Division → District → Area →
Branch dropdowns in the visit wizard, the coverage maths, and the map pins.

In the admin console's **Offices** tab an admin can:

- **Add / edit offices** (division, district, area office, branch name and
  optional latitude/longitude). Without coordinates a pin is drawn
  approximately inside its district. Renaming or moving an office relinks its
  past visits automatically; an office that has visit history can't be
  deleted — **Retire** it instead (it stops counting toward coverage but its
  records stay).
- **Import / export CSV** — columns `Branch, Area, District, Division,
  Latitude, Longitude, Active`. Import only adds new offices (existing
  district + branch pairs are skipped) and accepts either "Chattogram" or
  "Chittagong".
- Set the **visit target** — the number of days after which an unvisited
  office is flagged **Overdue** (default 90, stored in the `settings`
  collection as `{ "visitTargetDays": 90 }`). Changing it updates the
  dashboard, map and branch profiles immediately.

### 3c. Registering a visit (the wizard)

Four steps, in this order: **Register → Complaints → Story → Feedback**
(Feedback is last, and finishing it completes the visit; any step after
Register can be skipped and resumed later from the visit card).

1. **Register** — Division → **Region** → Area → Branch (all driven by the
   office master list, §3b), or an Area / Region Office or Village
   Organisation instead; then reason, dates/times and the calculated
   duration. (The values in the Region list are the master list's second
   level, i.e. the same names the map and analytics call districts.)
2. **Complaints** — see §4. The form follows this flow: **who is raising
   it** (Staff or Member, with an optional details block — **Staff**: name,
   PIN, designation, department, contact; **Member**: name, phone, member
   number, VO code) → **Description** → **Urgency** → **Photo** →
   **Assign to** (a **Unit**, then one of its **Teams**) → **Consent to
   follow up** → **Add complaint**. Fixers and admins see the details (§4).
3. **Story** — an optional photo and caption for the story feed.
4. **Feedback** — from **Staff** or from a **Member**. The fields come in
   this order: **Staff / Member information** (optional — **Staff**: name,
   PIN, designation, department, contact; **Member**: name, phone, member
   number, VO code) → **Members consulted** (member feedback only) →
   **Notes / description** → **Quick tags** → **Overall rating**. Only the
   information fields that were filled in are stored
   (`feedback.staff.person` / `feedback.member.person`).

Leaving the wizard with a draft that has nothing in it discards that draft.

## 4. The complaint workflow, end to end

1. A field employee files a complaint during a visit (staff app), choosing
   a **unit**, then one of its **teams** (every unit with teams requires
   one; "Other" has none), and optionally attaching a real photo
   (taken or picked from the device — resized client-side before it's
   stored).
2. In the admin console's **Complaints** tab, an "Open" complaint is
   assigned: if it was filed as "Other", the admin picks the real
   unit (and, optionally, a team); otherwise the unit and team are already
   known. Either way, the
   admin sets how many days the assignee gets, and clicks **Confirm
   assignment & set deadline** — this is the one admin action that:
   - assigns it to **that unit's one fixer** (each unit has
     exactly one — see §4a),
   - sets the deadline,
   - generates an **assignment email** (logged, not actually sent — see §7).
3. **Reminder**: 24 hours before the deadline (or 48 hours, if more than 2
   days were given), a reminder email is generated for the assignee.
4. **Escalation**: if the deadline passes and the complaint isn't resolved,
   an escalation email is generated automatically to the assignee's
   **supervisor** — no admin action needed. The complaint shows up under
   "Escalated — awaiting extension" in the admin console.
5. Once the supervisor (in real life) tells the admin how much extra time
   to grant, the admin opens that complaint and clicks **Grant Extension**
   with the number of days (the complaint's detail view also shows a
   Filed → Assigned → Being fixed → Resolved progress strip and its full
   activity timeline). This resets the deadline and the whole
   reminder/escalation cycle repeats against the new deadline.
6. The assigned fixer sees the complaint in their **Fixer Queue** tab
   (staff app) — in progress first, resolved last — with the full timeline,
   photo, its unit/team and **who raised it and how to reach them**
   (the staff member's or member's details, if given; a complaint whose
   source declined follow-up is flagged "No consent to follow up"). The
   fixer marks it **Resolved** themselves when it's done. Admin sees the
   same details in the Complaints tab (and can search by them), and they are
   included in the assignment email.

Units and employees (name, number, email, PIN, password, unit,
supervisor, and role tags `field` / `fixer` / `supervisor` / `management`)
are all managed from the admin console — no code changes needed to add
either. An admin turns any existing employee into a fixer (or a management
user) just by checking the role on their record; the corresponding tab
appears the next time they load the staff app.

### 4a. One fixer per unit

Each unit has **exactly one** fixer — there's no round robin or
queueing between multiple people. Checking the `fixer` role on an employee
(admin console → Employees) automatically un-checks it on whoever held it
before for that same unit, so the invariant always holds. Assigning
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
For demos, use the **"Run deadline check"** button in the admin
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
browser (`localStorage`, key `fvt-theme`) via `src/lib/theme.js`. The page's
default browser margin/background is reset to the theme's own background
colour, so there's no stray white edge in dark mode.

**Design system.** All styling lives in one file, `src/styles/brac.css`,
built from CSS variables (colour, radius, shadow, motion) with a light and a
dark set. To re-skin the product — e.g. to the official BRAC palette or
logo — change the variables at the top of that file (the brand mark in
`src/lib/AppShell.jsx` is a generic pin icon; drop the official logo asset in
there). Shared building blocks: `AppShell` (top bar + mobile bottom bar),
`ui.jsx` (count-up numbers, scroll-reveal, sparkline, delta chips, progress
ring, CSV download), `charts.jsx` (self-sizing SVG charts),
`InteractiveMap.jsx` and `CommandPalette.jsx`. On phones: a floating bottom
tab bar with a raised "New visit" button, modals become bottom sheets, wide
tables become stacked cards (add `data-label` to each `<td>` and the class
`stack` to a `ctable`), and inputs are 16 px so iOS doesn't zoom.

## 9. Data model

`server/db.json` collections:

```
employees        — every person: field staff, fixers, supervisors, management
                    (role tags can overlap — e.g. a field employee can also
                    be a fixer, or a management user). `pin` is unique across
                    every employee (it's the login key). { id, name, phone,
                    pin, email, password, departmentId, supervisorId,
                    roles: ["field"|"fixer"|"supervisor"|"management"] }
visits           — one record per field visit; complaints are nested
                    inside visits[].complaints[] (see below).
departments      — { id, name, units: [{ id, name }] }, managed in the admin
                    console's **Units** tab (**Teams** panel). NOTE the
                    wording: the interface calls a stored *department* a
                    **Unit** and a department's stored *unit* a **Team**
                    (see src/lib/terms.js) — the keys kept their original
                    names. A complaint is assigned to a Unit and one of its
                    Teams; the seeded names are placeholders — replace them with
                    the real ones there.
offices          — the field office master list (see §3b):
                    { id, name, type: "branch", division, district, area,
                    lat, lng, active }. A visit is linked to its office by
                    district + branch name.
settings         — { visitTargetDays } — the "Overdue after N days" target.
adminUsers       — [{ id, name, email, password }, ...] — admin console
                    logins. Add more from `server/db.json` directly (there's
                    no admin-management UI yet); each is a full admin.
emailLog         — every generated email (see §7).
```

A complaint, nested inside its visit's `complaints` array, carries:

```json
{
  "id": "FC-XXXXXX",
  "department": "Construction",   // shown as the Unit
  "unit": "Civil Works",             // shown as the Team
  "source": "staff|member",
  "person": { "name": "…", "pin": "…" },   // optional; staff: name/pin/designation/department/contact, member: name/phone/memberNumber/voCode
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
    ├── styles/brac.css       # the whole design system (tokens, components, motion, mobile)
    ├── lib/
    │   ├── usePersistedCollection.js
    │   ├── ids.js             # makeId(), todayStr()
    │   ├── theme.js            # dark/light mode hook (per-browser)
    │   ├── ThemeToggle.jsx
    │   ├── AppShell.jsx        # top bar, pill tabs, mobile bottom bar (staff + admin)
    │   ├── AuthScreen.jsx      # shared login/register (PIN+password or email+password)
    │   ├── ui.jsx              # CountUp, Reveal, Sparkline, DeltaChip, Ring, downloadCsv…
    │   ├── charts.jsx          # dependency-free, self-sizing SVG charts
    │   ├── InteractiveMap.jsx  # zoomable choropleth + pins + label planner (d3-geo)
    │   ├── CommandPalette.jsx  # Ctrl/⌘ + K quick search
    │   ├── BdOutline.jsx       # decorative Bangladesh outline (sign-in + hero)
    │   ├── features.js         # feature switches (e.g. who sees Network health / coverage)
    │   ├── PersonInfo.jsx      # optional staff / member details (feedback + complaints)
    │   ├── offices.js          # office tree, coverage / completeness maths, name aliases
    │   ├── bd-divisions.geojson.json  # Bangladesh's 8 divisions (see §3a)
    │   └── bd-districts.geojson.json  # Bangladesh's 64 districts, for the zoomed-in map
    ├── landing/  (main.jsx, App.jsx)   — the "/" sign-in page: Admin/User picker, SSO placeholder
    ├── staff/    (main.jsx, App.jsx, Analytics.jsx, NetworkHealth.jsx, BranchProfile.jsx, analytics/*)
    │             — visit wizard, dashboard (Management view for management), Network health
    │               tab, Branch 360°, My Complaints, Fixer Queue
    └── admin/    (main.jsx, App.jsx, OfficesTab.jsx)
                  — complaints center, network health, units (+ teams), employees, offices, sent emails
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
- **Assign button disabled / "no fixer set up"** — that unit has no
  employee tagged with the `fixer` role yet. Add the role under the admin
  console's Employees tab (only one employee per unit can hold it).
- **Fixer Queue tab / Network health doesn't show up** — the signed-in
  employee doesn't have the `fixer` / `management` role checked on their
  employee record (admin console → Employees). The Management view is on
  the Dashboard between "Your visits" and the "Story feed". Network health
  is in the admin console (see §3a for the switch that also shows it to
  management).
- **An office is missing from the wizard / map / coverage** — it isn't on
  the master list, or it was retired. Check admin console → Offices.
- **Data you changed on disk (or via a script) reverts** — every open browser
  tab holds its own copy of each collection and writes the whole thing back
  when something changes (last write wins). After editing `server/db.json` by
  hand or re-seeding, refresh any tab that was already open.
- **Keep bouncing back to the login page** — `staff.html`/`admin.html` only
  render once there's a session `localStorage`/`sessionStorage` recognizes;
  sign in from `/` rather than opening those files directly.
- **Changes don't seem to save** — check the Network tab for a failing
  `PUT` or `POST /api/actions/*` request.
- **Want a clean slate?** Stop the server and edit `server/db.json`
  directly, or reset `visits`/`emailLog` to `[]`.
