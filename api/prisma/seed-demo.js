/**
 * Fills a database with demo data, for showing the app:
 *   npm run db:demo              add the demo data (again: replaces the demo staff and visits)
 *   npm run db:demo -- --remove  take the demo staff, visits and emails out again
 *
 * Load the locations first (npm run db:locations -- branches.json, or Sync now in the admin
 * console): the demo visits go to those offices, by office id. The script adds demo units and
 * teams (only those missing), four client rating questions, demo staff (ids EMP-DM-..., emails at
 * example.com so no mail reaches a real person) and about six months of visits up to today, with
 * client interactions, observations, issues at every stage and stories.
 *
 * The staff password is DEMO_PASSWORD, or a new one printed at the end. Writes to the database
 * in DATABASE_URL (api/.env, or the shell's variable, which wins). Plain JavaScript.
 */
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

try { process.loadEnvFile(path.resolve(__dirname, '../.env')); } catch { /* use the environment */ }

const prisma = new PrismaClient();
const DEMO = 'EMP-DM-';
const DAY = 86400000;

// ---------------- repeatable random numbers ----------------

let seed = 20261025;
function rand() { // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
const sample = (list, n) => [...list].sort(() => rand() - 0.5).slice(0, n);
const hashOf = (s) => parseInt(crypto.createHash('md5').update(s).digest('hex').slice(0, 8), 16);
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const usedIds = new Set();
function makeId(prefix) {
  let id;
  do id = `${prefix}-${Array.from({ length: 6 }, () => ALNUM[Math.floor(rand() * 36)]).join('')}`; while (usedIds.has(id));
  usedIds.add(id);
  return id;
}

// ---------------- the locations already loaded from the branch API ----------------

/** The API's offices in the database: every area with the branches listed in it, and the regional / area offices. */
async function loadLocations() {
  const offices = await prisma.office.findMany({ where: { active: true } });
  const branches = offices.filter((o) => o.type === 'branch');
  if (!branches.length) throw new Error('No branch offices yet: load the locations first (npm run db:locations -- branches.json, or Sync now in the admin console).');
  const key = (...parts) => parts.join('|');
  const areas = new Map();
  for (const b of branches) for (const p of b.placements || [{ division: b.division, region: b.region, area: b.area }]) {
    const k = key(p.division, p.region, p.area);
    if (!areas.has(k)) areas.set(k, { division: p.division, region: p.region, area: p.area, branches: [] });
    areas.get(k).branches.push({ id: b.id, name: b.name, code: b.code, division: p.division, region: p.region, area: p.area });
  }
  const count = {};
  for (const a of areas.values()) count[a.division] = (count[a.division] || 0) + a.branches.length;
  return {
    areas: [...areas.values()],
    areaOffice: new Map(offices.filter((o) => o.type === 'area').map((o) => [key(o.division, o.region, o.area), o])),
    regionOffice: new Map(offices.filter((o) => o.type === 'region').map((o) => [key(o.division, o.region), o])),
    divisions: Object.keys(count).sort((x, y) => count[y] - count[x]), // most branches first: the visitors' home divisions
    branchCount: branches.length,
  };
}

// ---------------- units, people, settings ----------------

const UNITS = [
  { id: 'DEPT-SOFT', name: 'Software', teams: ['IT Support', 'Application Development', 'MIS & Data', 'Network & Infrastructure'] },
  { id: 'DEPT-CONS', name: 'Construction', teams: ['Civil Works', 'Branch Renovation', 'Electrical & Utilities', 'Facilities Management'] },
  { id: 'DEPT-HR', name: 'HR', teams: ['Recruitment', 'Payroll & Benefits', 'Training & Development', 'Staff Welfare'] },
  { id: 'DEPT-FIN', name: 'Finance', teams: ['Loan Disbursement', 'Savings & Collections', 'Accounts & Audit', 'Insurance Claims'] },
  { id: 'DEPT-OPS', name: 'Operations', teams: ['Branch Operations', 'Field Supervision', 'Logistics & Transport', 'Member Services'] },
  { id: 'DEPT-LEGAL', name: 'Legal', teams: ['Loan Recovery Cases', 'Contracts & Compliance', 'Land & Property'] },
];

/** The demo units and teams, adding only the ones missing. Returns them with their real ids. */
async function saveUnits() {
  let depts = await prisma.department.findMany({ include: { units: true } });
  for (const [i, u] of UNITS.entries()) {
    let d = depts.find((x) => x.name === u.name);
    if (!d) d = await prisma.department.create({ data: { id: u.id, name: u.name, sortOrder: depts.length + i }, include: { units: true } });
    for (const [j, t] of u.teams.entries())
      if (!d.units.some((x) => x.name === t)) await prisma.unit.create({ data: { id: `${d.id}-U${j + 1}`, name: t, sortOrder: j, departmentId: d.id } }).catch(() =>
        prisma.unit.create({ data: { id: makeId('UNIT'), name: t, sortOrder: j, departmentId: d.id } }));
  }
  depts = await prisma.department.findMany({ include: { units: { orderBy: { sortOrder: 'asc' } } } });
  return UNITS.map((u) => { const d = depts.find((x) => x.name === u.name); return { id: d.id, name: d.name, teams: d.units }; });
}

const RATING_QUESTIONS = [
  { id: 'RQ-DM-INFO', text: 'Clear information on loans and savings', active: true },
  { id: 'RQ-DM-RESPECT', text: 'Staff treat members with respect', active: true },
  { id: 'RQ-DM-TIME', text: 'Loans and withdrawals arrive on time', active: true },
  { id: 'RQ-DM-MEET', text: 'Meetings are at a convenient place and time', active: true },
];

/** Adds the demo rating questions and turns the management tabs on. */
async function saveSettings() {
  const row = await prisma.setting.findUnique({ where: { key: 'app' } });
  const app = { visitTargetDays: 90, ...(row?.value || {}) };
  const questions = (app.clientRatingQuestions || []).filter((q) => !RATING_QUESTIONS.some((d) => d.id === q.id));
  app.clientRatingQuestions = [...questions, ...RATING_QUESTIONS];
  app.managementTabs = { offices: true, people: true, analytics: true };
  await prisma.setting.upsert({ where: { key: 'app' }, create: { key: 'app', value: app }, update: { value: app } });
}

let phoneNo = 0;
const person = (id, name, more) => ({
  id: DEMO + id, name, pin: '', phone: `0170000${String(++phoneNo).padStart(4, '0')}`,
  email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, roles: ['field'], departmentId: null, teamId: null,
  supervisorId: null, designation: null, department: 'Microfinance', title: null, ...more,
});

/** Visitors (one or two per government division), management, and each unit's head and fixers. */
function demoStaff(units, homes) {
  const unit = (name, team) => {
    const u = units.find((x) => x.name === name);
    return { departmentId: u.id, teamId: u.teams.find((t) => t.name === team)?.id || null };
  };
  const field = [
    ['F01', 'Nusrat Jahan', 'Regional Manager', 'Operations', 'Field Supervision'],
    ['F02', 'Kamal Uddin', 'Area Manager', 'Operations', 'Field Supervision'],
    ['F03', 'Shirin Akter', 'Regional Manager', 'Operations', 'Field Supervision'],
    ['F04', 'Mahmudul Hasan', 'Senior Officer, Monitoring', 'Finance', 'Accounts & Audit'],
    ['F05', 'Taslima Begum', 'Area Manager', 'Operations', 'Branch Operations'],
    ['F06', 'Rezaul Karim', 'Regional Manager', 'Operations', 'Field Supervision'],
    ['F07', 'Sabina Yasmin', 'Senior Officer, Monitoring', 'Finance', 'Accounts & Audit'],
    ['F08', 'Arif Hossain', 'Area Manager', 'Operations', 'Branch Operations'],
    ['F09', 'Moushumi Akhter', 'Regional Manager', 'HR', 'Training & Development'],
    ['F10', 'Jahangir Alam', 'Area Manager', 'Operations', 'Member Services'],
  ].map(([id, name, designation, u, team]) => person(id, name, { designation, ...unit(u, team) }));
  const management = [
    person('M01', 'Farhana Zaman', { roles: ['field', 'management'], designation: 'Programme Head', title: 'Head of Microfinance', ...unit('Operations'), every: [10, 20] }),
    person('M02', 'Imran Chowdhury', { roles: ['management'], designation: 'Director', title: 'Director, Operations' }),
    person('M03', 'Rokeya Sultana', { roles: ['management'], designation: 'Senior Manager', title: 'Monitoring & Evaluation' }),
  ];
  const heads = [], fixers = [];
  const HEADS = ['Zahid Rahman', 'Rafiqul Hasan', 'Nasrin Sultana', 'Shahidul Islam', 'Delwar Hossain', 'Shirin Akhtar'];
  const FIXERS = [
    ['Tariqul Islam', 'Kazi Nabil'], ['Sultana Razia', 'Abdul Mannan'], ['Tanvir Ahmed', 'Lipi Rani Das'],
    ['Marium Begum', 'Saiful Islam'], ['Shahana Parveen', 'Habibur Rahman'], ['Rashed Karim', 'Farzana Haque'],
  ];
  units.forEach((u, i) => {
    const head = person(`H${i + 1}`, HEADS[i], { roles: ['management'], departmentId: u.id, designation: 'Head of Unit', department: u.name, title: `Head of ${u.name}` });
    heads.push(head);
    FIXERS[i].forEach((name, j) => fixers.push(person(`X${i + 1}${j + 1}`, name, {
      roles: ['fixer'], departmentId: u.id, teamId: u.teams[j]?.id || null, supervisorId: head.id, designation: j ? 'Officer' : 'Senior Officer', department: u.name,
    })));
  });
  // each visitor works in one division (the busiest first); the programme head too
  field.forEach((p, i) => { p.home = homes[i % homes.length]; });
  management[0].home = homes[0];
  const all = [...field, ...management, ...heads, ...fixers];
  all.forEach((p, i) => { p.pin = String(51001 + i); });
  return { field, management, heads, fixers, all };
}

// ---------------- what people write ----------------

const CLIENTS = ['Rahima', 'Jahanara', 'Shefali', 'Rokeya', 'Morjina', 'Hasina', 'Parul', 'Amena', 'Kohinoor', 'Rina', 'Nasima', 'Shahida', 'Fatema', 'Laily', 'Saleha', 'Monowara', 'Taslima', 'Rupali', 'Anowara', 'Beauty'];
const SURNAMES = ['Begum', 'Khatun', 'Akter', 'Bibi', 'Parvin', 'Sultana', 'Rani', 'Nesa'];
const STAFF_NAMES = ['Abdul Karim', 'Selina Parvin', 'Mizanur Rahman', 'Shamima Nasrin', 'Anisur Rahman', 'Kulsum Ara', 'Mosharraf Hossain', 'Dilruba Yasmin'];
const SAYS = {
  good: [
    'Happy with how quickly the second loan came. Wants to expand her poultry business.',
    'Says the PO explains every instalment clearly and the group meeting runs on time.',
    'Used her loan for a sewing machine; now supplies school uniforms in the village.',
    'Very satisfied. Her savings helped pay for her daughter\'s exam fees.',
    'Praised the branch for sorting out a passbook mistake within a day.',
  ],
  mixed: [
    'Likes the service but the weekly meeting place floods in the rains.',
    'Satisfied overall; would like a bigger loan size for her grocery shop.',
    'Unsure how the insurance claim works; asked for it to be explained again.',
    'The PO changed twice this year, so she had to explain her business again.',
  ],
  bad: [
    'Waited three weeks for her loan after approval; had to borrow from a moneylender meanwhile.',
    'Says the collection time clashes with work in the fields.',
    'Savings withdrawal took two visits to the branch.',
  ],
};
const OBSERVATIONS = [
  'Branch is clean and well organised; files are up to date.', 'Collection sheets match the cash book for the last four weeks.',
  'Two PO posts are vacant, so the remaining POs cover extra groups.', 'Branch tablet is slow; POs fill paper forms when it hangs.',
  'Good team spirit; the BM holds a short meeting every morning.', 'Overdue list has grown since last quarter, mostly in two VOs.',
  'Notice board shows the current interest rates and helpline number.', 'Store room is damp; member files are stored on the floor.',
  'New members onboarded this month were well briefed on savings rules.', 'Staff asked for refresher training on the new loan product.',
];
const ACTIONS = {
  Software: [
    ['Collections not syncing from the tablet', 'POs\' tablets fail to sync collections at the end of the day; data is entered twice.'],
    ['Loan app shows the wrong EMI', 'The loan calculator shows a higher instalment than the approved schedule for 12-month loans.'],
    ['MIS report does not load', 'The monthly portfolio report times out for this branch.'],
    ['Branch PC cannot print', 'Printer driver is missing after the last update; receipts are handwritten.'],
  ],
  Construction: [
    ['Roof leaks in the branch office', 'Water comes through the roof over the cash counter when it rains.'],
    ['Staff toilet needs repair', 'The toilet\'s water line is broken; staff use the neighbour\'s.'],
    ['Boundary wall cracked', 'A crack runs along the back wall; the gate no longer locks.'],
    ['Unsafe wiring at the counter', 'Loose wires behind the counter; sparks seen once.'],
  ],
  HR: [
    ['Two PO posts vacant', 'Two Programme Organiser posts have been empty for three months.'],
    ['New staff salary arrears', 'Three staff who joined last month have not received their first salary.'],
    ['Refresher training needed', 'Staff ask for training on the new savings product before it launches.'],
    ['Staff quarters in poor condition', 'The staff room\'s ceiling fan and lights do not work.'],
  ],
  Finance: [
    ['Loan disbursement delayed', 'Approved loans for 12 members are waiting for funds for over two weeks.'],
    ['Savings withdrawal pending', 'A member\'s savings withdrawal has been pending for ten days.'],
    ['Cash book not reconciled', 'Last month\'s cash book does not match the bank statement.'],
    ['Insurance claim pending', 'Claim for a deceased member\'s loan has not been settled.'],
  ],
  Operations: [
    ['PO motorcycle broken', 'One PO\'s motorcycle has been off the road for a week; groups missed meetings.'],
    ['Passbooks out of stock', 'The branch has no new member passbooks left.'],
    ['Generator not working', 'The branch generator does not start; work stops during load-shedding.'],
    ['Collection sheets short', 'Not enough printed collection sheets for the month.'],
  ],
  Legal: [
    ['Branch lease expiring', 'The branch\'s rent agreement ends next month and has not been renewed.'],
    ['Overdue case needs a legal notice', 'A long-overdue loan needs a formal notice before recovery.'],
    ['Land document missing', 'The original deed for the branch land is not in the branch file.'],
  ],
};
const FIX_NOTES = ['Fixed on site and checked with the branch manager.', 'Done. Branch confirmed it works now.', 'Replaced the part; will check again next month.', 'Sorted with head office; branch informed.'];
const LONG_TERM_NOTES = ['Needs budget approval in the next quarter.', 'Part of the regional renovation plan.', 'Waiting on head office policy change.'];
const STORIES = [
  ['From one cow to a dairy', 'A member who started with one cow now sells milk to three tea stalls and has hired a helper.'],
  ['Tailoring for the whole village', 'With her second loan she bought a second machine and trains two young women.'],
  ['Back to school', 'Savings from her vegetable stall paid for her son\'s college admission.'],
  ['A shop by the highway', 'A small grocery that began with a 15,000 taka loan now stays open until night.'],
  ['Fish farming after the flood', 'After losing her crop, she turned the low land into a fish pond.'],
];
const GRADIENTS = [
  'linear-gradient(135deg,#EC008C 0%,#7A1FA2 100%)', 'linear-gradient(135deg,#2F6FED 0%,#1D1E22 100%)',
  'linear-gradient(135deg,#1C8A54 0%,#0D3B24 100%)', 'linear-gradient(135deg,#B7791F 0%,#5C3A0A 100%)',
];
// BRAC Learning Centres by division; elsewhere staff stay at a guest house or hotel
// BRAC Learning Centres, by a word in the division or region name; elsewhere a guest house or hotel
const BLCS = [
  [/barish/i, ['BLC Barishal']], [/chatto|cox|coastal/i, ['BLC Chattogram', "BLC Cox's Bazar"]], [/faridpur/i, ['BLC Faridpur']],
  [/jash|jessore/i, ['BLC Jashore']], [/khulna|south west/i, ['BLC Khulna (Khalishpur)']], [/rajshahi/i, ['BLC Rajshahi']], [/sylhet|north east/i, ['BLC Sylhet']],
];
function stayFor(place) {
  const blc = BLCS.find(([re]) => re.test(place));
  if (blc && chance(0.7)) return { name: pick(blc[1]), type: 'BRAC Learning Centre (BLC)' };
  return pick([{ name: 'BRAC guest house', type: 'Guest house' }, { name: 'Hotel near the area office', type: 'Hotel' }]);
}
const PURPOSES = ['Monitoring', 'Monitoring', 'Monitoring', 'Onboarding', 'Training', 'Issue resolution', 'Survey'];

// ---------------- visits ----------------

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** A time in Bangladesh (UTC+6) on day `d`, as an ISO string. */
const at = (d, h, m = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h - 6, m)).toISOString();
const logTime = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
const later = (iso, ms) => new Date(new Date(iso).getTime() + ms).toISOString();
/** An entry's place, as the visit form saves it (with the office's id). */
const placeOf = (o, kind) => ({
  division: o.division, region: o.region || '', area: o.area || '', office: o.name, officeId: o.id, officeKind: kind, branch: kind === 'branch' ? o.name : '',
});

