import React, { useState, useMemo } from "react";
import {
  MapPin, X, Check, AlertTriangle, Search, ArrowLeft, CheckCircle2,
  Users, TrendingUp, ShieldAlert, Building2, Mail, Lock, LogIn,
  AlertCircle, CheckSquare, Hourglass, UserCheck, Plus, Trash2, Edit3,
  Inbox, RefreshCw, LogOut
} from "lucide-react";
import { usePersistedCollection } from "../lib/usePersistedCollection";
import { makeId } from "../lib/ids";
import { useTheme } from "../lib/theme";
import ThemeToggle from "../lib/ThemeToggle";

/* =========================================================================
   DESIGN TOKENS & STYLES  (shared visual language with the staff app)
   ========================================================================= */

const STYLES = `
  :root{
    --magenta:#EC008C;
    --magenta-dark:#B8006E;
    --magenta-wash:#FDE9F4;
    --magenta-wash-2:#FBD3E8;
    --ink:#1D1E22;
    --ink-soft:#5B5D68;
    --ink-faint:#8B8D97;
    --line:#E7E7EC;
    --line-soft:#F0F0F4;
    --paper:#FAFAFB;
    --card:#FFFFFF;
    --success:#1C8A54;
    --success-wash:#E7F6EE;
    --warning:#B7791F;
    --warning-wash:#FBF1DF;
    --danger:#D6394C;
    --danger-wash:#FCE8EA;
    --info:#2F6FED;
    --info-wash:#EAF1FE;
    --radius-lg:14px;
    --radius-md:10px;
    --radius-sm:7px;
    --shadow-card: 0 1px 2px rgba(29,30,34,0.04), 0 4px 14px rgba(29,30,34,0.05);
    --shadow-pop: 0 12px 32px rgba(29,30,34,0.16);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  [data-theme="dark"]{
    --ink:#F2F2F5; --ink-soft:#B9BAC4; --ink-faint:#83848F;
    --line:#33343C; --line-soft:#2A2B32; --paper:#141419; --card:#1D1E24;
    --magenta-wash:#3A1530; --magenta-wash-2:#4A1B3D;
    --success-wash:#123423; --warning-wash:#3A2D0F; --danger-wash:#3A1418; --info-wash:#122A44;
    --shadow-card: 0 1px 2px rgba(0,0,0,0.35), 0 4px 14px rgba(0,0,0,0.4);
    --shadow-pop: 0 12px 32px rgba(0,0,0,0.6);
  }
  html, body{ margin:0; padding:0; background:var(--paper); }
  #root{ min-height:100vh; background:var(--paper); }
  .fvt{ background:var(--paper); color:var(--ink); min-height:100vh; font-family:'Inter',sans-serif; }
  .fvt *{ box-sizing:border-box; }
  .mono{ font-family:'IBM Plex Mono','SF Mono',monospace; letter-spacing:-0.01em; }

  .theme-toggle{ width:32px;height:32px;border-radius:999px;border:1px solid var(--line); background:var(--card);
                 color:var(--ink-soft); display:flex;align-items:center;justify-content:center; cursor:pointer; flex-shrink:0; }
  .theme-toggle:hover{ background:var(--line-soft); }

  /* ---------- Login ---------- */
  .login-screen{ min-height:100vh; display:flex; align-items:center; justify-content:center;
                 background:linear-gradient(160deg, var(--paper) 0%, var(--magenta-wash) 130%); padding:24px; }
  .login-card{ width:100%; max-width:380px; background:var(--card); border:1px solid var(--line);
               border-radius:var(--radius-lg); box-shadow:var(--shadow-pop); padding:36px 30px 28px; text-align:center; }
  .login-logo{ width:44px; height:44px; border-radius:12px; background:var(--magenta);
               display:flex; align-items:center; justify-content:center; margin:0 auto 16px; }
  .login-title{ font-size:19px; font-weight:750; margin:0; }
  .login-sub{ font-size:12px; color:var(--ink-faint); margin:4px 0 0; }
  .login-input-wrap{ position:relative; text-align:left; margin-top:16px; }
  .login-input-icon{ position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--ink-faint); pointer-events:none; }
  .login-input.input{ padding-left:36px; }
  .login-error{ background:var(--danger-wash); color:var(--danger); font-size:12px; font-weight:650; padding:9px 12px; border-radius:8px; margin-top:16px; text-align:left; }
  .login-footer{ font-size:11px; color:var(--ink-faint); margin:20px 0 0; }

  /* ---------- Nav ---------- */
  .nav{ position:sticky; top:0; z-index:40; background:var(--card); border-bottom:1px solid var(--line);
        display:flex; align-items:center; justify-content:space-between; padding:12px 20px; flex-wrap:wrap; gap:10px; }
  .nav-left{ display:flex; align-items:center; gap:10px; }
  .nav-logo{ width:34px; height:34px; border-radius:99px; background:var(--magenta);
             display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .nav-title{ font-weight:700; font-size:15px; letter-spacing:-0.01em; }
  .nav-sub{ font-size:11px; color:var(--ink-faint); margin-top:-1px; }
  .nav-tabs{ display:flex; align-items:center; gap:2px; flex-wrap:wrap; }
  .nav-tab{ display:flex; align-items:center; gap:6px; padding:7px 12px; border-radius:8px; font-size:12.5px;
            font-weight:650; color:var(--ink-soft); cursor:pointer; border:none; background:transparent; }
  .nav-tab.active{ background:var(--ink); color:var(--card); }
  .avatar{ width:30px; height:30px; border-radius:999px; background:var(--magenta-wash-2); color:var(--magenta-dark);
           display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; }

  .page{ max-width:1160px; margin:0 auto; padding:28px 20px 60px; }

  h1.h-title{ font-size:22px; font-weight:750; letter-spacing:-0.02em; margin:0; }
  .h-eyebrow{ font-size:11.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--magenta); margin:0 0 4px; }
  .h-desc{ color:var(--ink-soft); font-size:13.5px; margin:4px 0 0; }

  .btn{ display:inline-flex; align-items:center; justify-content:center; gap:7px; border:none; cursor:pointer;
        font-weight:650; font-size:13px; border-radius:99px; padding:8px 14px; transition:transform .06s ease; }
  .btn:active{ transform:scale(0.97); }
  .btn-primary{ background:var(--magenta); color:#fff; }
  .btn-primary:hover{ background:var(--magenta-dark); }
  .btn-secondary{ background:var(--card); color:var(--ink); border:1px solid var(--line); }
  .btn-secondary:hover{ background:var(--line-soft); }
  .btn-ghost{ background:transparent; color:var(--ink-soft); }
  .btn-danger{ background:var(--danger); color:#fff; }
  .btn-sm{ padding:6px 10px; font-size:12px; border-radius:8px; }
  .btn-block{ width:100%; }
  .btn:disabled{ opacity:0.4; cursor:not-allowed; }

  .card{ background:var(--card); border:1px solid var(--line); border-radius:var(--radius-lg); box-shadow:var(--shadow-card); }
  .card-pad{ padding:18px; }

  .stat-row{ display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:28px; }
  .stat-card{ background:var(--card); border:1px solid var(--line); border-radius:var(--radius-md); padding:14px 16px; }
  .stat-num{ font-size:22px; font-weight:750; letter-spacing:-0.02em; }
  .stat-label{ font-size:11.5px; color:var(--ink-faint); font-weight:600; margin-top:2px; }

  .admin-section{ margin-bottom:32px; }
  .section-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid var(--line); padding-bottom:8px; flex-wrap:wrap; gap:8px; }
  .section-title{ font-size:15px; font-weight:750; display:flex; align-items:center; gap:8px; }
  .badge-count{ font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; background:var(--line-soft); color:var(--ink); }

  table.ctable{ width:100%; border-collapse:collapse; }
  .ctable th{ text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-faint); font-weight:700; padding:0 12px 10px; }
  .ctable td{ padding:12px; font-size:13px; border-top:1px solid var(--line-soft); vertical-align:middle; }
  .ctable tbody tr:hover td{ background:var(--paper); }
  .ctable-wrap{ background:var(--card); border:1px solid var(--line); border-radius:var(--radius-lg); overflow:hidden; box-shadow:var(--shadow-card); padding-top:12px; overflow-x:auto; }

  .status-pill{ font-size:10.5px; font-weight:750; padding:4px 9px; border-radius:999px; white-space:nowrap; }
  .status-Open{ background:var(--danger-wash); color:var(--danger); }
  .status-InProgress{ background:var(--info-wash); color:var(--info); }
  .status-Resolved{ background:var(--success-wash); color:var(--success); }

  .urgency-badge{ font-size:10px; font-weight:750; padding:3px 8px; border-radius:6px; text-transform:uppercase; }
  .urgency-Low{ background:var(--success-wash); color:var(--success); }
  .urgency-Medium{ background:var(--warning-wash); color:var(--warning); }
  .urgency-High{ background:var(--danger-wash); color:var(--danger); }
  .source-badge{ font-size:10px; font-weight:750; padding:3px 8px; border-radius:6px; text-transform:uppercase; background:var(--line-soft); color:var(--ink-soft); }
  .role-badge{ font-size:10px; font-weight:700; padding:3px 8px; border-radius:6px; background:var(--magenta-wash); color:var(--magenta-dark); margin-right:4px; display:inline-block; }
  .type-badge{ font-size:10px; font-weight:750; padding:3px 8px; border-radius:6px; text-transform:uppercase; }
  .type-assignment{ background:var(--info-wash); color:var(--info); }
  .type-reminder{ background:var(--warning-wash); color:var(--warning); }
  .type-escalation{ background:var(--danger-wash); color:var(--danger); }
  .type-extension{ background:var(--magenta-wash); color:var(--magenta-dark); }

  .modal-veil{ position:fixed; inset:0; background:rgba(20,20,24,0.44); display:flex; align-items:flex-start; justify-content:center;
               padding:40px 16px; z-index:100; overflow-y:auto; }
  .modal-box{ background:var(--card); border-radius:16px; width:100%; max-width:620px; box-shadow:var(--shadow-pop); }
  .modal-head{ padding:20px 22px; border-bottom:1px solid var(--line-soft); display:flex; justify-content:space-between; align-items:flex-start; }
  .modal-body{ padding:22px; }
  .modal-close{ background:var(--line-soft); border:none; width:28px; height:28px; border-radius:999px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--ink-soft); flex-shrink:0; }

  .field-group{ margin-bottom:16px; }
  .field-label{ font-size:12.5px; font-weight:650; color:var(--ink); margin-bottom:6px; display:block; }
  .input, .select, .textarea{ width:100%; border:1px solid var(--line); border-radius:9px; padding:9px 12px; font-size:13px;
        font-family:inherit; background:var(--card); color:var(--ink); }
  .textarea{ resize:vertical; min-height:80px; }
  .field-row{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .checkbox-row{ display:flex; gap:16px; align-items:center; }
  .checkbox-row label{ display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600; cursor:pointer; }

  .auto-assign-box{ background:var(--magenta-wash); border:1px solid var(--magenta-wash-2); border-radius:9px; padding:10px 12px; font-size:12px; color:var(--magenta-dark); margin-top:6px; }

  .timeline{ margin-top:6px; }
  .tl-item{ display:flex; gap:12px; padding-bottom:14px; position:relative; }
  .tl-item:last-child{ padding-bottom:0; }
  .tl-dot-wrap{ display:flex; flex-direction:column; align-items:center; }
  .tl-dot{ width:9px; height:9px; border-radius:999px; background:var(--magenta); margin-top:4px; flex-shrink:0; }
  .tl-bar{ width:2px; flex:1; background:var(--line); margin-top:2px; }
  .tl-label{ font-size:12.5px; font-weight:700; }
  .tl-time{ font-size:11px; color:var(--ink-faint); }

  .toast{ position:fixed; bottom:26px; left:50%; transform:translateX(-50%); background:var(--ink); color:var(--card);
          padding:12px 20px; border-radius:10px; font-size:13px; font-weight:600; display:flex; align-items:center; gap:8px;
          box-shadow:var(--shadow-pop); z-index:200; max-width:90vw; }
  .empty-state{ padding:24px; text-align:center; color:var(--ink-faint); font-size:13px; }

  @media (max-width: 720px){
    .page{ padding:18px 12px 60px; }
    .nav{ padding:10px 12px; }
    .nav-sub{ display:none; }
    .nav-title{ font-size:14px; }
    .nav-tab{ padding:7px 9px; font-size:11.5px; }
    h1.h-title{ font-size:19px; }
    .stat-row{ grid-template-columns:repeat(2,1fr); gap:10px; }
    .field-row{ grid-template-columns:1fr; }
    .modal-veil{ padding:0; align-items:flex-end; }
    .modal-box{ max-width:100%; width:100%; border-radius:16px 16px 0 0; max-height:92vh; overflow-y:auto; }
    .ctable th, .ctable td{ padding:8px; font-size:12px; }
    .login-card{ padding:28px 20px 22px; max-width:100%; }
  }

  /* Elements with box-shadow, promoted to their own compositing layer — fixes
     the well-known iOS Safari bug where shadow+radius elements flicker
     (repaint) during scroll instead of staying put. */
  .card, .login-card, .ctable-wrap, .modal-box, .stat-card{
    -webkit-transform:translateZ(0); transform:translateZ(0);
    -webkit-backface-visibility:hidden; backface-visibility:hidden;
  }
`;

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

