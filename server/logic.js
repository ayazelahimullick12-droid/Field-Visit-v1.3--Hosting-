// Core business logic for the complaint-assignment / deadline / escalation
// workflow. Kept separate from index.js (routing) so it's easy to read and
// test in isolation. Everything here operates on the in-memory `db` object
// (the parsed contents of db.json) and returns the pieces the caller needs
// to persist and respond with.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
}

function nowIso() {
  return new Date().toISOString();
}

// Every complaint, across every visit, flattened with a back-reference so
// we can find & mutate the right visit/complaint pair.
function flattenComplaints(db) {
  const out = [];
  (db.visits || []).forEach((v) => {
    (v.complaints || []).forEach((c) => {
      out.push({ complaint: c, visit: v });
    });
  });
  return out;
}

function findComplaint(db, visitId, complaintId) {
  const visit = (db.visits || []).find((v) => v.id === visitId);
  if (!visit) return null;
  const complaint = (visit.complaints || []).find((c) => c.id === complaintId);
  if (!complaint) return null;
  return { visit, complaint };
}

function findDeptByIdOrName(db, idOrName) {
  return (db.departments || []).find(
    (d) => d.id === idOrName || d.name === idOrName
  );
}

// Each department has exactly one fixer (enforced in the admin console's
// Employees tab), so assignment is just "find that person."
function getDepartmentFixer(db, departmentId) {
  return (
    (db.employees || []).find(
      (e) => e.departmentId === departmentId && (e.roles || []).includes("fixer")
    ) || null
  );
}

function addLog(complaint, label) {
  complaint.log = complaint.log || [];
  complaint.log.push({ label, time: new Date().toLocaleString() });
}

function pushEmail(db, { complaintId, to, toName, type, subject, body }) {
  db.emailLog = db.emailLog || [];
  const email = {
    id: makeId("MAIL"),
    complaintId,
    to,
    toName,
    type,
    subject,
    body,
    sentAt: nowIso(),
  };
  db.emailLog.push(email);
  return email;
}

function complaintDetailBlock(complaint, visit) {
  return [
    `Complaint ID: ${complaint.id}`,
    `Department: ${complaint.department}`,
    `Description: ${complaint.description}`,
    `Urgency: ${complaint.urgency}`,
    `Filed by: ${complaint.filedBy} (${complaint.source})`,
    `Filed on: ${complaint.filedDate}`,
    `Related visit: ${visit ? `${visit.location || "N/A"} on ${visit.date || "N/A"}` : complaint.visitId}`,
  ].join("\n");
}

// --- Action: assign a complaint to the department's fixer and set its deadline
function assignComplaint(db, { visitId, complaintId, departmentId, days }) {
  const found = findComplaint(db, visitId, complaintId);
  if (!found) throw new Error("Complaint not found");
  const { complaint, visit } = found;

  let dept;
  if (complaint.department === "Other" || departmentId) {
    dept = findDeptByIdOrName(db, departmentId);
    if (!dept) throw new Error("A valid department must be chosen for this complaint");
  } else {
    dept = findDeptByIdOrName(db, complaint.department);
    if (!dept) throw new Error(`No department matches "${complaint.department}" — choose one explicitly`);
  }

  const fixer = getDepartmentFixer(db, dept.id);
  if (!fixer) throw new Error(`No fixer is set up in the "${dept.name}" department yet`);

  const supervisor = fixer.supervisorId
    ? (db.employees || []).find((e) => e.id === fixer.supervisorId)
    : null;

  const daysNum = Number(days) || 1;
  const setAt = new Date();
  const deadline = new Date(setAt.getTime() + daysNum * DAY);

  complaint.department = dept.name;
  complaint.assignedEmployeeId = fixer.id;
  complaint.assignedTo = fixer.name;
  complaint.assignedEmployeeEmail = fixer.email || null;
  complaint.supervisorId = supervisor ? supervisor.id : null;
  complaint.supervisor = supervisor ? supervisor.name : null;
  complaint.supervisorEmail = supervisor ? supervisor.email : null;
  complaint.status = "In Progress";
  complaint.deadline = deadline.toISOString();
  complaint.deadlineSetAt = setAt.toISOString();
  complaint.deadlineDays = daysNum;
  complaint.reminderSent = false;
  complaint.escalated = false;
  complaint.escalatedAt = null;
  complaint.deadlineHistory = complaint.deadlineHistory || [];
  complaint.deadlineHistory.push({
    deadline: complaint.deadline,
    setAt: complaint.deadlineSetAt,
    days: daysNum,
    type: "initial",
  });

  addLog(
    complaint,
    `Assigned to ${fixer.name} (${dept.name}) — ${daysNum} day(s) given, deadline ${deadline.toLocaleString()}`
  );

  const email = pushEmail(db, {
    complaintId: complaint.id,
    to: fixer.email || "(no email on file)",
    toName: fixer.name,
    type: "assignment",
    subject: `[Field Visit Tracker] New complaint assigned: ${complaint.id}`,
    body:
      `Hello ${fixer.name},\n\nA new complaint has been assigned to you. You have ${daysNum} day(s) to resolve it (deadline: ${deadline.toLocaleString()}).\n\n` +
      complaintDetailBlock(complaint, visit),
  });

  addLog(complaint, `Assignment email generated for ${fixer.name}`);

  return { complaint, email };
}