function makeVisits({ loc, staff, units, now }) {
  const emails = [];
  const visits = [];
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // some branches do better than others, so the analytics have something to show
  const quality = (name) => 2.6 + (hashOf(name) % 230) / 100;
  const everyone = staff.all;

  for (const fp of staff.all.filter((p) => p.home)) {
    const myAreas = loc.areas.filter((a) => a.division === fp.home);
    let day = new Date(today.getTime() - int(170, 180) * DAY);
    const upcoming = chance(0.6);
    while (true) {
      day = new Date(day.getTime() + int(...(fp.every || [4, 9])) * DAY);
      while ([5, 6].includes(day.getUTCDay())) day = new Date(day.getTime() + DAY); // Friday, Saturday off
      const nights = pick([0, 0, 0, 1, 1, 2]);
      const back = new Date(day.getTime() + nights * DAY);
      const future = day > today;
      if (future && (!upcoming || visits.some((v) => v.employeeId === fp.id && v.date > ymd(today)))) break;
      if (future && day.getTime() - today.getTime() > 12 * DAY) break;

      const area = pick(myAreas);
      const branches = sample(area.branches, int(2, 4));
      if (!branches.length) continue;
      const stops = branches.map((b) => ({ kind: 'branch', name: b.name, officeId: b.id, ...(b.code ? { code: b.code } : {}), division: b.division, region: b.region, area: b.area }));
      const ao = loc.areaOffice.get(`${area.division}|${area.region}|${area.area}`);
      const ro = loc.regionOffice.get(`${area.division}|${area.region}`);
      if (ao && chance(0.3)) stops.push({ kind: 'office', name: ao.name, officeId: ao.id, division: ao.division, region: ao.region, area: ao.area || '' });
      if (ro && chance(0.12)) stops.push({ kind: 'office', name: ro.name, officeId: ro.id, division: ro.division, region: ro.region, area: '' });

      const ended = back.getTime() + DAY <= today.getTime();
      const status = ended && (back.getTime() + 6 * DAY < today.getTime() || chance(0.6)) ? 'done' : 'open';
      const id = makeId('V');
      const registered = at(new Date(day.getTime() - int(1, 4) * DAY), int(9, 17), int(0, 59));
      const v = {
        id, schema: 3, employeeId: fp.id, employeeName: fp.name, division: area.division, region: area.region, area: area.area,
        stops, reason: pick(PURPOSES), reasonOther: '', date: ymd(day), visitTime: '09:00', returnDate: ymd(back), returnTime: '17:30',
        stays: nights ? [{ id: makeId('SY'), ...stayFor(`${area.division} ${area.region}`), notes: '', checkIn: ymd(day), checkOut: ymd(back) }] : [],
        status, doneAt: status === 'done' ? at(back, 19, int(0, 59)) : null,
        complaints: [], interactions: [], observations: [], stories: [], createdAt: registered, updatedAt: registered,
      };

      if (!future) {
        const lastDay = back > today ? today : back;
        const days = Math.round((lastDay - day) / DAY) + 1;
        const when = () => at(new Date(day.getTime() + int(0, days - 1) * DAY), int(10, 16), int(0, 59));
        const draft = () => status === 'open' && chance(0.25);
        const entry = (prefix, place, places, more) => {
          const time = when();
          const state = draft() ? 'draft' : 'submitted';
          return { id: makeId(prefix), time, updatedAt: time, place, places, photoUrl: null, voice: null, state, ...(state === 'submitted' ? { submittedAt: later(time, int(1, 40) * 60000) } : {}), ...more };
        };

        // client interactions
        for (const b of branches) for (let n = int(0, 2); n > 0; n--) {
          const bp = placeOf(b, 'branch');
          const voCode = `VO-${int(100, 480)}`;
          const vo = chance(0.35) ? { division: bp.division, region: bp.region, area: bp.area, office: `${voCode} · ${b.name}`, officeKind: 'vo', branch: b.name, branchOfficeId: b.id } : null;
          const q = quality(b.name);
          const ratings = RATING_QUESTIONS.filter(() => chance(0.85)).map((rq) => ({ questionId: rq.id, question: rq.text, stars: Math.max(1, Math.min(5, Math.round(q + (rand() - 0.5) * 2.2))) }));
          const mood = q > 4 ? 'good' : q > 3.2 ? pick(['good', 'mixed']) : pick(['mixed', 'bad']);
          v.interactions.push(entry('CI', bp, vo ? [bp, vo] : [bp], {
            description: chance(0.85) ? pick(SAYS[mood]) : '', ratings,
            person: chance(0.8) ? { name: `${pick(CLIENTS)} ${pick(SURNAMES)}`, phone: `0180000${String(int(0, 9999)).padStart(4, '0')}`, memberNumber: `M-${int(1000, 9999)}`, voCode } : null,
          }));
        }

        // observations
        for (const s of sample(stops, int(1, 2))) {
          const p = placeOf({ ...s, id: s.officeId }, s.kind === 'branch' ? 'branch' : s.name.endsWith(' Region Office') ? 'region' : 'area');
          const fromStaff = chance(0.3);
          v.observations.push(entry('OB', p, [p], {
            description: pick(OBSERVATIONS), fromStaff,
            staff: fromStaff ? { name: pick(STAFF_NAMES), pin: String(int(10000, 99999)), designation: pick(['Branch Manager', 'Programme Organiser', 'Assistant Branch Manager']), department: 'Microfinance', contact: `0190000${String(int(0, 9999)).padStart(4, '0')}` } : null,
          }));
        }

        // issues
        for (let n = pick([0, 0, 1, 1, 1, 2]); n > 0; n--) {
          const b = pick(branches);
          const unit = pick(units);
          const [title, description] = pick(ACTIONS[unit.name]);
          const member = chance(0.25);
          const p = placeOf(b, 'branch');
          const c = entry('FC', p, [p], {
            title, description, urgency: pick(['Low', 'Medium', 'Medium', 'High']), department: unit.name, unit: pick(unit.teams).name,
            source: member ? 'member' : 'staff', consent: chance(0.85),
            person: member ? { name: `${pick(CLIENTS)} ${pick(SURNAMES)}`, phone: `0180000${String(int(0, 9999)).padStart(4, '0')}`, memberNumber: `M-${int(1000, 9999)}`, voCode: `VO-${int(100, 480)}` } : null,
          });
          if (c.state === 'submitted') progress(c, v, unit, staff, now, emails);
          v.complaints.push(c);
        }

        // stories
        if (chance(0.22)) {
          const b = pick(branches);
          const [title, caption] = pick(STORIES);
          const st = entry('ST', null, [], { title, caption, locationText: `${b.name}, ${b.area}`, gradient: pick(GRADIENTS) });
          if (st.state === 'submitted') {
            const likedBy = sample(everyone, int(0, 9)).map((p) => p.id);
            Object.assign(st, {
              likedBy, likesBefore: 0, likes: likedBy.length, shares: int(0, 3),
              comments: sample(everyone, int(0, 3)).map((p) => ({ id: makeId('CM'), byId: p.id, by: p.name, text: pick(['Wonderful!', 'Great to see this.', 'Inspiring work.', 'Well done, team!']), time: later(st.submittedAt, int(1, 72) * 3600000) })),
            });
          } else Object.assign(st, { likedBy: [], likesBefore: 0, likes: 0, comments: [] });
          v.stories.push(st);
        }
        v.updatedAt = [v.createdAt, ...['complaints', 'interactions', 'observations', 'stories'].flatMap((k) => v[k].map((e) => e.updatedAt))].sort().pop();
      }
      visits.push(v);
    }
  }
  return { visits, emails };
}

