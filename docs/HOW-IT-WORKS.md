# How the Field Visit Tracker works — a guide for making changes yourself

Read parts 1–4 once, in order. After that, use part 5 (recipes) whenever you want to change something.
Every file name below is relative to the `field-visit-tracker` folder.

---

## Part 1 — The big picture

The app has **three pieces**:

| Piece | Folder | Language | Job |
|---|---|---|---|
| **Website** | `web/` | JavaScript + React (inside Next.js) | Everything people see and click |
| **API (server)** | `api/` | TypeScript + NestJS | Checks who you are, applies the rules, reads/writes the database, sends email |
| **Database** | (PostgreSQL) | SQL, described in `api/prisma/schema.prisma` | Stores everything |

They talk like this:

```
 Phone / laptop browser
 ┌─────────────────────────────┐
 │  Website (web/)             │   1. You click "Assign"
 │  calls  /api/actions/...    │ ──────────────────────────┐
 └─────────────────────────────┘                           ▼
                                   ┌──────────────────────────────────────┐
                                   │ API (api/)                           │
                                   │  2. auth.guard.ts: who is this?      │
                                   │  3. controller: which endpoint?      │
                                   │  4. rules file: is it allowed?       │
                                   │  5. Prisma: read/write the database  │
                                   └──────────────────────────────────────┘
                                                  │ 6. answer (JSON)
 the screen updates  ◀────────────────────────────┘
```

**Words you'll see everywhere**

| Word | Meaning |
|---|---|
| **Endpoint** | One address on the API, e.g. `GET /api/offices` (read the offices) or `PUT /api/offices` (save them). |
| **GET / POST / PUT / PATCH / DELETE** | The kind of request: read / do an action or create / replace / change part of / remove. |
| **JSON** | The text format data travels in: `{ "name": "Savar Branch", "active": true }`. |
| **Component** | A piece of screen in React, written as a function that returns HTML-like code (JSX). |
| **State** | Values a screen remembers while it's open (`useState`). Changing state redraws the screen. |
| **Migration** | A file of SQL that changes the database's tables. Created by Prisma, applied in order, never edited after it has run. |