/* =========================================================================
   MAIN APP
   ========================================================================= */

const ADMIN_SESSION_KEY = "fvt-admin-session";

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [session, setSession] = useState(() => {
    try {
      const saved = sessionStorage.getItem(ADMIN_SESSION_KEY);
      return saved ? { email: saved } : null;
    } catch { return null; }
  });
  const [adminAuth] = usePersistedCollection("adminAuth", { email: "admin@brac.org", password: "admin123" });

  const handleLogin = (email) => {
    setSession({ email });
    try { sessionStorage.setItem(ADMIN_SESSION_KEY, email); } catch { /* ignore */ }
  };
  const handleLogout = () => {
    setSession(null);
    try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* ignore */ }
  };

  if (!session) {
    return (
      <div className="fvt">
        <style>{STYLES}</style>
        <AdminLogin adminAuth={adminAuth} onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="fvt">
      <style>{STYLES}</style>
      <AdminShell theme={theme} toggleTheme={toggleTheme} onLogout={handleLogout} session={session} />
    </div>
  );
}

function AdminLogin({ adminAuth, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    if (!email.trim() || !password.trim()) {
      setError("Enter the admin email and password.");
      return;
    }
    if (email.trim() !== adminAuth.email || password !== adminAuth.password) {
      setError("Incorrect admin email or password.");
      return;
    }
    onLogin(email.trim());
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo"><ShieldAlert size={20} color="#fff" /></div>
        <h1 className="login-title">Admin Console</h1>
        <p className="login-sub">Field Visit Tracker · BRAC Microfinance</p>

        <div className="login-input-wrap">
          <Mail size={15} className="login-input-icon" />
          <input className="input login-input" type="email" placeholder="admin@brac.org"
                 value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="login-input-wrap">
          <Lock size={15} className="login-input-icon" />
          <input className="input login-input" type="password" placeholder="Password"
                 value={password} onChange={(e) => setPassword(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleLogin}>
          <LogIn size={15} /> Sign in
        </button>
        <p className="login-footer">Default demo credentials: admin@brac.org / admin123</p>
      </div>
    </div>
  );
}

/* =========================================================================
   SHELL (tabs + top nav, shared across all admin pages)
   ========================================================================= */

function AdminShell({ theme, toggleTheme, onLogout, session }) {
  const [tab, setTab] = useState("queue");
  const [toast, setToast] = useState(null);
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const [visits, setVisits] = usePersistedCollection("visits", []);
  const [departments, setDepartments] = usePersistedCollection("departments", []);
  const [employees, setEmployees] = usePersistedCollection("employees", []);
  const [emailLog, setEmailLog] = usePersistedCollection("emailLog", []);

  const complaints = useMemo(
    () =>
      visits.flatMap((v) =>
        (v.complaints || []).map((c) => ({
          ...c,
          visitId: v.id,
          location: v.location,
          visitDate: v.date,
        }))
      ),
    [visits]
  );

  const refreshAfterAction = async () => {
    await Promise.all([refetch("visits", setVisits), refetch("emailLog", setEmailLog)]);
  };

  return (
    <>
      <div className="nav">
        <div className="nav-left">
          <div className="nav-logo"><MapPin size={18} color="#fff" /></div>
          <div>
            <div className="nav-title">Field Visit Tracker</div>
            <div className="nav-sub">BRAC Microfinance · Admin Console</div>
          </div>
        </div>
        <div className="nav-tabs">
          <button className={`nav-tab ${tab === "queue" ? "active" : ""}`} onClick={() => setTab("queue")}>
            <TrendingUp size={14} /> Complaints
          </button>
          <button className={`nav-tab ${tab === "departments" ? "active" : ""}`} onClick={() => setTab("departments")}>
            <Building2 size={14} /> Departments
          </button>
          <button className={`nav-tab ${tab === "employees" ? "active" : ""}`} onClick={() => setTab("employees")}>
            <Users size={14} /> Employees
          </button>
          <button className={`nav-tab ${tab === "emails" ? "active" : ""}`} onClick={() => setTab("emails")}>
            <Inbox size={14} /> Sent Emails
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <div className="avatar">AD</div>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}><LogOut size={14} /> Log out</button>
        </div>
      </div>

      <div className="page">
        {tab === "queue" && (
          <ComplaintsTab
            complaints={complaints}
            departments={departments}
            employees={employees}
            showToast={showToast}
            onRefresh={refreshAfterAction}
          />
        )}
        {tab === "departments" && (
          <DepartmentsTab departments={departments} setDepartments={setDepartments} showToast={showToast} />
        )}
        {tab === "employees" && (
          <EmployeesTab employees={employees} setEmployees={setEmployees} departments={departments} showToast={showToast} />
        )}
        {tab === "emails" && <SentEmailsTab emailLog={emailLog} />}
      </div>

      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </>
  );
}