/** Moves a submitted issue along the admin → fixer workflow, as far as its age allows. */
function progress(c, visit, unit, staff, now, emails) {
  const fixers = staff.fixers.filter((f) => f.departmentId === unit.id).map((f) => ({ id: f.id, name: f.name, email: f.email }));
  const head = staff.heads.find((h) => h.departmentId === unit.id);
  const names = fixers.map((f) => f.name).join(', ');
  Object.assign(c, {
    status: 'Waiting', statusModel: 2, filedBy: visit.employeeName, visitId: visit.id, filedDate: c.submittedAt.slice(0, 10),
    assignedTo: null, supervisor: null, deadline: null, escalationApproved: false, resolutionNotes: null,
    log: [{ label: 'Issue submitted', time: logTime(c.submittedAt) }],
  });
  const age = (now - new Date(c.submittedAt)) / DAY;
  const r = rand();
  const goal = age > 30 ? (r < 0.72 ? 'Fixed' : r < 0.84 ? 'Long Term' : r < 0.94 ? 'In Progress' : 'Assigned')
    : age > 7 ? (r < 0.45 ? 'Fixed' : r < 0.7 ? 'In Progress' : r < 0.9 ? 'Assigned' : 'Long Term')
    : (r < 0.4 ? 'Waiting' : r < 0.75 ? 'Assigned' : r < 0.9 ? 'In Progress' : 'Fixed');
  if (goal === 'Waiting') return;
  const assignedAt = later(c.submittedAt, int(2, 40) * 3600000);
  if (new Date(assignedAt) > now) return;
  const days = { High: 3, Medium: 7, Low: 14 }[c.urgency];
  const deadline = later(assignedAt, days * DAY);
  Object.assign(c, {
    status: 'Assigned', assignedDepartmentId: unit.id, assignees: fixers, assignedEmployeeId: fixers[0].id, assignedTo: names,
    assignedEmployeeEmail: fixers.map((f) => f.email).join(', '), supervisors: [{ id: head.id, name: head.name, email: head.email }],
    supervisorId: head.id, supervisor: head.name, supervisorEmail: head.email,
    deadline, deadlineSetAt: assignedAt, deadlineDays: days, reminderSent: false, escalated: false, escalatedAt: null,
    deadlineHistory: [{ deadline, setAt: assignedAt, days, type: 'initial' }],
  });
  c.log.push(
    { label: `Assigned to the ${unit.name} resolvers: ${names} (${unit.name}${c.unit ? ` · ${c.unit}` : ''}) — ${days} day(s) given, deadline ${logTime(deadline)}`, time: logTime(assignedAt) },
    { label: `Assignment email sent to ${names}`, time: logTime(assignedAt) },
  );
  for (const f of fixers) emails.push({
    id: `MAIL-DM-${emails.length + 1}`, complaintId: c.id, to: f.email, toName: f.name, type: 'assignment',
    subject: `[Field Visit Tracker] ${c.urgency} urgency — New issue assigned: ${c.id}`,
    body: `Hello,\n\nA new issue has been assigned to the ${unit.name} Unit.\n\nIssue ID: ${c.id}\nTitle: ${c.title}\nUnit: ${unit.name}\nTeam: ${c.unit}\nDescription: ${c.description}\nUrgency: ${c.urgency}\nFiled by: ${c.filedBy} (${c.source})\nFiled on: ${c.filedDate}\nOffice: ${c.place.office} (${c.place.division} › ${c.place.region} › ${c.place.area})\nRelated visit: ${visit.id} on ${visit.date}`,
    status: 'not-sent', error: 'Demo data (never sent).', sentAt: new Date(assignedAt),
  });
  if (goal === 'Assigned') return;
  const by = pick(fixers);
  const startedAt = later(assignedAt, int(3, 48) * 3600000);
  if (new Date(startedAt) > now) return;
  Object.assign(c, { status: 'In Progress', startedAt, startedBy: by.name });
  c.log.push({ label: `Work started by ${by.name}`, time: logTime(startedAt) });
  if (goal === 'In Progress') return;
  const doneAt = later(startedAt, (chance(0.8) ? rand() * days * 0.8 : days + rand() * 6) * DAY);
  if (new Date(doneAt) > now) return;
  if (goal === 'Long Term') {
    const note = pick(LONG_TERM_NOTES);
    Object.assign(c, { status: 'Long Term', longTermAt: doneAt, longTermBy: by.name, longTermNote: note });
    c.log.push({ label: `Marked Long Term by ${by.name}: "${note}"`, time: logTime(doneAt) });
    return;
  }
  const note = pick(FIX_NOTES);
  Object.assign(c, { status: 'Fixed', resolvedAt: doneAt, resolvedBy: by.name, resolvedById: by.id, resolutionNotes: note, resolutionPhotoUrl: null });
  c.log.push({ label: `Marked Fixed by ${by.name}: "${note}"`, time: logTime(doneAt) });
}