// --- Action: admin grants a supervisor-approved extension -----------------
function extendDeadline(db, { visitId, complaintId, days }) {
  const found = findComplaint(db, visitId, complaintId);
  if (!found) throw new Error("Complaint not found");
  const { complaint, visit } = found;
  if (!complaint.assignedEmployeeId) throw new Error("Complaint has not been assigned yet");

  const daysNum = Number(days) || 1;
  const setAt = new Date();
  const deadline = new Date(setAt.getTime() + daysNum * DAY);

  complaint.deadline = deadline.toISOString();
  complaint.deadlineSetAt = setAt.toISOString();
  complaint.deadlineDays = daysNum;
  complaint.reminderSent = false;
  complaint.escalated = false;
  complaint.escalatedAt = null;
  complaint.deadlineHistory = complaint.deadlineHistory || [];
  complaint.deadlineHistory.push({
    deadline: complaint.deadline,
    setAt: complaint.deadlineSetAt,
    days: daysNum,
    type: "extension",
  });

  addLog(
    complaint,
    `Deadline extended by admin (per supervisor's instruction) — ${daysNum} more day(s), new deadline ${deadline.toLocaleString()}`
  );

  const email = pushEmail(db, {
    complaintId: complaint.id,
    to: complaint.assignedEmployeeEmail || "(no email on file)",
    toName: complaint.assignedTo,
    type: "extension",
    subject: `[Field Visit Tracker] Deadline extended: ${complaint.id}`,
    body:
      `Hello ${complaint.assignedTo},\n\nYour deadline for the complaint below has been extended by ${daysNum} day(s). New deadline: ${deadline.toLocaleString()}.\n\n` +
      complaintDetailBlock(complaint, visit),
  });

  return { complaint, email };
}

// --- Action: fixer marks a complaint resolved ------------------------------
function resolveComplaint(db, { visitId, complaintId, employeeId }) {
  const found = findComplaint(db, visitId, complaintId);
  if (!found) throw new Error("Complaint not found");
  const { complaint } = found;
  const employee = (db.employees || []).find((e) => e.id === employeeId);

  complaint.status = "Resolved";
  complaint.resolvedAt = nowIso();
  complaint.resolvedBy = employee ? employee.name : employeeId;
  addLog(complaint, `Marked resolved by ${complaint.resolvedBy}`);

  return { complaint };
}

// --- Periodic / manual: reminders + escalations ---------------------------
function runDeadlineCheck(db) {
  const generated = [];
  const now = new Date();

  flattenComplaints(db).forEach(({ complaint, visit }) => {
    if (complaint.status !== "In Progress" || !complaint.deadline) return;

    const deadline = new Date(complaint.deadline);
    const setAt = new Date(complaint.deadlineSetAt || complaint.deadline);
    const totalMs = deadline.getTime() - setAt.getTime();
    const reminderWindowMs = totalMs > 2 * DAY ? 48 * HOUR : 24 * HOUR;
    const reminderAt = new Date(deadline.getTime() - reminderWindowMs);

    // Reminder — fires once per deadline cycle.
    if (!complaint.reminderSent && now >= reminderAt && now < deadline) {
      complaint.reminderSent = true;
      addLog(complaint, `Reminder email sent — deadline in under ${reminderWindowMs / HOUR}h`);
      const email = pushEmail(db, {
        complaintId: complaint.id,
        to: complaint.assignedEmployeeEmail || "(no email on file)",
        toName: complaint.assignedTo,
        type: "reminder",
        subject: `[Field Visit Tracker] Reminder — deadline approaching: ${complaint.id}`,
        body:
          `Hello ${complaint.assignedTo},\n\nThis is a reminder that your deadline for the complaint below is ${deadline.toLocaleString()}.\n\n` +
          complaintDetailBlock(complaint, visit),
      });
      generated.push(email);
    }

    // Escalation — fires once per deadline cycle, to the supervisor.
    if (!complaint.escalated && now >= deadline) {
      complaint.escalated = true;
      complaint.escalatedAt = nowIso();
      addLog(
        complaint,
        `Deadline missed — escalation email sent to supervisor (${complaint.supervisor || "none on file"})`
      );
      const email = pushEmail(db, {
        complaintId: complaint.id,
        to: complaint.supervisorEmail || "(no email on file)",
        toName: complaint.supervisor,
        type: "escalation",
        subject: `[Field Visit Tracker] ESCALATION — deadline missed: ${complaint.id}`,
        body:
          `Hello ${complaint.supervisor || ""},\n\n${complaint.assignedTo} has missed the deadline (${deadline.toLocaleString()}) for the complaint below. Please advise the admin how much extra time to grant.\n\n` +
          complaintDetailBlock(complaint, visit),
      });
      generated.push(email);
    }
  });

  return generated;
}

export { assignComplaint, extendDeadline, resolveComplaint, runDeadlineCheck };
