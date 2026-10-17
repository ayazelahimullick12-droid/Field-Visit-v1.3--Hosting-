/**
 * The action item workflow, as plain functions over one action item (stored as a "complaint"
 * on its visit). They change the item in place and return the emails to send; the service
 * (action-items.service.ts) loads, locks and saves the visit around them.
 *
 * Status flow:  Waiting → Assigned → In Progress → Fixed
 *                                  ↘ Long Term  ↗
 * The admin assigns an item to a unit: every fixer in that unit sees it and any one of them
 * can start it, fix it or mark it long term. There are no escalations; a missed deadline
 * shows as "Past deadline" and the admin can extend it.
 */
import { EmailDraft } from '../mail/mail.service';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface Person { id: string; name: string; email: string | null }
/** The people and units the rules need to look at. */
export interface Ctx {
  employees: { id: string; name: string; email: string | null; roles: string[]; departmentId: string | null; supervisorId: string | null }[];
  departments: { id: string; name: string; units: { id: string; name: string }[] }[];
}

const nowIso = () => new Date().toISOString();
const person = (e: any): Person => ({ id: e.id, name: e.name, email: e.email || null });
const names = (list: Person[]) => list.map((p) => p.name).join(', ');
const emails = (list: Person[]) => list.map((p) => p.email).filter(Boolean).join(', ') || null;

function addLog(c: any, label: string) {
  c.log = c.log || [];
  c.log.push({ label, time: new Date().toLocaleString() });
}

const findDept = (ctx: Ctx, idOrName: string) => ctx.departments.find((d) => d.id === idOrName || d.name === idOrName);

/** Fixers of a unit: their emails are the addresses they registered with. */
const unitFixers = (ctx: Ctx, departmentId: string) =>
  ctx.employees.filter((e) => departmentId && e.departmentId === departmentId && e.roles.includes('fixer')).map(person);

/** The fixers working an item now: the unit's current fixers, or whoever was stored when it was assigned. */
function currentFixers(ctx: Ctx, c: any): Person[] {
  const live = unitFixers(ctx, c.assignedDepartmentId);
  if (live.length) return live;
  if (c.assignees?.length) return c.assignees;
  return c.assignedEmployeeId ? [{ id: c.assignedEmployeeId, name: c.assignedTo, email: c.assignedEmployeeEmail }] : [];
}

function supervisorsOf(ctx: Ctx, fixers: Person[]): Person[] {
  const ids = [...new Set(fixers.map((f) => ctx.employees.find((e) => e.id === f.id)?.supervisorId).filter(Boolean))];
  return ids.map((id) => ctx.employees.find((e) => e.id === id)).filter(Boolean).map(person);
}

/** One email per fixer. */
const emailEach = (people: Person[], build: (p: Person) => Omit<EmailDraft, 'to' | 'toName'>): EmailDraft[] =>
  (people.length ? people : [{ id: '', name: '', email: null }]).map((p) => ({ ...build(p), to: p.email, toName: p.name || null }));

const PERSON_LABELS: Record<string, string> = {
  name: 'Name', pin: 'PIN', designation: 'Designation', department: 'Department', contact: 'Contact',
  phone: 'Phone', memberNumber: 'Member number', voCode: 'VO code', branchCode: 'Branch code', projectCode: 'Project code',
};

function raisedByLine(c: any) {
  const entries = Object.entries(c.person || {}).filter(([, v]) => String(v ?? '').trim() !== '');
  if (!entries.length) return null;
  const details = entries.map(([k, v]) => `${PERSON_LABELS[k] || k}: ${v}`).join(', ');
  return `Raised by (${c.source}): ${details}${c.consent === false ? ' — did NOT consent to follow-up' : ''}`;
}

/** "[Field Visit Tracker] High urgency — New action item assigned: FC-ABC123" */
const subjectFor = (c: any, what: string) =>
  `[Field Visit Tracker] ${c.urgency ? `${c.urgency} urgency — ` : ''}${what}: ${c.id}`;

