import React, { useState, useMemo, useEffect } from "react";
import {
  X, Check, Search, Users, ShieldAlert, Building2, AlertCircle, CheckSquare, Hourglass, UserCheck, Radar,
  Plus, Edit3, Inbox, RefreshCw, MapPin, MessageCircle, TrendingUp, CheckCircle2, ChevronDown, ChevronUp, Trash2,
} from "lucide-react";
import { usePersistedCollection } from "../lib/usePersistedCollection";
import { makeId } from "../lib/ids";
import { useTheme } from "../lib/theme";
import AppShell from "../lib/AppShell";
import { Reveal } from "../lib/ui";
import { Kpi } from "../staff/analytics/common";
import { DEFAULT_SETTINGS, computeCoverage } from "../lib/offices";
import { PersonDetails } from "../lib/PersonInfo";
import { TERMS, lower } from "../lib/terms";
import OfficesTab from "./OfficesTab";
import NetworkHealth from "../staff/NetworkHealth";
import BranchProfile from "../staff/BranchProfile";

/* The admin console shares the staff app's design system (src/styles/brac.css)
   and navigation shell, so both sides of the product look and feel the same. */

/* =========================================================================
   HELPERS
   ========================================================================= */

const API_BASE = "/api";

async function postAction(path, body) {
  const res = await fetch(`${API_BASE}/actions/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Action failed");
  return json;
}

// Re-pulls a collection from the server after a server-side action mutated
// it directly on disk (the action endpoints bypass the usual client PUT, so
// local state needs a manual refresh to see what changed).
async function refetch(name, setter) {
  const res = await fetch(`${API_BASE}/${name}`);
  if (!res.ok) return;
  const data = await res.json();
  setter(() => data);
}

const isOverdue = (c) => c.status === "In Progress" && c.deadline && new Date(c.deadline) < new Date();
const URGENCY_RANK = { High: 0, Medium: 1, Low: 2 };

/* =========================================================================
   MAIN APP
   ========================================================================= */

const ADMIN_SESSION_KEY = "fvt-admin-session"; // stores the signed-in admin's email

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [adminUsers, , adminUsersLoaded] = usePersistedCollection("adminUsers", []);
  const [sessionEmail] = useState(() => {
    try { return sessionStorage.getItem(ADMIN_SESSION_KEY); } catch { return null; }
  });
  const currentAdmin = adminUsers.find((a) => a.email.toLowerCase() === (sessionEmail || "").toLowerCase()) || null;

  const handleLogout = () => {
    try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* ignore */ }
    window.location.href = "/";
  };

  // Sign-in lives on the unified landing page ("/"). No valid admin session
  // here (never logged in, or an email that no longer matches an admin
  // account) bounces back there instead of showing a login form.
  useEffect(() => {
    if (!adminUsersLoaded) return;
    if (!currentAdmin) {
      try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* ignore */ }
      window.location.replace("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUsersLoaded, currentAdmin]);

  if (!adminUsersLoaded || !currentAdmin) {
    return (
      <div className="fvt">
        <div className="session-loading"><div className="brand-mark"><ShieldAlert size={20} /></div></div>
      </div>
    );
  }

  return (
    <div className="fvt">
      <AdminShell theme={theme} toggleTheme={toggleTheme} onLogout={handleLogout} currentAdmin={currentAdmin} />
    </div>
  );
}

/* =========================================================================
   SHELL (tabs + top nav, shared across all admin pages)
   ========================================================================= */

function AdminShell({ theme, toggleTheme, onLogout, currentAdmin }) {
  const [tab, setTab] = useState("queue");
  const [toast, setToast] = useState(null);
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3800);
  };

  const [visits, setVisits] = usePersistedCollection("visits", []);
  const [departments, setDepartments] = usePersistedCollection("departments", []);
  const [employees, setEmployees] = usePersistedCollection("employees", []);
  const [emailLog, setEmailLog] = usePersistedCollection("emailLog", []);
  const [offices, setOffices] = usePersistedCollection("offices", []);
  const [settings, setSettings] = usePersistedCollection("settings", DEFAULT_SETTINGS);

  const complaints = useMemo(
    () =>
      visits.flatMap((v) =>
        (v.complaints || []).map((c) => ({
          ...c,
          visitId: v.id,
          location: v.location,
          visitDate: v.date,
          visitReason: v.reason,
          district: v.region,
        }))
      ),
    [visits]
  );

  const refreshAfterAction = async () => {
    await Promise.all([refetch("visits", setVisits), refetch("emailLog", setEmailLog)]);
  };

  // badge on the Complaints tab: things waiting on an admin
  const needsAction = complaints.filter((c) => c.status === "Open" || (c.escalated && c.status !== "Resolved")).length;

  // Network health / coverage lives here (admin-only for now — see src/lib/features.js)
  const target = settings?.visitTargetDays || DEFAULT_SETTINGS.visitTargetDays;
  const coverage = useMemo(() => computeCoverage(offices, visits, target), [offices, visits, target]);
  const [branchKey, setBranchKey] = useState(null);
  const branchRow = branchKey ? coverage.find((o) => o.key === branchKey) : null;
  const openBranch = (office) => { setBranchKey(office.key); setTab("branch"); window.scrollTo({ top: 0 }); };

  const tabs = [
    { key: "queue", label: "Complaints", short: "Complaints", icon: MessageCircle, count: needsAction },
    { key: "network", label: "Network health", short: "Network", icon: Radar },
    { key: "departments", label: TERMS.units, short: TERMS.units, icon: Building2 },
    { key: "employees", label: "Employees", short: "People", icon: Users },
    { key: "offices", label: "Offices", short: "Offices", icon: MapPin },
    { key: "emails", label: "Sent emails", short: "Emails", icon: Inbox },
  ];

  return (
    <>
      <AppShell
        theme={theme} onToggleTheme={toggleTheme} brandSub="BRAC · Admin Console"
        tabs={tabs} active={tab === "branch" ? "network" : tab} pageKey={tab} onTab={setTab}
        user={currentAdmin.name} userSub="Administrator" onLogout={onLogout}
      >
        {tab === "queue" && (
          <ComplaintsTab complaints={complaints} departments={departments} employees={employees} showToast={showToast} onRefresh={refreshAfterAction} />
        )}
        {tab === "network" && <NetworkHealth visits={visits} offices={offices} settings={settings} onOpenBranch={openBranch} />}
        {tab === "branch" && branchRow && (
          <BranchProfile office={branchRow} coverageRows={coverage} onBack={() => setTab("network")} canRegister={false} />
        )}
        {tab === "departments" && (
          <DepartmentsTab departments={departments} setDepartments={setDepartments} employees={employees} complaints={complaints} showToast={showToast} />
        )}
        {tab === "employees" && (
          <EmployeesTab employees={employees} setEmployees={setEmployees} departments={departments} showToast={showToast} />
        )}
        {tab === "offices" && (
          <OfficesTab offices={offices} setOffices={setOffices} visits={visits} setVisits={setVisits} settings={settings} setSettings={setSettings} showToast={showToast} />
        )}
        {tab === "emails" && <SentEmailsTab emailLog={emailLog} />}
      </AppShell>

      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </>
  );
}

function PageHead({ eyebrow, title, desc, children }) {
  return (
    <div className="page-head">
      <div>
        <p className="h-eyebrow">{eyebrow}</p>
        <h1 className="h-title">{title}</h1>
        {desc && <p className="h-desc">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

/* =========================================================================
   TAB: COMPLAINTS QUEUE / ASSIGNMENT / ESCALATION
   ========================================================================= */

function ComplaintsTab({ complaints, departments, employees, showToast, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState("");
  const [urgency, setUrgency] = useState("all");
  const [showResolved, setShowResolved] = useState(false);

  const stats = useMemo(() => {
    const unassigned = complaints.filter((c) => c.status === "Open").length;
    const escalated = complaints.filter((c) => c.escalated && c.status !== "Resolved").length;
    const overdueNotEscalated = complaints.filter((c) => isOverdue(c) && !c.escalated).length;
    const inProgress = complaints.filter((c) => c.status === "In Progress").length;
    const resolved = complaints.filter((c) => c.status === "Resolved").length;
    return { unassigned, escalated, overdueNotEscalated, inProgress, resolved, rate: complaints.length ? Math.round((resolved / complaints.length) * 100) : 0 };
  }, [complaints]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return complaints.filter((c) =>
      (urgency === "all" || c.urgency === urgency) &&
      (!q || `${c.id} ${c.visitId} ${c.location} ${c.department} ${c.unit || ""} ${c.assignedTo} ${c.filedBy} ${c.description} ${Object.values(c.person || {}).join(" ")}`.toLowerCase().includes(q))
    );
  }, [complaints, query, urgency]);

  const byUrgency = (a, b) => (URGENCY_RANK[a.urgency] ?? 3) - (URGENCY_RANK[b.urgency] ?? 3) || (b.visitDate || "").localeCompare(a.visitDate || "");
  const unassignedList = visible.filter((c) => c.status === "Open").sort(byUrgency);
  const escalatedList = visible.filter((c) => c.escalated && c.status !== "Resolved").sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0));
  const inProgressList = visible.filter((c) => c.status === "In Progress" && !c.escalated).sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0));
  const resolvedList = visible.filter((c) => c.status === "Resolved").sort((a, b) => new Date(b.resolvedAt || 0) - new Date(a.resolvedAt || 0));
  const resolvedShown = showResolved ? resolvedList : resolvedList.slice(0, 8);

  const handleRunCheck = async () => {
    setRunning(true);
    try {
      const { emailsGenerated } = await postAction("run-deadline-check", {});
      await onRefresh();
      showToast(emailsGenerated > 0 ? `Deadline check ran — ${emailsGenerated} email(s) generated.` : "Deadline check ran — nothing due yet.");
    } catch (err) {
      showToast(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="page">
      <PageHead eyebrow="Administrative overview" title="Complaints center"
        desc="Assign complaints to each unit's fixer, set deadlines, and track escalations — all sourced live from the visits database.">
        <button className="btn btn-secondary btn-sm" onClick={handleRunCheck} disabled={running}>
          <RefreshCw size={14} className={running ? "spin" : ""} /> {running ? "Checking…" : "Run deadline check"}
        </button>
      </PageHead>

      {complaints.length === 0 && (
        <div className="card empty-state" style={{ marginBottom: 28 }}>
          No complaints in the database yet. As field staff file complaints during their visits, they'll appear here automatically.
        </div>
      )}

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <Reveal i={0}><Kpi icon={AlertCircle} tone="red" label="To be assigned" value={stats.unassigned} /></Reveal>
        <Reveal i={1}><Kpi icon={ShieldAlert} tone="red" label="Escalated" value={stats.escalated} /></Reveal>
        <Reveal i={2}><Kpi icon={Hourglass} tone="amber" label="Overdue · escalation pending" value={stats.overdueNotEscalated} /></Reveal>
        <Reveal i={3}><Kpi icon={TrendingUp} tone="blue" label="In progress" value={stats.inProgress} /></Reveal>
        <Reveal i={4}><Kpi icon={CheckCircle2} tone="green" label="Resolved" value={stats.resolved} /></Reveal>
        <Reveal i={5}><Kpi icon={CheckSquare} tone="green" label="Resolution rate" value={stats.rate} suffix="%" /></Reveal>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input className="input" placeholder="Search by ID, branch, unit, team, person…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="filter-chips">
          {[["all", "All urgency"], ["High", "High"], ["Medium", "Medium"], ["Low", "Low"]].map(([k, label]) => (
            <button key={k} className={`filter-chip ${urgency === k ? "active" : ""}`} onClick={() => setUrgency(k)}>{label}</button>
          ))}
        </div>
      </div>

      <Section title="To be assigned" icon={<AlertCircle size={17} />} color="var(--danger)" count={unassignedList.length}>
        <ComplaintTable items={unassignedList} onSelect={setSelected} emptyMsg="No unassigned complaints." actionLabel="Assign" />
      </Section>

      <Section title="Escalated — awaiting extension" icon={<ShieldAlert size={17} />} color="var(--danger)" count={escalatedList.length}>
        <ComplaintTable items={escalatedList} onSelect={setSelected} emptyMsg="Nothing currently escalated." actionLabel="Grant extension" highlightDeadline />
      </Section>

      <Section title="In progress" icon={<Hourglass size={17} />} count={inProgressList.length}>
        <ComplaintTable items={inProgressList} onSelect={setSelected} emptyMsg="Nothing in progress." actionLabel="View" />
      </Section>

      <Section title="Resolved" icon={<CheckSquare size={17} />} color="var(--success)" count={resolvedList.length}>
        <ComplaintTable items={resolvedShown} onSelect={setSelected} emptyMsg="Nothing resolved yet." actionLabel="View" />
        {resolvedList.length > 8 && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowResolved((s) => !s)}>
              {showResolved ? <>Show fewer <ChevronUp size={14} /></> : <>Show all {resolvedList.length} <ChevronDown size={14} /></>}
            </button>
          </div>
        )}
      </Section>

      {selected && (
        <ComplaintModal
          // re-resolve against live data so the modal reflects what just changed
          complaint={complaints.find((c) => c.id === selected.id && c.visitId === selected.visitId) || selected}
          departments={departments}
          employees={employees}
          onClose={() => setSelected(null)}
          showToast={showToast}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

function Section({ title, icon, color, count, children }) {
  return (
    <Reveal className="admin-section">
      <div className="section-header">
        <div className="section-title" style={color ? { color } : undefined}>{icon} {title}</div>
        <span className="badge-count" style={color ? { background: "transparent", color } : undefined}>{count}</span>
      </div>
      {children}
    </Reveal>
  );
}

function ComplaintTable({ items, onSelect, emptyMsg, actionLabel, highlightDeadline }) {
  if (items.length === 0) return <div className="card empty-state">{emptyMsg}</div>;

  return (
    <div className="ctable-wrap">
      <table className="ctable stack">
        <thead>
          <tr>
            <th>ID</th><th>Branch</th><th>{TERMS.unit} / {lower(TERMS.team)}</th><th>Description</th><th>Urgency</th>
            <th>Deadline</th><th>Assigned to</th><th style={{ textAlign: "right" }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={`${c.visitId}-${c.id}`} style={{ cursor: "pointer" }} onClick={() => onSelect(c)}>
              <td data-label="ID" className="mono" style={{ fontWeight: 700 }}>{c.id}</td>
              <td data-label="Branch"><div className="cell-main">{c.location || "—"}</div><div className="cell-sub mono">{c.visitId}</div></td>
              <td data-label={`${TERMS.unit} / ${lower(TERMS.team)}`}>
                <div className="cell-main">{c.department || "Unassigned"}{c.source && <span className="source-badge" style={{ marginLeft: 6 }}>{c.source}</span>}</div>
                {c.unit && <div className="cell-sub">{c.unit}</div>}
              </td>
              <td data-label="Description">
                <div className="cell-clip">{c.description}</div>
                {c.person?.name && <div className="cell-sub">Raised by {c.person.name}</div>}
              </td>
              <td data-label="Urgency"><span className={`urgency-badge urgency-${c.urgency}`}>{c.urgency}</span></td>
              <td data-label="Deadline" className="mono" style={{ color: highlightDeadline ? "var(--danger)" : "inherit", fontWeight: highlightDeadline ? 700 : 400 }}>
                {c.deadline ? new Date(c.deadline).toLocaleString() : "Not set"}
              </td>
              <td data-label="Assigned to">{c.assignedTo || "Unassigned"}</td>
              <td data-label="" style={{ textAlign: "right" }}>
                <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); onSelect(c); }}>{actionLabel}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Filed → assigned → being fixed → resolved, at a glance. */
function Journey({ c }) {
  const resolved = c.status === "Resolved";
  const escalated = c.escalated && !resolved;
  const steps = [
    { label: "Filed", done: true },
    { label: "Assigned", done: !!c.assignedTo },
    { label: escalated ? "Escalated" : "Being fixed", done: c.status === "In Progress" || resolved, alert: escalated },
    { label: "Resolved", done: resolved },
  ];
  const now = steps.findIndex((s) => !s.done);
  return (
    <div className="journey" aria-label="Complaint progress">
      {steps.map((s, i) => (
        <div key={s.label} className={`jr-step ${s.done ? "done" : ""} ${resolved ? "all" : ""} ${i === now ? "now" : ""} ${s.alert ? "alert" : ""}`}>
          <span className="jr-dot">{(s.done || s.alert) && <Check size={13} strokeWidth={3.2} />}</span>
          {s.label}
        </div>
      ))}
    </div>
  );
}

function ComplaintModal({ complaint: c, departments, employees, onClose, showToast, onRefresh }) {
  const [deptId, setDeptId] = useState(departments[0]?.id || "");
  const [unitName, setUnitName] = useState("");
  const [days, setDays] = useState(3);
  const [extendDays, setExtendDays] = useState(2);
  const [busy, setBusy] = useState(false);

  const isOther = c.department === "Other";
  const fixerInDept = (id) => employees.find((e) => e.departmentId === id && (e.roles || []).includes("fixer"));
  const previewDept = isOther ? deptId : departments.find((d) => d.name === c.department)?.id;
  const previewFixer = previewDept ? fixerInDept(previewDept) : null;

  const handleAssign = async () => {
    setBusy(true);
    try {
      await postAction("assign-complaint", {
        visitId: c.visitId,
        complaintId: c.id,
        departmentId: isOther ? deptId : undefined,
        unit: isOther ? unitName || undefined : undefined,
        days,
      });
      await onRefresh();
      showToast("Complaint assigned — assignment email generated.");
      onClose();
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExtend = async () => {
    setBusy(true);
    try {
      await postAction("extend-deadline", { visitId: c.visitId, complaintId: c.id, days: extendDays });
      await onRefresh();
      showToast("Deadline extended — new notification email generated.");
      onClose();
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const meta = (label, value) => value ? (
    <div className="meta-row"><span className="meta-k">{label}</span><span className="meta-v">{value}</span></div>
  ) : null;

  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="mono" style={{ fontSize: 12, color: "var(--ink-faint)" }}>{c.id}</span>
            <h1 className="h-title" style={{ fontSize: 19, marginTop: 2 }}>Complaint</h1>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <StatusPill status={c.status} />
              <span className={`urgency-badge urgency-${c.urgency}`}>{c.urgency}</span>
              {c.escalated && c.status !== "Resolved" && <span className="type-badge type-escalation">Escalated</span>}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>

        <div className="modal-body">
          <Journey c={c} />

          <p style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 16 }}>{c.description}</p>

          {c.photoUrl && (
            <img src={c.photoUrl} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 14, marginBottom: 16 }} />
          )}

          <div className="meta-box">
            {meta("Filed by", c.filedBy)}
            {meta("Raised by", <PersonDetails kind={c.source} person={c.person} consent={c.consent} />)}
            {meta("Visit", <><span className="mono">{c.visitId}</span> — {c.location} · {c.visitDate}</>)}
            {meta("Visit reason", c.visitReason)}
            {meta(TERMS.unit, c.department)}
            {meta(TERMS.team, c.unit)}
            {meta("Assigned to", c.assignedTo && <>{c.assignedTo} · supervisor {c.supervisor || "—"}</>)}
            {meta("Deadline", c.deadline && new Date(c.deadline).toLocaleString())}
          </div>

          {c.status === "Open" && (
            <div className="card card-pad" style={{ background: "var(--paper)" }}>
              <p className="field-label">Assign &amp; set deadline</p>

              {isOther ? (
                <div className="field-group">
                  <label className="field-label">This complaint was filed as "Other" — choose the real {lower(TERMS.unit)}</label>
                  <select className="select" value={deptId} onChange={(e) => { setDeptId(e.target.value); setUnitName(""); }}>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  {(departments.find((d) => d.id === deptId)?.units || []).length > 0 && (
                    <>
                      <label className="field-label" style={{ marginTop: 12 }}>{TERMS.team} <span style={{ fontWeight: 500, color: "var(--ink-faint)" }}>(optional)</span></label>
                      <select className="select" value={unitName} onChange={(e) => setUnitName(e.target.value)}>
                        <option value="">{`No specific ${lower(TERMS.team)}`}</option>
                        {departments.find((d) => d.id === deptId).units.map((u) => <option key={u.id}>{u.name}</option>)}
                      </select>
                    </>
                  )}
                </div>
              ) : (
                <div className="field-group">
                  <label className="field-label">{TERMS.unit} (from complaint)</label>
                  <input className="input" value={c.department} disabled />
                </div>
              )}

              <div className="auto-assign-box">
                <UserCheck size={15} style={{ flexShrink: 0 }} />
                {previewFixer
                  ? `Will assign to ${previewFixer.name} — the fixer for this ${lower(TERMS.unit)}.`
                  : `No fixer is set up in this ${lower(TERMS.unit)} yet — add one under Employees first.`}
              </div>

              <div className="field-group" style={{ marginTop: 14 }}>
                <label className="field-label">Time given to fix (days)</label>
                <input type="number" min="1" max="60" className="input" value={days} onChange={(e) => setDays(e.target.value)} />
                <p style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 6 }}>
                  A reminder email goes out {Number(days) > 2 ? "48" : "24"} hours before this deadline; an escalation email goes to the supervisor automatically if it's missed.
                </p>
              </div>

              <button className="btn btn-primary btn-block" onClick={handleAssign} disabled={busy || !previewFixer}>
                Confirm assignment &amp; set deadline
              </button>
            </div>
          )}

          {c.escalated && c.status !== "Resolved" && (
            <div className="card card-pad" style={{ background: "var(--danger-wash)", borderColor: "transparent" }}>
              <p className="field-label" style={{ color: "var(--danger)" }}>Deadline missed — escalated</p>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
                An automatic escalation email was already sent to <strong>{c.supervisor || "the supervisor"}</strong>. Once they tell you how much extra time to grant, enter it here — this restarts the reminder/escalation cycle against the new deadline.
              </p>
              <div className="field-group">
                <label className="field-label">Extension granted by supervisor (days)</label>
                <input type="number" min="1" max="60" className="input" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} />
              </div>
              <button className="btn btn-danger btn-block" onClick={handleExtend} disabled={busy}>
                Grant extension &amp; notify employee
              </button>
            </div>
          )}

          {c.status === "Resolved" && (
            <div className="card card-pad" style={{ background: "var(--success-wash)", borderColor: "transparent", marginBottom: 14 }}>
              <p className="field-label" style={{ color: "var(--success)" }}>Resolved</p>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>
                Resolved by <strong>{c.resolvedBy}</strong> on {c.resolvedAt ? new Date(c.resolvedAt).toLocaleString() : "—"}.
              </p>
            </div>
          )}

          {c.log && c.log.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <p className="field-label">Activity</p>
              <Timeline log={c.log} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Timeline({ log }) {
  if (!log || log.length === 0) return <p style={{ fontSize: 12, color: "var(--ink-faint)" }}>No activity yet.</p>;
  return (
    <div className="timeline">
      {log.map((item, i) => (
        <div className="tl-item" key={i}>
          <div className="tl-dot-wrap">
            <div className="tl-dot" />
            {i < log.length - 1 && <div className="tl-bar" />}
          </div>
          <div>
            <div className="tl-label">{item.label}</div>
            <div className="tl-time">{item.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ status }) {
  const key = status.replace(/\s/g, "");
  return <span className={`status-pill status-${key}`}>{status}</span>;
}

/* =========================================================================
   TAB: DEPARTMENTS
   ========================================================================= */

function DepartmentsTab({ departments, setDepartments, employees, complaints, showToast }) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [openId, setOpenId] = useState(null); // department whose units are being edited

  const handleAdd = () => {
    if (!name.trim()) return;
    if (departments.some((d) => d.name.toLowerCase() === name.trim().toLowerCase())) { showToast(`That ${lower(TERMS.unit)} already exists.`); return; }
    setDepartments((ds) => [...ds, { id: makeId("DEPT"), name: name.trim(), units: [] }]);
    showToast(`${TERMS.unit} "${name.trim()}" added.`);
    setName("");
  };

  const startEdit = (d) => { setEditingId(d.id); setEditingName(d.name); };
  const saveEdit = () => {
    if (!editingName.trim()) return;
    setDepartments((ds) => ds.map((d) => (d.id === editingId ? { ...d, name: editingName.trim() } : d)));
    setEditingId(null);
  };

  const rows = departments.map((d) => {
    const team = employees.filter((e) => e.departmentId === d.id);
    const mine = complaints.filter((c) => c.department === d.name);
    return {
      d,
      fixer: team.find((e) => (e.roles || []).includes("fixer")),
      team: team.length,
      open: mine.filter((c) => c.status !== "Resolved").length,
      resolved: mine.filter((c) => c.status === "Resolved").length,
      unitCounts: Object.fromEntries((d.units || []).map((u) => [u.id, mine.filter((c) => c.unit === u.name).length])),
    };
  });

  return (
    <div className="page">
      <PageHead eyebrow="Configuration" title={TERMS.units}
        desc={`Complaints are filed against a ${lower(TERMS.unit)} and one of its ${lower(TERMS.teams)}. They are routed to that ${lower(TERMS.unit)}'s single fixer — or, for "Other," to whichever ${lower(TERMS.unit)} you pick when assigning.`} />

      <Reveal className="card card-pad" style={{ marginBottom: 20, maxWidth: 460 }}>
        <label className="field-label">Add a {lower(TERMS.unit)}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="e.g. Legal" value={name} onChange={(e) => setName(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          <button className="btn btn-primary" onClick={handleAdd}><Plus size={14} /> Add</button>
        </div>
      </Reveal>

      <div className="ctable-wrap">
        <table className="ctable stack">
          <thead><tr><th>{TERMS.unit}</th><th>{TERMS.teams}</th><th>Fixer</th><th>People</th><th>Open</th><th>Resolved</th><th style={{ textAlign: "right" }}>Action</th></tr></thead>
          <tbody>
            {rows.map(({ d, fixer, team, open, resolved, unitCounts }) => (
              <React.Fragment key={d.id}>
                <tr>
                  <td data-label={TERMS.unit}>
                    {editingId === d.id
                      ? <input className="input" value={editingName} onChange={(e) => setEditingName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} style={{ maxWidth: 260 }} autoFocus />
                      : <strong>{d.name}</strong>}
                  </td>
                  <td data-label={TERMS.teams}><span className="pill pill-brand">{(d.units || []).length} {lower(TERMS.team)}{(d.units || []).length === 1 ? "" : "s"}</span></td>
                  <td data-label="Fixer">{fixer ? fixer.name : <span className="pill pill-stale">No fixer yet</span>}</td>
                  <td data-label="People">{team}</td>
                  <td data-label="Open">{open > 0 ? <span className="pill pill-stale">{open}</span> : <span style={{ color: "var(--ink-faint)" }}>0</span>}</td>
                  <td data-label="Resolved">{resolved}</td>
                  <td data-label="" style={{ textAlign: "right" }}>
                    <div className="row-actions">
                      {editingId === d.id ? (
                        <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                      ) : (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(openId === d.id ? null : d.id)}>
                            {openId === d.id ? <><ChevronUp size={13} /> {TERMS.teams}</> : <><ChevronDown size={13} /> {TERMS.teams}</>}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => startEdit(d)}><Edit3 size={12} /> Rename</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {openId === d.id && (
                  <tr className="expand-row">
                    <td colSpan={7} data-label="">
                      <UnitsEditor dept={d} counts={unitCounts} setDepartments={setDepartments} showToast={showToast} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Add / rename / remove the units of one department. Complaints keep the unit name they were filed with. */
function UnitsEditor({ dept, counts, setDepartments, showToast }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(null); // { id, value }
  const [confirmId, setConfirmId] = useState(null);
  const units = dept.units || [];

  const mutate = (fn) => setDepartments((ds) => ds.map((d) => (d.id === dept.id ? { ...d, units: fn(d.units || []) } : d)));
  const taken = (n, exceptId) => units.some((u) => u.id !== exceptId && u.name.toLowerCase() === n.toLowerCase());

  const add = () => {
    const n = draft.trim();
    if (!n) return;
    if (taken(n)) { showToast(`${dept.name} already has a ${lower(TERMS.team)} called "${n}".`); return; }
    mutate((us) => [...us, { id: makeId("UNIT"), name: n }]);
    setDraft("");
  };
  const saveRename = () => {
    const n = editing.value.trim();
    if (!n) return;
    if (taken(n, editing.id)) { showToast(`${dept.name} already has a ${lower(TERMS.team)} called "${n}".`); return; }
    mutate((us) => us.map((u) => (u.id === editing.id ? { ...u, name: n } : u)));
    setEditing(null);
  };
  const remove = (u) => {
    if (confirmId !== u.id) { setConfirmId(u.id); return; }
    mutate((us) => us.filter((x) => x.id !== u.id));
    setConfirmId(null);
    showToast(`${TERMS.team} "${u.name}" removed${counts[u.id] ? ` — its ${counts[u.id]} existing complaint(s) keep the name` : ""}.`);
  };

  return (
    <div className="units-editor">
      <p className="field-label" style={{ marginBottom: 10 }}>{TERMS.teams} in {dept.name}</p>
      {units.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-faint)", margin: "0 0 12px" }}>No {lower(TERMS.teams)} yet — complaints for this {lower(TERMS.unit)} will be filed without one.</p>}
      <div className="unit-list">
        {units.map((u) => (
          <div className="unit-row" key={u.id}>
            {editing?.id === u.id ? (
              <>
                <input className="input" value={editing.value} autoFocus onChange={(e) => setEditing({ id: u.id, value: e.target.value })}
                       onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditing(null); }} />
                <button className="btn btn-primary btn-sm" onClick={saveRename}>Save</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
              </>
            ) : (
              <>
                <span className="unit-name">{u.name}</span>
                <span className="unit-count">{counts[u.id] || 0} complaint{counts[u.id] === 1 ? "" : "s"}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditing({ id: u.id, value: u.name }); setConfirmId(null); }}><Edit3 size={12} /> Rename</button>
                <button className={`btn btn-sm ${confirmId === u.id ? "btn-danger" : "btn-ghost"}`} onClick={() => remove(u)}>
                  <Trash2 size={12} /> {confirmId === u.id ? "Confirm" : "Remove"}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="unit-add">
        <input className="input" placeholder={`New ${lower(TERMS.team)} name`} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-primary btn-sm" onClick={add}><Plus size={13} /> Add {lower(TERMS.team)}</button>
      </div>
    </div>
  );
}

/* =========================================================================
   TAB: EMPLOYEES
   ========================================================================= */

const ROLE_OPTIONS = ["field", "fixer", "supervisor", "management"];
const emptyEmployeeForm = () => ({ name: "", phone: "", email: "", password: "", pin: "", departmentId: "", supervisorId: "", roles: [] });

function EmployeesTab({ employees, setEmployees, departments, showToast }) {
  const [form, setForm] = useState(emptyEmployeeForm());
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const toggleRole = (role) => {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
    }));
  };

  const closeForm = () => { setEditingId(null); setForm(emptyEmployeeForm()); setFormOpen(false); };

  const handleSubmit = () => {
    if (!form.name.trim()) { showToast("Name is required."); return; }
    if (!form.pin.trim()) { showToast("PIN is required — every employee is tracked by a unique PIN."); return; }
    const pinTaken = employees.some((e) => e.pin === form.pin.trim() && e.id !== editingId);
    if (pinTaken) { showToast("That PIN is already used by another employee — PINs must be unique."); return; }

    // Only one person per department can be the fixer — making someone the
    // fixer here hands that role off from whoever held it before.
    const displacedFixer =
      form.roles.includes("fixer") && form.departmentId
        ? employees.find(
            (e) => e.id !== editingId && e.departmentId === form.departmentId && (e.roles || []).includes("fixer")
          )
        : null;
    const stripFixerRole = (e) =>
      displacedFixer && e.id === displacedFixer.id ? { ...e, roles: e.roles.filter((r) => r !== "fixer") } : e;

    if (editingId) {
      setEmployees((es) => es.map((e) => (e.id === editingId ? { ...e, ...form } : stripFixerRole(e))));
    } else {
      setEmployees((es) => [...es.map(stripFixerRole), { id: makeId("EMP"), createdAt: new Date().toISOString(), ...form }]);
    }
    showToast(
      displacedFixer
        ? `${form.name} is now the fixer for this ${lower(TERMS.unit)} (${displacedFixer.name} was removed from that role).`
        : `${form.name} ${editingId ? "updated" : "added"}.`
    );
    closeForm();
  };

  const startEdit = (e) => {
    setEditingId(e.id);
    setFormOpen(true);
    setForm({
      name: e.name || "", phone: e.phone || "", email: e.email || "", password: e.password || "",
      pin: e.pin || "", departmentId: e.departmentId || "", supervisorId: e.supervisorId || "", roles: e.roles || [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const supervisorOptions = employees.filter((e) => (e.roles || []).includes("supervisor"));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) =>
      (roleFilter === "all" || (e.roles || []).includes(roleFilter)) &&
      (!q || `${e.name} ${e.email} ${e.phone} ${e.pin}`.toLowerCase().includes(q))
    );
  }, [employees, query, roleFilter]);

  return (
    <div className="page">
      <PageHead eyebrow="Configuration" title="Employees" desc={`Add employees, assign them a ${lower(TERMS.unit)} and supervisor, and tag them with roles.`}>
        {!formOpen && <button className="btn btn-primary btn-sm" onClick={() => setFormOpen(true)}><Plus size={14} strokeWidth={2.6} /> Add employee</button>}
      </PageHead>

      {formOpen && (
        <div className="card card-pad page-enter" style={{ marginBottom: 24 }}>
          <p className="field-label">{editingId ? "Edit employee" : "Add employee"}</p>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">Number</label>
              <input className="input" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Email</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">PIN</label>
              <input className="input" inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Password (for Fixer/Admin login)</label>
              <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">{TERMS.unit}</label>
              <select className="select" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">—</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Supervisor</label>
              <select className="select" value={form.supervisorId} onChange={(e) => setForm({ ...form, supervisorId: e.target.value })}>
                <option value="">—</option>
                {supervisorOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Roles</label>
              <div className="checkbox-row">
                {ROLE_OPTIONS.map((r) => (
                  <label key={r}>
                    <input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggleRole(r)} /> {r}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 8 }}>
                Only one fixer per {lower(TERMS.unit)} — checking it here removes it from whoever had it.
                "management" adds the Network health dashboard to their staff app, on top of whatever else they can already do.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={handleSubmit}>{editingId ? "Save changes" : "Add employee"}</button>
            <button className="btn btn-ghost" onClick={closeForm}>Cancel</button>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input className="input" placeholder="Search name, email, PIN…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="filter-chips">
          {["all", ...ROLE_OPTIONS].map((r) => (
            <button key={r} className={`filter-chip ${roleFilter === r ? "active" : ""}`} onClick={() => setRoleFilter(r)} style={{ textTransform: "capitalize" }}>{r === "all" ? "Everyone" : r}</button>
          ))}
        </div>
      </div>

      <div className="ctable-wrap">
        <table className="ctable stack">
          <thead>
            <tr><th>Name</th><th>Roles</th><th>{TERMS.unit}</th><th>Supervisor</th><th>Email</th><th style={{ textAlign: "right" }}>Action</th></tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const dept = departments.find((d) => d.id === e.departmentId);
              const sup = employees.find((s) => s.id === e.supervisorId);
              return (
                <tr key={e.id}>
                  <td data-label="Name"><div className="cell-main">{e.name}</div>{e.phone && <div className="cell-sub">{e.phone}</div>}</td>
                  <td data-label="Roles"><div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "inherit" }}>{(e.roles || []).map((r) => <span key={r} className="role-badge">{r}</span>)}</div></td>
                  <td data-label={TERMS.unit}>{dept?.name || "—"}</td>
                  <td data-label="Supervisor">{sup?.name || "—"}</td>
                  <td data-label="Email" className="mono" style={{ fontSize: 12 }}>{e.email || "—"}</td>
                  <td data-label="" style={{ textAlign: "right" }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => startEdit(e)}><Edit3 size={12} /> Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">No employees match.</div>}
      </div>
    </div>
  );
}

/* =========================================================================
   TAB: SENT EMAILS LOG
   ========================================================================= */

function SentEmailsTab({ emailLog }) {
  const [openId, setOpenId] = useState(null);
  const [type, setType] = useState("all");
  const sorted = useMemo(
    () => [...emailLog].filter((m) => type === "all" || m.type === type).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt)),
    [emailLog, type]
  );

  return (
    <div className="page">
      <PageHead eyebrow="Audit trail" title="Sent emails"
        desc="Every email the system has generated — assignment, reminder, escalation, and extension notices. This prototype logs emails here instead of dispatching real ones; wire in an SMTP/API key to send them for real." />

      <div className="toolbar">
        <div className="filter-chips">
          {["all", "assignment", "reminder", "escalation", "extension"].map((t) => (
            <button key={t} className={`filter-chip ${type === t ? "active" : ""}`} onClick={() => setType(t)} style={{ textTransform: "capitalize" }}>{t === "all" ? "All types" : t}</button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="card empty-state">No emails generated yet.</div>
      ) : (
        <div className="ctable-wrap">
          <table className="ctable stack">
            <thead><tr><th>Sent</th><th>Type</th><th>To</th><th>Subject</th><th style={{ textAlign: "right" }}>Action</th></tr></thead>
            <tbody>
              {sorted.map((m) => (
                <React.Fragment key={m.id}>
                  <tr>
                    <td data-label="Sent" className="mono" style={{ fontSize: 12, color: "var(--ink-faint)" }}>{new Date(m.sentAt).toLocaleString()}</td>
                    <td data-label="Type"><span className={`type-badge type-${m.type}`}>{m.type}</span></td>
                    <td data-label="To">{m.toName} <span style={{ color: "var(--ink-faint)" }}>&lt;{m.to}&gt;</span></td>
                    <td data-label="Subject">{m.subject}</td>
                    <td data-label="" style={{ textAlign: "right" }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(openId === m.id ? null : m.id)}>
                        {openId === m.id ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                  {openId === m.id && (
                    <tr className="expand-row">
                      <td colSpan={5} data-label="">
                        <pre className="email-body">{m.body}</pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