// ---------------- run ----------------

async function removeDemo() {
  const visits = await prisma.visit.deleteMany({ where: { employeeId: { startsWith: DEMO } } });
  const mails = await prisma.emailLog.deleteMany({ where: { id: { startsWith: 'MAIL-DM-' } } });
  const people = await prisma.employee.deleteMany({ where: { id: { startsWith: DEMO } } });
  return { visits: visits.count, mails: mails.count, people: people.count };
}

async function main() {
  const args = process.argv.slice(2);
  const target = new URL(process.env.DATABASE_URL || 'postgresql://unset');
  console.log(`Database: ${target.hostname}:${target.port || 5432}${target.pathname}`);
  if (args.includes('--remove')) {
    const n = await removeDemo();
    console.log(`Removed ${n.people} demo staff, ${n.visits} visits and ${n.mails} emails. Locations and units were kept.`);
    return;
  }
  const loc = await loadLocations();
  console.log(`Locations: ${loc.branchCount} branches in ${loc.areas.length} areas of ${loc.divisions.length} divisions.`);
  const units = await saveUnits();
  await saveSettings();

  const staff = demoStaff(units, loc.divisions.slice(0, 10));
  const taken = await prisma.employee.findMany({ where: { pin: { in: staff.all.map((p) => p.pin) }, id: { not: { startsWith: DEMO } } } });
  if (taken.length) throw new Error(`These PINs already belong to real staff: ${taken.map((t) => t.pin).join(', ')}`);
  const password = process.env.DEMO_PASSWORD || crypto.randomBytes(6).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 10);

  const { visits, emails } = makeVisits({ loc, staff, units, now: new Date() });
  const old = await removeDemo();
  if (old.people) console.log(`Replaced the earlier demo staff and visits.`);
  await prisma.employee.createMany({ data: staff.all.map(({ home, every, ...p }) => ({ ...p, passwordHash })) });
  for (let i = 0; i < visits.length; i += 50)
    await prisma.visit.createMany({ data: visits.slice(i, i + 50).map((v) => ({ id: v.id, employeeId: v.employeeId, status: v.status, date: v.date, data: v, createdAt: new Date(v.createdAt) })) });
  for (let i = 0; i < emails.length; i += 500) await prisma.emailLog.createMany({ data: emails.slice(i, i + 500) });

  const items = visits.flatMap((v) => v.complaints);
  const by = items.reduce((m, c) => ((m[c.status || 'Draft'] = (m[c.status || 'Draft'] || 0) + 1), m), {});
  console.log(`Staff: ${staff.all.length} (${staff.field.length} visitors, ${staff.management.length + staff.heads.length} management, ${staff.fixers.length} fixers).`);
  console.log(`Visits: ${visits.length} (${visits.filter((v) => v.status === 'done').length} done), with ${visits.reduce((s, v) => s + v.interactions.length, 0)} client interactions, ${visits.reduce((s, v) => s + v.observations.length, 0)} observations, ${visits.reduce((s, v) => s + v.stories.length, 0)} stories.`);
  console.log(`Issues: ${items.length} — ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ')}. Emails logged (not sent): ${emails.length}.`);
  console.log('\nSign in to the staff app with any of these PINs:');
  for (const p of staff.all) console.log(`  ${p.pin}  ${p.name.padEnd(18)} ${p.roles.join(' + ')}${p.home ? ` (${p.home})` : p.departmentId ? ` (${p.department})` : ''}`);
  console.log(process.env.DEMO_PASSWORD ? '\nPassword: the DEMO_PASSWORD you set.' : `\nPassword for all of them: ${password}`);
}

main()
  .catch((err) => { console.error(err.message || err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