/** The details block at the bottom of every action item email. */
function detailBlock(c: any, visit: any) {
  const where = c.place ? ` (${[c.place.division, c.place.region, c.place.area].filter(Boolean).join(' › ')})` : '';
  return [
    `Action item ID: ${c.id}`,
    ...(c.title ? [`Title: ${c.title}`] : []),
    `Unit: ${c.department}`,
    ...(c.unit ? [`Team: ${c.unit}`] : []),
    `Description: ${c.description || ''}`,
    `Urgency: ${c.urgency || 'N/A'}`,
    `Filed by: ${c.filedBy} (${c.source || 'staff'})`,
    ...(raisedByLine(c) ? [raisedByLine(c)] : []),
    `Filed on: ${c.filedDate}`,
    `Office: ${c.place?.office || c.branch || 'N/A'}${where}`,
    `Related visit: ${visit ? `${visit.id} on ${visit.date || 'N/A'}` : c.visitId}`,
  ].join('\n');
}

function setDeadline(c: any, days: number, type: 'initial' | 'extension') {
  const setAt = new Date();
  const deadline = new Date(setAt.getTime() + days * DAY);
  c.deadline = deadline.toISOString();
  c.deadlineSetAt = setAt.toISOString();
  c.deadlineDays = days;
  c.reminderSent = false;
  c.escalated = false;
  c.escalatedAt = null;
  c.deadlineHistory = c.deadlineHistory || [];
  c.deadlineHistory.push({ deadline: c.deadline, setAt: c.deadlineSetAt, days, type });
  return deadline;
}

// ---------- admin ----------

/** Admin assigns an item to a unit's fixers and gives them `days` to fix it. */
export function assign(ctx: Ctx, c: any, visit: any, { departmentId, unit, days }: any): EmailDraft[] {
  let dept;
  // "Undefined" means the person filing wasn't sure: the admin picks the real unit
  if (c.department === 'Undefined' || c.department === 'Other' || departmentId) {
    dept = findDept(ctx, departmentId);
    if (!dept) throw new Error('A valid unit must be chosen for this action item');
  } else {
    dept = findDept(ctx, c.department);
    if (!dept) throw new Error(`No unit matches "${c.department}" — choose one explicitly`);
  }
  const fixers = unitFixers(ctx, dept.id);
  if (!fixers.length) throw new Error(`No fixer is set up in the "${dept.name}" unit yet`);
  const supervisors = supervisorsOf(ctx, fixers);
  const daysNum = Number(days) || 1;

  const wantedTeam = unit || c.unit;
  const team = (dept.units || []).find((u) => u.name === wantedTeam);
  c.department = dept.name;
  c.unit = team ? team.name : null;
  c.assignedDepartmentId = dept.id;
  c.assignees = fixers;
  c.assignedEmployeeId = fixers[0].id;
  c.assignedTo = names(fixers);
  c.assignedEmployeeEmail = emails(fixers);
  c.supervisors = supervisors;
  c.supervisorId = supervisors[0]?.id || null;
  c.supervisor = supervisors.length ? names(supervisors) : null;
  c.supervisorEmail = emails(supervisors);
  c.status = 'Assigned';
  c.statusModel = 2;
  const deadline = setDeadline(c, daysNum, 'initial');

  addLog(c, `Assigned to the ${dept.name} fixers: ${names(fixers)} (${dept.name}${c.unit ? ` · ${c.unit}` : ''}) — ${daysNum} day(s) given, deadline ${deadline.toLocaleString()}`);
  addLog(c, `Assignment email sent to ${names(fixers)}`);

  return emailEach(fixers, () => ({
    complaintId: c.id,
    type: 'assignment',
    subject: subjectFor(c, 'New action item assigned'),
    body: `Hello,\n\nA new action item has been assigned to the ${dept.name} Unit.\n\n` + detailBlock(c, visit),
  }));
}

/** Admin gives more time. */
export function extend(ctx: Ctx, c: any, visit: any, { days }: any): EmailDraft[] {
  if (!c.assignedEmployeeId) throw new Error('Action item has not been assigned yet');
  const daysNum = Number(days) || 1;
  const deadline = setDeadline(c, daysNum, 'extension');
  addLog(c, `Deadline extended by the admin — ${daysNum} more day(s), new deadline ${deadline.toLocaleString()}`);
  return emailEach(currentFixers(ctx, c), () => ({
    complaintId: c.id,
    type: 'extension',
    subject: subjectFor(c, 'Deadline extended'),
    body: `Hello,\n\nThe deadline for the action item below has been extended by ${daysNum} day(s). New deadline: ${deadline.toLocaleString()}.\n\n` + detailBlock(c, visit),
  }));
}

// ---------- fixers ----------