**Naming quirks inherited from the prototype** (don't let them confuse you):

| On screen | In the code / data |
|---|---|
| Action item | `complaint` (e.g. `visit.complaints`, `ComplaintPage.jsx`) |
| Unit (e.g. HR, Software) | `department` / `Department` table / `departmentId` |
| Team (inside a unit) | `unit` / `Unit` table |
| Region (of a branch) | `region` in the database; **`district`** in the website's office objects (old name, kept so the map and analytics still work) |
| Purpose of visit | `reason` on a visit; the list is `settings.visitPurposes` |

---

## Part 2 — Running it and the "edit → see it" loop

Open **three terminals** in `field-visit-tracker`:

```bash
npm run dev:db      # 1. the local database (leave it running)
npm run dev:api     # 2. the API on http://localhost:4000 — restarts by itself when you save a file in api/src
npm run dev:web     # 3. the website on http://localhost:3000 — refreshes by itself when you save a file in web/
```

**While changing things, use http://localhost:3000.** It shows your edits instantly.
(http://localhost:4000 shows the *built* website, which only changes after `npm run build` in `web/`.)

| You changed… | What to do |
|---|---|
| a file in `web/` | nothing, the browser refreshes |
| a file in `api/src/` | nothing, the API restarts (watch terminal 2 for red errors) |
| `api/prisma/schema.prisma` | stop terminal 2, run `npx prisma migrate dev --name what-you-changed` in `api/`, start terminal 2 again |
| `api/.env` | restart terminal 2 |

Useful tools:
- **See the database:** in `api/`, run `npx prisma studio`. It opens every table in your browser; you can read and edit rows.
- **See what the website sends/receives:** in the browser press **F12 → Network**, click a request (e.g. `offices`) → *Response*.
- **See API errors:** they print in terminal 2.

---

## Part 3 — The API (`api/`), file by file

### 3.1 How one request travels

Take **"admin saves a branch office"** (`PUT /api/offices`):

1. **`api/src/main.ts`** started the server. It set up cookies, JSON reading, and serving the website.
2. **`api/src/auth/auth.guard.ts`** runs before *every* endpoint. It reads the sign-in cookie
   (`fvt_session`), finds the person in the database, and checks the endpoint's **access label**.
3. NestJS finds the method marked `@Put('offices')` in **`api/src/structure/structure.controller.ts`**
   and calls it with the request body.
4. The method checks the data (does the area exist?), then saves with **Prisma** (`this.prisma.office.upsert(...)`).
5. Whatever the method `return`s is sent back as JSON. If it `throw`s a `UserError('message')`,
   the browser gets `{ "error": "message" }` and the screen shows it.

### 3.2 Reading a controller

```ts
@Controller('api')                       // every address in this class starts with /api
export class StructureController {
  constructor(private prisma: PrismaService) {}   // Nest hands us the database client

  @Get('offices')                        // GET /api/offices — anyone signed in (no label)
  async offices() {
    const rows = await this.prisma.office.findMany({ where: { type: 'branch' } });
    return rows.map(branchJson);         // what the browser receives
  }

  @AdminOnly()                           // only admins
  @Put('offices')                        // PUT /api/offices
  async saveOffices(@Body() list: any[]) {   // @Body() = the JSON the browser sent
    ...
  }
}
```

**Access labels** (from `api/src/auth/access.ts`), put above a method:

| Label | Who can call it |
|---|---|
| `@Public()` | anyone, even signed out |
| *(none)* | anyone signed in |
| `@StaffOnly()` | a signed-in staff member (staff app) |
| `@AdminOnly()` | a signed-in admin |

To know **who** is calling, add `@CurrentUser() user: SessionUser` to the method's inputs. `user.id`,
`user.name`, `user.roles` (`field` / `fixer` / `management`), `user.kind` (`employee` / `admin`).

Other inputs you can ask for: `@Param('id') id: string` for `/api/thing/:id`, `@Query('q') q: string` for `?q=...`.

### 3.3 Every folder in `api/src/`

| Folder / file | What's inside | Open it when you want to change… |
|---|---|---|
| `main.ts` | starts the server | port, upload size, how the website is served |
| `app.module.ts` | the list of every controller and service | **you must add new controllers/services here** |
| `config.ts` | reads `api/.env` | a new setting from `.env` |
| `auth/` | sign in, create account, sign out, the guard, access labels | sign-in rules, password rules, session length |
| `people/` | employees and admin accounts | employee fields, who can edit them |
| `reference-data/` | units/teams, app settings, sent-email list | default settings (`DEFAULT_APP_SETTINGS`) |
| `structure/` | Division → Region → Area → Branch, regional/area/branch offices | location rules, the 8 divisions (`divisions.ts`) |
| `visits/visit-rules.ts` | **the visit rules** (plain functions, easy to read) | what happens when an entry is submitted, who sees which visits |
| `visits/visits.service.ts` | reading/saving visits with a row lock | rarely |
| `action-items/action-items.logic.ts` | **the action item workflow + email wording** | statuses, deadlines, reminders, email text |
| `action-items/action-items.service.ts` | runs the logic on a locked visit, sends the emails, the 5-minute reminder timer | reminder timing |
| `mail/` | SMTP sending, Email settings, test email | how emails are sent |
| `uploads/` | voice notes | allowed file types |
| `public/` | data for the public summary page (no names) | what the public page may see |
| `common/` | database client, error format, id maker | rarely |

**Rule files vs service files.** Business rules live in files with no database code
(`visit-rules.ts`, `action-items.logic.ts`). They take data in and give data out, so you can read them
like a description of the rules. The service files do the boring part around them: load, lock, save.

### 3.4 The database (`api/prisma/schema.prisma`)

Each `model` is a table. Each line is a column: `name Type`.

```prisma
model Region {
  id        String  @id          // the unique key
  name      String  @unique      // no two regions with the same name
  division  String
  active    Boolean @default(true)
  areas     Area[]               // link: a region has many areas
}
```

Tables: `Employee`, `AdminUser`, `Department` (= Unit), `Unit` (= Team), `Region`, `Area`, `Office`,
`Visit`, `Setting`, `EmailLog`.

**The Visit table is special.** A whole visit — its route, stays, and every action item, client
interaction, observation and story — is stored as **one JSON document** in the `data` column:

```json
{
  "id": "V-ABC123", "employeeId": "EMP-…", "employeeName": "…",
  "division": "Dhaka Division", "region": "Dhaka", "area": "Savar Area",
  "stops": [ { "kind": "branch", "name": "Savar Branch", … } ],
  "reason": "Monitoring", "date": "2026-10-17", "status": "open",
  "complaints":   [ { "id": "FC-…", "state": "submitted", "title": "…", "status": "Assigned", … } ],
  "interactions": [ … ], "observations": [ … ], "stories": [ … ]
}
```

That is why **adding a field to an entry form needs no database change**: the new field is simply
saved inside that JSON.

**Settings** are one JSON document too (`Setting` row with key `app`): `visitTargetDays`,
`managementTabs`, `clientRatingQuestions`, `visitPurposes`. Adding a new setting also needs no
database change.

---

## Part 4 — The website (`web/`), file by file

### 4.1 Pages

`web/app/` has the four addresses. Each is tiny: it just loads a screen from `web/src/`.

| Address | Page file | Screen it loads |
|---|---|---|
| `/` | `app/page.jsx` | `src/landing/App.jsx` (sign in / create account) |
| `/staff` | `app/staff/page.jsx` | `src/staff/App.jsx` (staff app) |
| `/admin` | `app/admin/page.jsx` | `src/admin/App.jsx` (admin console) |
| `/summary` | `app/summary/page.jsx` | `src/summary/App.jsx` (public summary) |

All styling is one file: `src/styles/brac.css`. Class names like `btn btn-primary`, `card card-pad`,
`field-group`, `field-label`, `input`, `select` come from there; reuse them and new screens will
look the same as the rest.

### 4.2 Where the screens are

| Folder / file | Screens |
|---|---|
| `src/staff/App.jsx` | staff app frame: the sidebar `tabs` list, which screen shows for which tab, dashboard |
| `src/staff/visits/RegisterVisit.jsx` | the "Register a visit" form |
| `src/staff/visits/VisitHub.jsx` | one visit's page (its entries, Mark as done) |
| `src/staff/visits/EntrySheet.jsx` | the four entry forms (action item, client interaction, observation, story) and their read-only view |
| `src/staff/visits/Places.jsx` | the Division → Region → Area pickers and the office pickers |
| `src/staff/ComplaintPage.jsx` | one action item's full page (fixer buttons) |
| `src/staff/Stories.jsx` | the story feed |
| `src/staff/management/` | Management: `Summary.jsx`, `OfficesView.jsx`, `People.jsx` |
| `src/admin/App.jsx` | admin frame: the `tabs` list, Action items, Units, Employees, Sent emails |
| `src/admin/LocationsTab.jsx` | Locations & lists |
| `src/admin/OfficesTab.jsx` | Branch offices |
| `src/admin/EmailSettingsTab.jsx`, `QuestionsTab.jsx`, `FeaturesTab.jsx` | those admin tabs |
| `src/lib/` | shared helpers (below) |

### 4.3 How a screen gets and saves data — the 3 helpers to know

**1. `api()` in `src/lib/session.js`**: call any endpoint.

```js
import { api } from "../lib/session";

const offices = await api("/offices");                                  // GET
await api("/employees", { method: "POST", body: { name: "Rina", … } }); // POST with JSON
```
If the server answers with an error, `api()` throws an Error whose `message` is the server's text,
so you can do `try { … } catch (err) { showToast(err.message); }`.

**2. `usePersistedCollection(name)` in `src/lib/usePersistedCollection.js`**: load a list once
when the screen opens, and keep it.

```js
const [offices, setOffices, loaded, reload] = usePersistedCollection("offices", []);
```
- `offices`: the data from `GET /api/offices`
- `setOffices(newList)`: shows the change at once **and sends the whole list** with `PUT /api/offices`
  (used for admin-only lists)
- `reload()`: fetch it again (after you changed something with `api()`)

**3. `useVisitStore()` in `src/lib/useVisitStore.js`**: the staff app's visits. Works offline:
`saveVisit(visit)` updates the screen at once, keeps the change on the phone, and sends
`PUT /api/visits/<id>` when there is signal.

### 4.4 Reading a React component (the 5 things you need)

```jsx
function PurposesEditor({ settings, setSettings, showToast }) {   // inputs ("props") from the parent
  const [text, setText] = useState("");                            // remembered value + its setter

  const add = () => {                                              // a function run on click
    setSettings({ ...settings, visitPurposes: [...list, text] });  // "...x" = copy of x, then change
    showToast(`"${text}" added.`);
  };

  return (                                                         // what to draw (JSX)
    <div className="card card-pad">
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn btn-primary" onClick={add}>Add purpose</button>
      {list.map((p) => <div key={p}>{p}</div>)}                    {/* a list: one div per item */}
      {text === "" && <p>Type something</p>}                       {/* shown only when true */}
    </div>
  );
}
```

- `{ … }` inside JSX = "run this JavaScript here".
- `cond && <X/>` = draw X only if cond is true. `cond ? <A/> : <B/>` = A or B.
- `list.map((item) => <… key={…}>)` = draw one thing per item (each needs a unique `key`).
- Never change state directly (`list.push(x)` ✗); always make a new copy (`setList([...list, x])` ✓).

---

## Part 5 — Recipes (step by step)

### Recipe A — Change some wording

1. Find the text: in VS Code press **Ctrl+Shift+F** and search for a few words you see on screen.
2. Change it, save, look at http://localhost:3000.

Email wording is in `api/src/action-items/action-items.logic.ts` (search for `subject:` and `body:`).

---

### Recipe B — Add a field to an entry form

Example: add **"Members present"** (a number) to **Client interaction**.
Everything is in `web/src/staff/visits/EntrySheet.jsx`, in **four places**:

**① Starting value**: in `draftFrom()`, the `if (type === "interaction")` block:
```js
return { ...base, description: e?.description || "", voice: e?.voice || null, ratings, person: e?.person || {},
         membersPresent: e?.membersPresent ?? "" };          // ← new
```

**② The input on the form**: in the big form, the `else if (type === "interaction")` block,
inside the "Client feedback" fieldset, e.g. just before `{photo()}`:
```jsx
<div className="field-group">
  <label className="field-label">Members present {optional()}</label>
  <input className="input" type="number" min="0" value={d.membersPresent}
         onChange={(e) => set({ membersPresent: e.target.value })} />
</div>
```
(`d` is the form's current values; `set({...})` changes some of them.)

**③ What gets saved**: in `build()`, the `if (type === "interaction")` return:
```js
return { ...common, description: d.description.trim(), voice: d.voice, ratings: [...kept, ...asked],
         person: hasPerson(person) ? person : null,
         membersPresent: d.membersPresent === "" ? null : Number(d.membersPresent) };   // ← new
```

**④ Show it on the read-only view**: in `EntryView`, near `{type === "interaction" && <PersonDetails …/>}`:
```jsx
{type === "interaction" && e.membersPresent != null && <p className="field-hint">Members present: <b>{e.membersPresent}</b></p>}
```

**Make it required?** Add a line to `whyNotReady()` inside `else if (type === "interaction") { … }`:
```js
if (d.membersPresent === "") return "Enter how many members were present.";
```

No API or database change is needed (Part 3.4). Done.

---

### Recipe C — Add a new admin setting (a switch)

Example: a switch **"Staff can delete visits"**.

1. **Default**: in `api/src/reference-data/reference-data.controller.ts`, add to `DEFAULT_APP_SETTINGS`:
   `allowVisitDelete: true,`
2. **The switch**: copy the pattern in `web/src/admin/FeaturesTab.jsx`. It reads `settings` and saves
   with `setSettings({ ...settings, allowVisitDelete: on })`.
3. **Use it**: in the staff screen, `settings` is already loaded in `src/staff/App.jsx`
   (`usePersistedCollection("settings", …)`); pass `settings.allowVisitDelete` down to where the
   Delete button is drawn and wrap the button: `{settings?.allowVisitDelete !== false && <button …>}`.
4. **Enforce it on the server too** (so it can't be bypassed): in
   `api/src/visits/visits.service.ts → deleteFromStaff`, read the setting and throw a `UserError` when it's off.

---

### Recipe D — Add a new endpoint and use it on a screen

Example: **"How many visits did I register this month?"**

1. **API**: in `api/src/visits/visits.controller.ts` add:
   ```ts
   @StaffOnly()
   @Get('mine/this-month')                      // GET /api/visits/mine/this-month
   async mineThisMonth(@CurrentUser() user: SessionUser) {
     const month = new Date().toISOString().slice(0, 7);          // "2026-10"
     const n = await this.prisma.visit.count({ where: { employeeId: user.id, date: { startsWith: month } } });
     return { count: n };
   }
   ```
   It needs the database client: change the constructor to
   `constructor(private visits: VisitsService, private prisma: PrismaService) {}`
   and import `PrismaService` from `'../common/prisma.service'`.
   (If a controller also has a `@Get(':id')`, put your fixed address like `mine/this-month` **above**
   it, otherwise `:id` would catch it first.)
2. **Try it**: sign in at http://localhost:3000, then open http://localhost:3000/api/visits/mine/this-month.
3. **Screen**: anywhere in a staff component:
   ```jsx
   const [count, setCount] = useState(null);
   useEffect(() => { api("/visits/mine/this-month").then((r) => setCount(r.count)).catch(() => {}); }, []);
   …
   {count != null && <p>You registered {count} visits this month.</p>}
   ```

---

### Recipe E — Add a new table

Example: a list of **public holidays** the admin maintains.

1. **Schema**: add to `api/prisma/schema.prisma`:
   ```prisma
   model Holiday {
     id   String @id
     date String   // YYYY-MM-DD
     name String
   }
   ```
2. **Migration**: stop the API (terminal 2), then in `api/`:
   ```bash
   npx prisma migrate dev --name holidays
   ```
   This creates `api/prisma/migrations/<date>_holidays/migration.sql`, applies it to your local database,
   and updates the Prisma client. **Commit that folder**: the server applies it with `npm run db:migrate`.
   Start the API again.
3. **Controller**: create `api/src/holidays/holidays.controller.ts`:
   ```ts
   import { Body, Controller, Get, Put } from '@nestjs/common';
   import { PrismaService } from '../common/prisma.service';
   import { AdminOnly } from '../auth/access';
   import { makeId } from '../common/ids';

   @Controller('api/holidays')
   export class HolidaysController {
     constructor(private prisma: PrismaService) {}

     @Get()
     list() {
       return this.prisma.holiday.findMany({ orderBy: { date: 'asc' } });
     }

     @AdminOnly()
     @Put()
     async save(@Body() list: { id?: string; date: string; name: string }[]) {
       await this.prisma.$transaction([
         this.prisma.holiday.deleteMany(),
         this.prisma.holiday.createMany({ data: list.map((h) => ({ id: h.id || makeId('HOL'), date: h.date, name: h.name })) }),
       ]);
       return this.list();
     }
   }
   ```
4. **Register it** in `api/src/app.module.ts`: import it and add `HolidaysController` to `controllers: [...]`.
5. **Screen**: `const [holidays, setHolidays] = usePersistedCollection("holidays", []);` now works
   (it reads `GET /api/holidays` and saves with `PUT /api/holidays`). Make an admin tab for it (Recipe F).

---

### Recipe F — Add a new admin tab

1. Create `web/src/admin/HolidaysTab.jsx`. Easiest start: copy `EmailSettingsTab.jsx` or the
   `PurposesEditor` in `LocationsTab.jsx`, rename the function, change the fields.
2. In `web/src/admin/App.jsx`:
   - `import HolidaysTab from "./HolidaysTab";` at the top,
   - add a line to the `tabs` list: `{ key: "holidays", label: "Holidays", short: "Holidays", icon: Calendar },`
     (icons come from `lucide-react`; add `Calendar` to the big import at the top),
   - and next to the other `{tab === "…" && …}` lines:
     `{tab === "holidays" && <HolidaysTab showToast={showToast} />}`

A new **staff** sidebar tab works the same way in `web/src/staff/App.jsx` (`const tabs = [...]` and the
`if (staffTab === "…")` chain further down).

---

### Recipe G — Change the action item workflow

All of it is in `api/src/action-items/action-items.logic.ts`:
- **statuses and who may move them**: `start()`, `longTerm()`, `fixed()`
- **when the reminder goes**: `reminderDue()` (48 h before, 24 h for short deadlines)
- **who gets emails**: `unitFixers()` / `currentFixers()`; the email is the address each fixer registered with
- **email wording**: the `subject:` / `body:` lines and `detailBlock()`

The buttons that call these are in `web/src/staff/ComplaintPage.jsx` (fixers) and the
`ComplaintsTab` in `web/src/admin/App.jsx` (admin). Their addresses are in
`api/src/action-items/action-items.controller.ts`.

---

### Recipe H — Add a new kind of user (role)

Roles are plain words in the employee's `roles` list: `field`, `fixer`, `management`.
1. Allow the new word in `api/src/people/people.controller.ts` (`const ROLES = [...]`).
2. Show it as a checkbox: `ROLE_OPTIONS` in `web/src/admin/App.jsx`, label in `ROLE_LABELS` in `web/src/staff/App.jsx`.
3. Use it: in the staff app `roles.includes("yourRole")` (see how `isManagement` / `isFixer` are made in
   `web/src/staff/App.jsx`); on the API `user.roles.includes('yourRole')`.

---

## Part 6 — Putting a change on the server

On your PC, after testing at http://localhost:3000:
```bash
git add -A
git commit -m "What I changed"
git push
```
(`git push` needs a GitHub repository connected once:
`git remote add origin https://github.com/<you>/<repo>.git` then `git push -u origin main`.
The server then gets the code with `git clone` the first time.)

On the server, in the app folder:
```bash
git pull
npm run setup
npm run build
npm run db:migrate
sudo systemctl restart fvt
```
(`db:migrate` does nothing if you added no migration. Take a backup first if you did: `deploy/backup.sh`.)

---

## Part 7 — When something goes wrong

| You see | Likely cause | Fix |
|---|---|---|
| Red text in terminal 2 after saving an API file | a TypeScript mistake; the message names the file and line | fix that line |
| Browser shows a blank page, F12 → Console has a red error | a JavaScript mistake in a screen | the error names the file and line |
| `{"error":"Please sign in again."}` | not signed in, or the session ended | sign in again |
| `{"error":"Only an admin can do this."}` | the endpoint has `@AdminOnly()` | sign in as admin, or change the label |
| A change doesn't show at :4000 | :4000 serves the built site | use :3000, or `npm run build` in `web/` |
| `EPERM … query_engine-windows.dll.node` when running prisma | the API is running and holds the file (Windows) | stop terminal 2, run the command, start it again |
| `EADDRINUSE :4000` | an old API is still running | close the old terminal (or end the `node` process in Task Manager) |
| `The column … does not exist` | schema changed but no migration was run | `npx prisma migrate dev --name …` |

**Golden rules**
1. Never edit a migration that has already run (anything in `api/prisma/migrations/` you've committed). Make a new one.
2. Never commit `api/.env` (it holds passwords). It's already in `.gitignore`.
3. Rules that matter (who may do what) go in the **API**, not only on the screen: anyone can send requests without using your screens.
4. Change one thing at a time, check it at :3000, commit, then the next.