/* =========================================================================
   TAB: COMPLAINTS QUEUE / ASSIGNMENT / ESCALATION
   ========================================================================= */

function ComplaintsTab({ complaints, departments, employees, showToast, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [running, setRunning] = useState(false);

  const stats = useMemo(() => {
    const unassigned = complaints.filter((c) => c.status === "Open").length;
    const escalated = complaints.filter((c) => c.escalated && c.status !== "Resolved").length;
    const overdueNotEscalated = complaints.filter((c) => isOverdue(c) && !c.escalated).length;
    const inProgress = complaints.filter((c) => c.status === "In Progress").length;
    const resolved = complaints.filter((c) => c.status === "Resolved").length;
    return { unassigned, escalated, overdueNotEscalated, inProgress, resolved };
  }, [complaints]);

  const unassignedList = complaints.filter((c) => c.status === "Open");
  const escalatedList = complaints.filter((c) => c.escalated && c.status !== "Resolved");
  const inProgressList = complaints.filter((c) => c.status === "In Progress" && !c.escalated);
  const resolvedList = complaints.filter((c) => c.status === "Resolved");

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
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
        <div>
          <p className="h-eyebrow">Administrative Overview</p>
          <h1 className="h-title">Complaints Management Center</h1>
          <p className="h-desc">Assign complaints to each department's fixer, set deadlines, and track escalations — all sourced live from the visits database.</p>
        </div>
        <button className="btn btn-secondary" onClick={handleRunCheck} disabled={running}>
          <RefreshCw size={14} /> {running ? "Checking…" : "Run deadline check now"}
        </button>
      </div>

      {complaints.length === 0 && (
        <div className="card empty-state" style={{ marginBottom: 28 }}>
          No complaints in the database yet. As field staff file complaints during their visits, they'll appear here automatically.
        </div>
      )}

      <div className="admin-section">
        <div className="section-header">
          <div className="section-title"><TrendingUp size={17} /> Dashboard Stats</div>
        </div>
        <div className="stat-row">
          <div className="stat-card"><div className="stat-num">{stats.unassigned}</div><div className="stat-label">To Be Assigned</div></div>
          <div className="stat-card"><div className="stat-num" style={{ color: "var(--danger)" }}>{stats.escalated}</div><div className="stat-label">Escalated</div></div>
          <div className="stat-card"><div className="stat-num" style={{ color: "var(--warning)" }}>{stats.overdueNotEscalated}</div><div className="stat-label">Overdue (pending escalation email)</div></div>
          <div className="stat-card"><div className="stat-num" style={{ color: "var(--info)" }}>{stats.inProgress}</div><div className="stat-label">In Progress</div></div>
          <div className="stat-card"><div className="stat-num" style={{ color: "var(--success)" }}>{stats.resolved}</div><div className="stat-label">Resolved</div></div>
        </div>
      </div>

      <Section title="To Be Assigned" icon={<AlertCircle size={17} />} color="var(--danger)" count={unassignedList.length}>
        <ComplaintTable items={unassignedList} onSelect={setSelected} emptyMsg="No unassigned complaints." actionLabel="Assign" />
      </Section>

      <Section title="Escalated — Awaiting Extension" icon={<ShieldAlert size={17} />} color="var(--danger)" count={escalatedList.length}>
        <ComplaintTable items={escalatedList} onSelect={setSelected} emptyMsg="Nothing currently escalated." actionLabel="Grant Extension" highlightDeadline />
      </Section>

      <Section title="In Progress" icon={<Hourglass size={17} />} count={inProgressList.length}>
        <ComplaintTable items={inProgressList} onSelect={setSelected} emptyMsg="Nothing in progress." actionLabel="View" />
      </Section>

      <Section title="Resolved" icon={<CheckSquare size={17} />} color="var(--success)" count={resolvedList.length}>
        <ComplaintTable items={resolvedList} onSelect={setSelected} emptyMsg="Nothing resolved yet." actionLabel="View" />
      </Section>

      {selected && (
        <ComplaintModal
          complaint={selected}
          departments={departments}
          employees={employees}
          onClose={() => setSelected(null)}
          showToast={showToast}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}

function Section({ title, icon, color, count, children }) {
  return (
    <div className="admin-section">
      <div className="section-header">
        <div className="section-title" style={color ? { color } : undefined}>{icon} {title}</div>
        <span className="badge-count" style={color ? { background: "transparent", color } : undefined}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function ComplaintTable({ items, onSelect, emptyMsg, actionLabel, highlightDeadline }) {
  if (items.length === 0) return <div className="card empty-state">{emptyMsg}</div>;

  return (
    <div className="ctable-wrap">
      <table className="ctable">
        <thead>
          <tr>
            <th>ID</th><th>Visit</th><th>Dept</th><th>Description</th><th>Urgency</th>
            <th>Deadline</th><th>Assigned To</th><th style={{ textAlign: "right" }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td className="mono" style={{ fontWeight: 700 }}>{c.id}</td>
              <td className="mono" style={{ color: "var(--ink-faint)" }}>{c.visitId}</td>
              <td>{c.department || "Unassigned"}{c.source && <span className="source-badge" style={{ marginLeft: 6 }}>{c.source}</span>}</td>
              <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.description}</td>
              <td><span className={`urgency-badge urgency-${c.urgency}`}>{c.urgency}</span></td>
              <td className="mono" style={{ color: highlightDeadline ? "var(--danger)" : "inherit", fontWeight: highlightDeadline ? 700 : 400 }}>
                {c.deadline ? new Date(c.deadline).toLocaleString() : "Not set"}
              </td>
              <td>{c.assignedTo || "Unassigned"}</td>
              <td style={{ textAlign: "right" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => onSelect(c)}>{actionLabel}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComplaintModal({ complaint: c, departments, employees, onClose, showToast, onRefresh }) {
  const [deptId, setDeptId] = useState(departments[0]?.id || "");
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

  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="mono" style={{ fontSize: 12, color: "var(--ink-faint)" }}>{c.id}</span>
            <h1 className="h-title" style={{ fontSize: 17, marginTop: 2 }}>Complaint</h1>
          </div>
          <button className="modal-close" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}>{c.description}</p>

          {c.photoUrl && (
            <img src={c.photoUrl} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 10, marginBottom: 16 }} />
          )}

          <div style={{ background: "var(--paper)", padding: 12, borderRadius: 8, marginBottom: 18, border: "1px solid var(--line)" }}>
            <div style={{ fontSize: 12, color: "var(--ink-soft)" }}><strong>Filed By:</strong> {c.filedBy} {c.source && <span className="source-badge" style={{ marginLeft: 6 }}>{c.source}</span>}</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}><strong>Visit:</strong> <span className="mono">{c.visitId}</span> — {c.location} · {c.visitDate}</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}><strong>Status:</strong> <StatusPill status={c.status} /> {c.escalated && <span className="type-badge type-escalation" style={{ marginLeft: 6 }}>Escalated</span>}</div>
            {c.assignedTo && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}><strong>Assigned To:</strong> {c.assignedTo} ({c.department}) · Supervisor: {c.supervisor || "—"}</div>}
            {c.deadline && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}><strong>Current Deadline:</strong> {new Date(c.deadline).toLocaleString()}</div>}
          </div>

          {c.status === "Open" && (
            <div className="card card-pad" style={{ background: "var(--paper)" }}>
              <p className="field-label">Assign &amp; Set Deadline</p>

              {isOther ? (
                <div className="field-group">
                  <label className="field-label">This complaint was filed as "Other" — choose the real department</label>
                  <select className="select" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              ) : (
                <div className="field-group">
                  <label className="field-label">Department (from complaint)</label>
                  <input className="input" value={c.department} disabled />
                </div>
              )}

              <div className="auto-assign-box">
                <UserCheck size={14} style={{ display: "inline", marginRight: 6 }} />
                {previewFixer
                  ? `Will assign to ${previewFixer.name} — the fixer for this department.`
                  : "No fixer is set up in this department yet — add one under Employees first."}
              </div>

              <div className="field-group" style={{ marginTop: 14 }}>
                <label className="field-label">Time given to fix (days)</label>
                <input type="number" min="1" max="60" className="input" value={days} onChange={(e) => setDays(e.target.value)} />
                <p style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 6 }}>
                  A reminder email goes out {Number(days) > 2 ? "48" : "24"} hours before this deadline; an escalation email goes to the supervisor automatically if it's missed.
                </p>
              </div>

              <button className="btn btn-primary btn-block" onClick={handleAssign} disabled={busy || !previewFixer}>
                Confirm Assignment &amp; Set Deadline
              </button>
            </div>
          )}

          {c.escalated && c.status !== "Resolved" && (
            <div className="card card-pad" style={{ background: "var(--danger-wash)", borderColor: "transparent" }}>
              <p className="field-label" style={{ color: "var(--danger)" }}>Deadline Missed — Escalated</p>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
                An automatic escalation email was already sent to <strong>{c.supervisor || "the supervisor"}</strong>. Once they tell you how much extra time to grant, enter it here — this restarts the reminder/escalation cycle against the new deadline.
              </p>
              <div className="field-group">
                <label className="field-label">Extension granted by supervisor (days)</label>
                <input type="number" min="1" max="60" className="input" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} />
              </div>
              <button className="btn btn-danger btn-block" onClick={handleExtend} disabled={busy}>
                Grant Extension &amp; Notify Employee
              </button>
            </div>
          )}

          {c.status === "In Progress" && !c.escalated && (
            <div className="card card-pad" style={{ background: "var(--paper)" }}>
              <p className="field-label">Activity</p>
              <Timeline log={c.log} />
            </div>
          )}

          {c.status === "Resolved" && (
            <div className="card card-pad" style={{ background: "var(--success-wash)", borderColor: "transparent" }}>
              <p className="field-label" style={{ color: "var(--success)" }}>Resolved</p>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>
                Resolved by <strong>{c.resolvedBy}</strong> on {c.resolvedAt ? new Date(c.resolvedAt).toLocaleString() : "—"}.
              </p>
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

function DepartmentsTab({ departments, setDepartments, showToast }) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const handleAdd = () => {
    if (!name.trim()) return;
    setDepartments((ds) => [...ds, { id: makeId("DEPT"), name: name.trim() }]);
    showToast(`Department "${name.trim()}" added.`);
    setName("");
  };

  const startEdit = (d) => { setEditingId(d.id); setEditingName(d.name); };
  const saveEdit = () => {
    setDepartments((ds) => ds.map((d) => (d.id === editingId ? { ...d, name: editingName.trim() } : d)));
    setEditingId(null);
  };

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <p className="h-eyebrow">Configuration</p>
        <h1 className="h-title">Departments</h1>
        <p className="h-desc">Complaints get routed to whichever department they name — or, for "Other," whichever one you pick.</p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 20, maxWidth: 420 }}>
        <label className="field-label">Add a department</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="e.g. Legal" value={name} onChange={(e) => setName(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          <button className="btn btn-primary" onClick={handleAdd}><Plus size={14} /> Add</button>
        </div>
      </div>

      <div className="ctable-wrap">
        <table className="ctable">
          <thead><tr><th>Name</th><th style={{ textAlign: "right" }}>Action</th></tr></thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id}>
                <td>
                  {editingId === d.id
                    ? <input className="input" value={editingName} onChange={(e) => setEditingName(e.target.value)} style={{ maxWidth: 260 }} />
                    : <strong>{d.name}</strong>}
                </td>
                <td style={{ textAlign: "right" }}>
                  {editingId === d.id ? (
                    <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                  ) : (
                    <button className="btn btn-secondary btn-sm" onClick={() => startEdit(d)}><Edit3 size={12} /> Rename</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* =========================================================================
   TAB: EMPLOYEES
   ========================================================================= */

const ROLE_OPTIONS = ["field", "fixer", "supervisor"];

function EmployeesTab({ employees, setEmployees, departments, showToast }) {
  const [form, setForm] = useState(emptyEmployeeForm());
  const [editingId, setEditingId] = useState(null);

  function emptyEmployeeForm() {
    return { name: "", phone: "", email: "", password: "", pin: "", departmentId: "", supervisorId: "", roles: [] };
  }

  const toggleRole = (role) => {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
    }));
  };

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
        ? `${form.name} is now the fixer for this department (${displacedFixer.name} was removed from that role).`
        : `${form.name} ${editingId ? "updated" : "added"}.`
    );
    setForm(emptyEmployeeForm());
    setEditingId(null);
  };

  const startEdit = (e) => {
    setEditingId(e.id);
    setForm({
      name: e.name || "", phone: e.phone || "", email: e.email || "", password: e.password || "",
      pin: e.pin || "", departmentId: e.departmentId || "", supervisorId: e.supervisorId || "", roles: e.roles || [],
    });
  };

  const supervisorOptions = employees.filter((e) => (e.roles || []).includes("supervisor"));

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <p className="h-eyebrow">Configuration</p>
        <h1 className="h-title">Employees</h1>
        <p className="h-desc">Add employees, assign them a department and supervisor, and tag them with roles.</p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <p className="field-label">{editingId ? "Edit employee" : "Add employee"}</p>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label">Number</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label">PIN</label>
            <input className="input" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Password (for Fixer/Admin login)</label>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label">Department</label>
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
            <div className="checkbox-row" style={{ height: 36 }}>
              {ROLE_OPTIONS.map((r) => (
                <label key={r}>
                  <input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggleRole(r)} /> {r}
                </label>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 6 }}>
              Only one fixer per department — checking it here removes it from whoever had it.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary" onClick={handleSubmit}>{editingId ? "Save changes" : "Add employee"}</button>
          {editingId && <button className="btn btn-ghost" onClick={() => { setEditingId(null); setForm(emptyEmployeeForm()); }}>Cancel</button>}
        </div>
      </div>

      <div className="ctable-wrap">
        <table className="ctable">
          <thead>
            <tr><th>Name</th><th>Roles</th><th>Department</th><th>Supervisor</th><th>Email</th><th style={{ textAlign: "right" }}>Action</th></tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const dept = departments.find((d) => d.id === e.departmentId);
              const sup = employees.find((s) => s.id === e.supervisorId);
              return (
                <tr key={e.id}>
                  <td><strong>{e.name}</strong></td>
                  <td>{(e.roles || []).map((r) => <span key={r} className="role-badge">{r}</span>)}</td>
                  <td>{dept?.name || "—"}</td>
                  <td>{sup?.name || "—"}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{e.email || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => startEdit(e)}><Edit3 size={12} /> Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* =========================================================================
   TAB: SENT EMAILS LOG
   ========================================================================= */

function SentEmailsTab({ emailLog }) {
  const [openId, setOpenId] = useState(null);
  const sorted = [...emailLog].sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <p className="h-eyebrow">Audit Trail</p>
        <h1 className="h-title">Sent Emails</h1>
        <p className="h-desc">Every email the system has generated — assignment, reminder, escalation, and extension notices. This prototype logs emails here instead of dispatching real ones; wire in an SMTP/API key to send them for real.</p>
      </div>

      {sorted.length === 0 ? (
        <div className="card empty-state">No emails generated yet.</div>
      ) : (
        <div className="ctable-wrap">
          <table className="ctable">
            <thead><tr><th>Sent</th><th>Type</th><th>To</th><th>Subject</th><th style={{ textAlign: "right" }}>Action</th></tr></thead>
            <tbody>
              {sorted.map((m) => (
                <React.Fragment key={m.id}>
                  <tr>
                    <td className="mono" style={{ fontSize: 12, color: "var(--ink-faint)" }}>{new Date(m.sentAt).toLocaleString()}</td>
                    <td><span className={`type-badge type-${m.type}`}>{m.type}</span></td>
                    <td>{m.toName} <span style={{ color: "var(--ink-faint)" }}>&lt;{m.to}&gt;</span></td>
                    <td>{m.subject}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(openId === m.id ? null : m.id)}>
                        {openId === m.id ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                  {openId === m.id && (
                    <tr>
                      <td colSpan={5}>
                        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5, background: "var(--paper)", padding: 12, borderRadius: 8, border: "1px solid var(--line)" }}>
                          {m.body}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