/** Only a fixer of the unit an item is assigned to can move it along. */
function checkFixer(ctx: Ctx, c: any, employeeId: string) {
  const me = ctx.employees.find((e) => e.id === employeeId);
  if (!me) throw new Error('Unknown employee');
  const allowed =
    currentFixers(ctx, c).some((f) => f.id === me.id) || (c.assignees || []).some((f: any) => f.id === me.id) || c.assignedEmployeeId === me.id;
  if (!allowed) throw new Error('Only a fixer of the unit this action item is assigned to can update it');
  return me;
}

export function start(ctx: Ctx, c: any, employeeId: string) {
  if (c.status !== 'Assigned') throw new Error(`This action item is ${c.status}, so it can't be started`);
  const me = checkFixer(ctx, c, employeeId);
  c.status = 'In Progress';
  c.startedAt = nowIso();
  c.startedBy = me.name;
  addLog(c, `Work started by ${me.name}`);
}

export function longTerm(ctx: Ctx, c: any, employeeId: string, note?: string) {
  if (!['Assigned', 'In Progress'].includes(c.status)) throw new Error(`This action item is ${c.status}, so it can't be marked Long Term`);
  const me = checkFixer(ctx, c, employeeId);
  const text = String(note || '').trim().slice(0, 1000);
  c.status = 'Long Term';
  c.longTermAt = nowIso();
  c.longTermBy = me.name;
  c.longTermNote = text || null;
  addLog(c, `Marked Long Term by ${me.name}${text ? `: "${text}"` : ''}`);
}

export function fixed(ctx: Ctx, c: any, employeeId: string, note?: string, photoUrl?: string) {
  if (!['Assigned', 'In Progress', 'Long Term'].includes(c.status)) throw new Error(`This action item is ${c.status}, so it can't be marked Fixed`);
  const me = checkFixer(ctx, c, employeeId);
  const text = String(note || '').trim().slice(0, 1000);
  c.status = 'Fixed';
  c.resolvedAt = nowIso();
  c.resolvedBy = me.name;
  c.resolvedById = me.id;
  c.resolutionNotes = text || null;
  c.resolutionPhotoUrl = photoUrl || null;
  addLog(c, `Marked Fixed by ${me.name}${text ? `: "${text}"` : ''}${photoUrl ? ' (photo attached)' : ''}`);
}

// ---------- reminders (run every few minutes) ----------

/** A reminder 48 h before the deadline (24 h for deadlines of 2 days or less), once per deadline. */
export function reminderDue(ctx: Ctx, c: any, visit: any, now = new Date()): EmailDraft[] {
  if (c.state === 'draft' || !['Assigned', 'In Progress'].includes(c.status) || !c.deadline || c.reminderSent) return [];
  const deadline = new Date(c.deadline);
  const setAt = new Date(c.deadlineSetAt || c.deadline);
  const windowMs = deadline.getTime() - setAt.getTime() > 2 * DAY ? 48 * HOUR : 24 * HOUR;
  if (now < new Date(deadline.getTime() - windowMs) || now >= deadline) return [];
  c.reminderSent = true;
  addLog(c, `Reminder email sent — deadline in under ${windowMs / HOUR}h`);
  return emailEach(currentFixers(ctx, c), () => ({
    complaintId: c.id,
    type: 'reminder',
    subject: subjectFor(c, 'Deadline reminder'),
    body: `Hello,\n\nThis is a reminder that the deadline for the action item below is ${deadline.toLocaleString()}.\n\n` + detailBlock(c, visit),
  }));
}

// ---------- stories ----------

export function toggleLike(story: any, employeeId: string) {
  const by = new Set<string>(story.likedBy || []);
  if (by.has(employeeId)) by.delete(employeeId);
  else by.add(employeeId);
  story.likedBy = [...by];
  // older stories kept only a count: keep it as likes from before
  story.likesBefore = story.likesBefore ?? Math.max(0, (story.likes || 0) - (story.liked ? 1 : 0));
  story.likes = story.likesBefore + story.likedBy.length;
  delete story.liked;
}

export function addComment(story: any, me: { id: string; name: string }, text: string, id: string) {
  const body = String(text || '').trim().slice(0, 600);
  if (!body) throw new Error('Write a comment first');
  story.comments = Array.isArray(story.comments) ? story.comments : [];
  story.comments.push({ id, byId: me.id, by: me.name, text: body, time: nowIso() });
}
