/**
 * The rules for saving a visit, kept apart from the database code so they are easy to read.
 *
 * A visit is one JSON document:
 *   { id, employeeId, employeeName, division, region, area, stops[], reason, date, returnDate,
 *     stays[], status: "open" | "done", complaints[], interactions[], observations[], stories[] }
 * ("complaints" are the Action items on screen; the stored name never changed.)
 *
 * Entries are drafts the field person can change until they submit each one. A submitted entry
 * is locked: the server keeps its own copy (which may carry the admin's assignment, the fixer's
 * progress or story likes) whatever the phone sends, and never lets it be removed. Once a visit
 * is marked done the whole visit is locked.
 */

export const ENTRY_LISTS = ['complaints', 'interactions', 'observations', 'stories'] as const;

/** A newly submitted entry; a new action item also gets the fields the admin's workflow needs. */
function stampEntry(list: string, entry: any, visit: any, now: Date) {
  const at = now.toISOString();
  const out = { ...entry, state: 'submitted', submittedAt: entry.submittedAt || at };
  if (list !== 'complaints' || out.status) return out;
  return {
    ...out,
    status: 'Waiting',
    statusModel: 2,
    filedBy: out.filedBy || visit.employeeName,
    visitId: visit.id,
    filedDate: at.slice(0, 10),
    assignedTo: null,
    supervisor: null,
    deadline: null,
    escalationApproved: false,
    resolutionNotes: null,
    log: [{ label: 'Action item submitted', time: now.toLocaleString() }],
  };
}

/** The visit to store, given what's stored now (`prev`, or null) and what the phone sent. */
export function mergeVisit(prev: any | null, body: any, id: string) {
  const now = new Date();
  const next: any = { ...body, id, schema: 3, updatedAt: now.toISOString() };
  for (const list of ENTRY_LISTS) {
    const incoming: any[] = Array.isArray(body[list]) ? body[list] : [];
    const locked = new Map<string, any>((prev?.[list] || []).filter((e: any) => e.state !== 'draft').map((e: any) => [e.id, e]));
    const out = incoming.map(
      (e) => locked.get(e.id) || (e.state === 'submitted' ? stampEntry(list, e, next, now) : { ...e, state: 'draft' }),
    );
    locked.forEach((e, eid) => {
      if (!incoming.some((x) => x.id === eid)) out.push(e);
    });
    next[list] = out;
  }
  next.status = next.status === 'done' ? 'done' : 'open';
  next.doneAt = next.status === 'done' ? next.doneAt || now.toISOString() : null;
  return next;
}

/** Is this action item in this fixer's queue? (assigned to their unit, or named on it) */
export function inFixerQueue(c: any, me: { id: string; roles: string[]; departmentId: string | null }) {
  if (!c.assignedEmployeeId && !c.assignedDepartmentId) return false;
  if (c.assignedDepartmentId && me.departmentId === c.assignedDepartmentId && me.roles.includes('fixer')) return true;
  return c.assignedEmployeeId === me.id || (c.assignees || []).some((a: any) => a.id === me.id);
}

/**
 * What one person may see of a visit. Admins, management and the visit's owner see everything.
 * Everyone else sees only the visit's outline plus its submitted stories (the story feed) and,
 * for fixers, the action items in their queue. Returns null when nothing is visible.
 */
export function visibleTo(user: { kind: string; id: string; roles: string[]; departmentId: string | null }, v: any) {
  if (user.kind === 'admin' || user.roles.includes('management') || v.employeeId === user.id) return v;
  const complaints = user.roles.includes('fixer')
    ? (v.complaints || []).filter((c: any) => c.state !== 'draft' && inFixerQueue(c, user))
    : [];
  const stories = (v.stories || []).filter((s: any) => s.state !== 'draft');
  if (!complaints.length && !stories.length) return null;
  return { ...v, stays: [], interactions: [], observations: [], complaints, stories };
}

/**
 * A visit with no names, contact details, photos, recordings or comments: what the public
 * summary page may read. Only counts and dates are left to compute figures from.
 */
export function anonymised(v: any) {
  const strip = (e: any) => {
    const {
      person, filedBy, assignees, assignedTo, assignedEmployeeEmail, supervisor, supervisors, supervisorEmail,
      resolvedBy, resolvedById, startedBy, longTermBy, comments, likedBy, photo, photos, voice, log,
      resolutionPhotoUrl, resolutionNotes, longTermNote, picture, image, ...rest
    } = e;
    // free text may name people: keep only its length (some figures count how complete entries are)
    const blank = (t: any) => (typeof t === 'string' ? '•'.repeat(Math.min(t.length, 200)) : t);
    const commentCount = Array.isArray(comments) ? comments.length : undefined;
    return { ...rest, commentCount, title: blank(rest.title), description: blank(rest.description), note: blank(rest.note) };
  };
  const { employeeName, stays, ...rest } = v;
  const out: any = { ...rest, employeeName: '' };
  for (const list of ENTRY_LISTS) out[list] = (v[list] || []).map(strip);
  return out;
}

// ---------- a Region or Area renamed or moved by the admin: its past visits follow ----------

/**
 * The visit with every place in `from` (a region, or one area of it) moved to `to`.
 * Returns null if the visit has nothing there.
 */
export function renamePlaceInVisit(
  v: any,
  from: { region: string; area?: string },
  to: { division: string; region: string; area?: string },
) {
  const hit = (p: any) => p && p.region === from.region && (!from.area || p.area === from.area);
  const move = (p: any) => (hit(p) ? { ...p, division: to.division, region: to.region, ...(from.area ? { area: to.area } : {}) } : p);
  const next: any = { ...v, stops: (v.stops || []).map(move) };
  if (v.region === from.region && (!from.area || v.area === from.area)) Object.assign(next, move({ division: v.division, region: v.region, area: v.area }));
  for (const k of ENTRY_LISTS) {
    next[k] = (v[k] || []).map((e: any) => ({ ...e, place: move(e.place), ...(e.places ? { places: e.places.map(move) } : {}) }));
  }
  return JSON.stringify(next) === JSON.stringify(v) ? null : next;
}

// ---------- an office renamed or moved by the admin: relink its past visits ----------

// a branch's region is `region` (older screens call it `district`)
const regionOf = (office: any) => office.region ?? office.district ?? '';
const sameOffice = (name: string, region: string, office: any) =>
  name === office.name && (region || '') === regionOf(office);

/** The visit with every mention of `existing` office changed to the edited `form`. Returns null if unchanged. */
export function relinkOffice(v: any, existing: any, form: any) {
  const movePlace = (p: any) =>
    p && sameOffice(p.office, p.region, existing)
      ? { ...p, office: form.name, branch: p.officeKind === 'branch' ? form.name : p.branch, region: regionOf(form), area: form.area, division: form.division }
      : p && p.branch === existing.name
        ? { ...p, branch: form.name }
        : p;
  const next: any = {
    ...v,
    stops: (v.stops || []).map((s: any) =>
      sameOffice(s.name, s.region, existing) ? { ...s, name: form.name, region: regionOf(form), area: form.area, division: form.division } : s,
    ),
  };
  for (const k of ENTRY_LISTS) {
    next[k] = (v[k] || []).map((e: any) => ({
      ...e,
      place: movePlace(e.place),
      ...(e.places ? { places: e.places.map(movePlace) } : {}),
      ...(e.branch === existing.name ? { branch: form.name } : {}),
    }));
  }
  return JSON.stringify(next) === JSON.stringify(v) ? null : next;
}
