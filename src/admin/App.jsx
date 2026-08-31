import React, { useState, useMemo } from "react";
import {
  MapPin, Calendar, Clock, ChevronRight, ChevronLeft, Plus, X, Check,
  MessageSquare, AlertTriangle, Camera, Star, Heart, MessageCircle,
  Share2, Search, Filter, ArrowLeft, CheckCircle2, Circle,
  Send, Users, TrendingUp, Timer, ShieldAlert, Building2, Home,
  UserCircle2, ChevronDown, Mail, Lock, LogIn, ShieldCheck,
  AlertCircle, CheckSquare, Hourglass, UserCheck
} from "lucide-react";
import { usePersistedCollection } from "../lib/usePersistedCollection";
import { todayStr } from "../lib/ids";

/* =========================================================================
   DESIGN TOKENS & STYLES
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
  .fvt{ background:var(--paper); color:var(--ink); min-height:100vh; font-family:'Inter',sans-serif; }
  .fvt *{ box-sizing:border-box; }
  .mono{ font-family:'IBM Plex Mono','SF Mono',monospace; letter-spacing:-0.01em; }

  /* ---------- Nav ---------- */
  .nav{ position:sticky; top:0; z-index:40; background:var(--card); border-bottom:1px solid var(--line);
        display:flex; align-items:center; justify-content:space-between; padding:12px 20px; }
  .nav-left{ display:flex; align-items:center; gap:10px; }
  .nav-logo{ width:34px; height:34px; border-radius:99px; background:var(--magenta);
             display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .nav-title{ font-weight:700; font-size:15px; letter-spacing:-0.01em; }
  .nav-sub{ font-size:11px; color:var(--ink-faint); margin-top:-1px; }
  .role-switch{ display:flex; align-items:center; background:var(--line-soft); border-radius:999px; padding:3px; gap:2px; }
  .role-btn{ border:none; background:transparent; padding:6px 14px; border-radius:999px; font-size:12.5px; font-weight:600;
             color:var(--ink-soft); cursor:pointer; display:flex; align-items:center; gap:6px; }
  .role-btn.active{ background:var(--ink); color:#fff; }
  .avatar{ width:30px; height:30px; border-radius:999px; background:var(--magenta-wash-2); color:var(--magenta-dark);
           display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; }

  .page{ max-width:1120px; margin:0 auto; padding:28px 20px 60px; }

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

  /* ---------- Admin Dash Sections ---------- */
  .stat-row{ display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:28px; }
  .stat-card{ background:var(--card); border:1px solid var(--line); border-radius:var(--radius-md); padding:14px 16px; }
  .stat-num{ font-size:22px; font-weight:750; letter-spacing:-0.02em; }
  .stat-label{ font-size:11.5px; color:var(--ink-faint); font-weight:600; margin-top:2px; }

  .admin-section{ margin-bottom:32px; }
  .section-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid var(--line); padding-bottom:8px; }
  .section-title{ font-size:15px; font-weight:750; display:flex; align-items:center; gap:8px; }
  .badge-count{ font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; background:var(--line-soft); color:var(--ink); }

  table.ctable{ width:100%; border-collapse:collapse; }
  .ctable th{ text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-faint); font-weight:700; padding:0 12px 10px; }
  .ctable td{ padding:12px; font-size:13px; border-top:1px solid var(--line-soft); vertical-align:middle; }
  .ctable tbody tr:hover td{ background:var(--paper); }
  .ctable-wrap{ background:var(--card); border:1px solid var(--line); border-radius:var(--radius-lg); overflow:hidden; box-shadow:var(--shadow-card); padding-top:12px; }

  .status-pill{ font-size:10.5px; font-weight:750; padding:4px 9px; border-radius:999px; white-space:nowrap; }
  .status-Open{ background:var(--danger-wash); color:var(--danger); }
  .status-Assigned{ background:var(--info-wash); color:var(--info); }
  .status-InProgress{ background:var(--warning-wash); color:var(--warning); }
  .status-PendingReview{ background:var(--magenta-wash); color:var(--magenta-dark); }
  .status-Resolved{ background:var(--success-wash); color:var(--success); }

  .urgency-badge{ font-size:10px; font-weight:750; padding:3px 8px; border-radius:6px; text-transform:uppercase; }
  .urgency-Low{ background:var(--success-wash); color:var(--success); }
  .urgency-Medium{ background:var(--warning-wash); color:var(--warning); }
  .urgency-High{ background:var(--danger-wash); color:var(--danger); }
  .source-badge{ font-size:10px; font-weight:750; padding:3px 8px; border-radius:6px; text-transform:uppercase; background:var(--line-soft); color:var(--ink-soft); }

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

  .auto-assign-box{ background:var(--magenta-wash); border:1px solid var(--magenta-wash-2); border-radius:9px; padding:10px 12px; font-size:12px; color:var(--magenta-dark); margin-top:6px; }

  .timeline{ margin-top:6px; }
  .tl-item{ display:flex; gap:12px; padding-bottom:14px; position:relative; }
  .tl-item:last-child{ padding-bottom:0; }
  .tl-dot-wrap{ display:flex; flex-direction:column; align-items:center; }
  .tl-dot{ width:9px; height:9px; border-radius:999px; background:var(--magenta); margin-top:4px; flex-shrink:0; }
  .tl-bar{ width:2px; flex:1; background:var(--line); margin-top:2px; }
  .tl-label{ font-size:12.5px; font-weight:700; }
  .tl-time{ font-size:11px; color:var(--ink-faint); }

  .toast{ position:fixed; bottom:26px; left:50%; transform:translateX(-50%); background:var(--ink); color:#fff;
          padding:12px 20px; border-radius:10px; font-size:13px; font-weight:600; display:flex; align-items:center; gap:8px;
          box-shadow:var(--shadow-pop); z-index:200; }
  .empty-state{ padding:24px; text-align:center; color:var(--ink-faint); font-size:13px; }
`;

/* =========================================================================
   DEPARTMENT DIRECTORY
   Fixed organisational reference data (who's in which department, for
   auto-assignment / least-workload routing) — not something staff enter, so
   it stays as a constant rather than living in the JSON database.
   ========================================================================= */

const DEPARTMENT_MEMBERS = {
  Software: [
    { name: "Tariqul Islam", supervisor: "Chief Technology Officer" },
    { name: "Farhana Zaman", supervisor: "Lead Software Architect" },
    { name: "Kazi Nabil", supervisor: "Lead Software Architect" }
  ],
  Construction: [
    { name: "Rafiqul Hasan", supervisor: "Head of Infrastructure" },
    { name: "Sultana Razia", supervisor: "Head of Infrastructure" }
  ],
  HR: [
    { name: "Nasrin Sultana", supervisor: "HR Director" },
    { name: "Tanvir Ahmed", supervisor: "HR Director" }
  ],
  Finance: [
    { name: "Zahid Rahman", supervisor: "Chief Financial Officer" },
    { name: "Marium Begum", supervisor: "Finance Controller" }
  ],
  Operations: [
    { name: "Imran Hossain", supervisor: "VP Field Operations" },
    { name: "Shahana Parveen", supervisor: "VP Field Operations" }
  ],
  Undefined: [
    { name: "Admin Desk Team", supervisor: "General Operations Manager" }
  ]
};

/* =========================================================================
   HELPERS
   ========================================================================= */

const daysUntil = (deadline) => (new Date(deadline) - new Date(todayStr())) / (1000 * 3600 * 24);
const isExceeded = (c) => c.status === "In Progress" && c.deadline && c.deadline < todayStr();
const isApproaching = (c) => {
  if (c.status !== "In Progress" || !c.deadline) return false;
  const diff = daysUntil(c.deadline);
  return diff >= 0 && diff <= 2;
};

/* =========================================================================
   MAIN APP
   ========================================================================= */

export default function App() {
  // The admin console has no separate data of its own — it reads the exact
  // same "visits" collection the staff app writes to (server/db.json), and
  // derives everything it shows (including the flat complaints list below)
  // from what's actually nested inside those visit records.
  const [visits, setVisits] = usePersistedCollection("visits", []);
  const [selectedComplaintId, setSelectedComplaintId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Flatten every complaint out of every visit into one list for the admin
  // views, tagging each with where it came from.
  const complaints = useMemo(() => visits.flatMap(v =>
    (v.complaints || []).map(c => ({
      ...c,
      visitId: v.id,
      location: v.location,
      visitDate: v.date,
    }))
  ), [visits]);

  // A complaint lives inside its parent visit's `complaints` array — to
  // change one, find the visit that holds it and update that one entry,
  // then persist the whole (still-shared) "visits" collection.
  const updateComplaint = (complaintId, patch) => {
    setVisits(vs => vs.map(v => {
      if (!v.complaints?.some(c => c.id === complaintId)) return v;
      return {
        ...v,
        complaints: v.complaints.map(c => c.id === complaintId ? { ...c, ...patch } : c),
      };
    }));
  };

  const selectedComplaint = selectedComplaintId ? complaints.find(c => c.id === selectedComplaintId) : null;

  return (
    <div className="fvt">
      <style>{STYLES}</style>

      {/* Top Bar */}
      <div className="nav">
        <div className="nav-left">
          <div className="nav-logo"><MapPin size={18} color="#fff" /></div>
          <div>
            <div className="nav-title">Field Visit Tracker</div>
            <div className="nav-sub">BRAC Microfinance · Admin Console</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div className="role-switch">
            <button className="role-btn active"><ShieldAlert size={14} /> Admin Portal</button>
          </div>
          <div className="avatar">AD</div>
        </div>
      </div>

      <div className="page">
        <div style={{ marginBottom:22 }}>
          <p className="h-eyebrow">Administrative Overview</p>
          <h1 className="h-title">Complaints Management Center</h1>
          <p className="h-desc">Monitor SLA timelines, assign complaints automatically via least-workload distribution, and review resolutions — all sourced live from the visits database.</p>
        </div>

        <AdminDashboard
          complaints={complaints}
          onSelect={(c) => setSelectedComplaintId(c.id)}
        />
      </div>

      {selectedComplaint && (
        <ComplaintActionModal
          complaint={selectedComplaint}
          allComplaints={complaints}
          onClose={() => setSelectedComplaintId(null)}
          onUpdate={(patch) => updateComplaint(selectedComplaint.id, patch)}
          showToast={showToast}
        />
      )}

      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </div>
  );
}

/* =========================================================================
   ADMIN DASHBOARD WITH THE 6 REQUIRED SECTIONS
   ========================================================================= */

function AdminDashboard({ complaints, onSelect }) {
  const stats = useMemo(() => {
    const unassigned = complaints.filter(c => c.status === "Open").length;
    const exceeded = complaints.filter(isExceeded).length;
    const approaching = complaints.filter(isApproaching).length;
    const pendingReview = complaints.filter(c => c.status === "Pending Review").length;
    const inProgress = complaints.filter(c => c.status === "In Progress").length;

    return { unassigned, exceeded, approaching, pendingReview, inProgress };
  }, [complaints]);

  const unassignedList = complaints.filter(c => c.status === "Open");
  const exceededDeadlineList = complaints.filter(isExceeded);
  const approachingDeadlineList = complaints.filter(isApproaching);
  const completionApprovalList = complaints.filter(c => c.status === "Pending Review");

  // "In Progress" excludes anything already surfaced above (exceeded / approaching)
  // so a complaint never appears in two sections at once.
  const inProgressList = complaints.filter(c =>
    c.status === "In Progress" && c.deadline && !isExceeded(c) && !isApproaching(c)
  );

  return (
    <>
      {complaints.length === 0 && (
        <div className="card empty-state" style={{ marginBottom: 28 }}>
          No complaints in the database yet. As field staff file complaints during their visits, they'll appear here automatically.
        </div>
      )}

      {/* SECTION 1: DASHBOARD STATS */}
      <div className="admin-section">
        <div className="section-header">
          <div className="section-title">
            <TrendingUp size={17} /> 1. Dashboard Stats
          </div>
        </div>
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-num">{stats.unassigned}</div>
            <div className="stat-label">To Be Assigned</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--danger)" }}>{stats.exceeded}</div>
            <div className="stat-label">Exceeded Deadline</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--warning)" }}>{stats.approaching}</div>
            <div className="stat-label">Approaching Deadline</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--magenta)" }}>{stats.pendingReview}</div>
            <div className="stat-label">Pending Approval</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--info)" }}>{stats.inProgress}</div>
            <div className="stat-label">Total In Progress</div>
          </div>
        </div>
      </div>

      {/* SECTION 2: TO BE ASSIGNED (Top Priority) */}
      <div className="admin-section">
        <div className="section-header">
          <div className="section-title" style={{ color:"var(--danger)" }}>
            <AlertCircle size={17} /> 2. To Be Assigned
          </div>
          <span className="badge-count">{unassignedList.length}</span>
        </div>
        <ComplaintTable
          items={unassignedList}
          onSelect={onSelect}
          emptyMsg="No unassigned complaints available."
          actionLabel="Assign Department"
        />
      </div>

      {/* SECTION 3: EXCEEDED DEADLINE */}
      <div className="admin-section">
        <div className="section-header">
          <div className="section-title" style={{ color:"var(--danger)" }}>
            <ShieldAlert size={17} /> 3. Exceeded Deadline (Escalation Required)
          </div>
          <span className="badge-count" style={{ background:"var(--danger-wash)", color:"var(--danger)" }}>
            {exceededDeadlineList.length}
          </span>
        </div>
        <ComplaintTable
          items={exceededDeadlineList}
          onSelect={onSelect}
          emptyMsg="No complaints currently breaching deadline."
          actionLabel="Manage Escalation"
          highlightDeadline
        />
      </div>

      {/* SECTION 4: APPROACHING DEADLINE */}
      <div className="admin-section">
        <div className="section-header">
          <div className="section-title" style={{ color:"var(--warning)" }}>
            <Hourglass size={17} /> 4. Approaching Deadline (&lt; 48 hours remaining)
          </div>
          <span className="badge-count">{approachingDeadlineList.length}</span>
        </div>
        <ComplaintTable
          items={approachingDeadlineList}
          onSelect={onSelect}
          emptyMsg="No complaints approaching deadline."
          actionLabel="View Details"
        />
      </div>

      {/* SECTION 5: COMPLETION APPROVAL */}
      <div className="admin-section">
        <div className="section-header">
          <div className="section-title" style={{ color:"var(--magenta)" }}>
            <CheckSquare size={17} /> 5. Completion Approval
          </div>
          <span className="badge-count">{completionApprovalList.length}</span>
        </div>
        <ComplaintTable
          items={completionApprovalList}
          onSelect={onSelect}
          emptyMsg="No complaints waiting for approval."
          actionLabel="Review Resolution"
        />
      </div>

      {/* SECTION 6: IN PROGRESS */}
      <div className="admin-section">
        <div className="section-header">
          <div className="section-title">
            <Timer size={17} /> 6. In Progress
          </div>
          <span className="badge-count">{inProgressList.length}</span>
        </div>
        <ComplaintTable
          items={inProgressList}
          onSelect={onSelect}
          emptyMsg="No complaints currently in progress."
          actionLabel="View / Edit"
        />
      </div>
    </>
  );
}

/* =========================================================================
   TABLE COMPONENT
   ========================================================================= */

function ComplaintTable({ items, onSelect, emptyMsg, actionLabel, highlightDeadline }) {
  if (items.length === 0) {
    return <div className="card empty-state">{emptyMsg}</div>;
  }

  return (
    <div className="ctable-wrap">
      <table className="ctable">
        <thead>
          <tr>
            <th>ID</th>
            <th>Visit</th>
            <th>Dept</th>
            <th>Description</th>
            <th>Urgency</th>
            <th>Deadline</th>
            <th>Assigned To</th>
            <th style={{ textAlign:"right" }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map(c => (
            <tr key={c.id}>
              <td className="mono" style={{ fontWeight:700 }}>{c.id}</td>
              <td className="mono" style={{ color:"var(--ink-faint)" }}>{c.visitId}</td>
              <td>
                {c.department || "Unassigned"}
                {c.source && <span className="source-badge" style={{ marginLeft:6 }}>{c.source}</span>}
              </td>
              <td style={{ maxWidth:240, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {c.description}
              </td>
              <td><span className={`urgency-badge urgency-${c.urgency}`}>{c.urgency}</span></td>
              <td className="mono" style={{ color: highlightDeadline ? "var(--danger)" : "inherit", fontWeight: highlightDeadline ? 700 : 400 }}>
                {c.deadline || "Not Set"}
              </td>
              <td>{c.assignedTo ? `${c.assignedTo}` : "Unassigned"}</td>
              <td style={{ textAlign:"right" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => onSelect(c)}>
                  {actionLabel}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================================
   ACTION MODAL FOR ASSIGNMENT, ESCALATION APPROVAL & REVIEW
   ========================================================================= */

function ComplaintActionModal({ complaint: c, allComplaints, onClose, onUpdate, showToast }) {
  const [selectedDept, setSelectedDept] = useState(c.department || "Software");
  const [timeframeDays, setTimeframeDays] = useState(5);
  const [showSendBack, setShowSendBack] = useState(false);
  const [sendBackReason, setSendBackReason] = useState("");

  const exceeded = isExceeded(c);

  const autoAssignedMember = useMemo(() => {
    const deptMembers = DEPARTMENT_MEMBERS[selectedDept] || [];
    if (!deptMembers.length) return null;

    let leastMember = deptMembers[0];
    let minCount = Infinity;

    deptMembers.forEach(mem => {
      const activeCount = allComplaints.filter(item =>
        item.assignedTo === mem.name && item.status !== "Resolved"
      ).length;

      if (activeCount < minCount) {
        minCount = activeCount;
        leastMember = mem;
      }
    });

    return { ...leastMember, currentWorkload: minCount };
  }, [selectedDept, allComplaints]);

  const handleAssignSubmit = () => {
    if (!autoAssignedMember) return;

    const deadlineDate = new Date(todayStr());
    deadlineDate.setDate(deadlineDate.getDate() + Number(timeframeDays));
    const deadlineStr = deadlineDate.toISOString().split("T")[0];

    onUpdate({
      department: selectedDept,
      assignedTo: autoAssignedMember.name,
      supervisor: autoAssignedMember.supervisor,
      deadline: deadlineStr,
      status: "In Progress",
      log: [
        ...(c.log || []),
        { label: `Assigned to ${selectedDept} department (${autoAssignedMember.name} - least workload: ${autoAssignedMember.currentWorkload} active items)`, time: "Just now" },
        { label: `Timeframe set: ${timeframeDays} days (Deadline: ${deadlineStr})`, time: "Just now" }
      ]
    });

    showToast(`Complaint assigned to ${autoAssignedMember.name} (${selectedDept})`);
    onClose();
  };

  const handleApproveEscalation = () => {
    onUpdate({
      escalationApproved: true,
      log: [
        ...(c.log || []),
        { label: `Admin approved deadline breach escalation. Automated email dispatched to supervisor: ${c.supervisor}`, time: "Just now" }
      ]
    });
    showToast(`Escalation email approved & sent to supervisor (${c.supervisor})`);
  };

  const handleApproveCompletion = () => {
    onUpdate({
      status: "Resolved",
      log: [...(c.log || []), { label: "Resolution approved by Admin — complaint closed", time: "Just now" }]
    });
    showToast("Complaint officially closed & resolved!");
    onClose();
  };

  const handleSendBack = () => {
    onUpdate({
      status: "In Progress",
      log: [
        ...(c.log || []),
        { label: `Resolution sent back to ${c.assignedTo}: ${sendBackReason || "needs more work"}`, time: "Just now" }
      ]
    });
    showToast(`Sent back to ${c.assignedTo} for revision`);
    setShowSendBack(false);
    onClose();
  };

  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="mono" style={{ fontSize:12, color:"var(--ink-faint)" }}>{c.id}</span>
            <h1 className="h-title" style={{ fontSize:17, marginTop:2 }}>Complaint Action</h1>
          </div>
          <button className="modal-close" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize:13.5, lineHeight:1.5, marginBottom:16 }}>{c.description}</p>

          <div style={{ background:"var(--paper)", padding:12, borderRadius:8, marginBottom:18, border:"1px solid var(--line)" }}>
            <div style={{ fontSize:12, color:"var(--ink-soft)" }}><strong>Filed By:</strong> {c.filedBy} {c.source && <span className="source-badge" style={{ marginLeft:6 }}>{c.source}</span>}</div>
            <div style={{ fontSize:12, color:"var(--ink-soft)", marginTop:4 }}><strong>Visit:</strong> <span className="mono">{c.visitId}</span> — {c.location} · {c.visitDate}</div>
            <div style={{ fontSize:12, color:"var(--ink-soft)", marginTop:4 }}><strong>Current Status:</strong> <StatusPill status={c.status} /></div>
            {c.assignedTo && (
              <div style={{ fontSize:12, color:"var(--ink-soft)", marginTop:4 }}><strong>Assigned To:</strong> {c.assignedTo} ({c.department})</div>
            )}
            {c.deadline && (
              <div style={{ fontSize:12, color:"var(--ink-soft)", marginTop:4 }}><strong>Deadline:</strong> {c.deadline}</div>
            )}
          </div>

          {/* ACTION TYPE 1: UNASSIGNED -> REGISTER DEPT & TIMEFRAME */}
          {c.status === "Open" && (
            <div className="card card-pad" style={{ background:"var(--paper)" }}>
              <p className="field-label">Register Department &amp; Timeframe</p>

              <div className="field-group">
                <label className="field-label">Assign Department</label>
                <select className="select" value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
                  {Object.keys(DEPARTMENT_MEMBERS).map(d => <option key={d}>{d}</option>)}
                </select>
              </div>

              {autoAssignedMember && (
                <div className="auto-assign-box">
                  <UserCheck size={14} style={{ display:"inline", marginRight:6 }} />
                  Automatically selected <strong>{autoAssignedMember.name}</strong> (lowest active workload: {autoAssignedMember.currentWorkload} tasks).
                </div>
              )}

              <div className="field-group" style={{ marginTop:14 }}>
                <label className="field-label">Allowed Timeframe (Days)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  className="input"
                  value={timeframeDays}
                  onChange={e => setTimeframeDays(e.target.value)}
                />
              </div>

              <button className="btn btn-primary btn-block" onClick={handleAssignSubmit}>
                Confirm Assignment &amp; Set Deadline
              </button>
            </div>
          )}

          {/* ACTION TYPE 2: EXCEEDED DEADLINE -> APPROVE ESCALATION */}
          {exceeded && (
            <div className="card card-pad" style={{ background:"var(--danger-wash)", borderColor:"transparent" }}>
              <p className="field-label" style={{ color:"var(--danger)" }}>Deadline Exceeded Action</p>
              <p style={{ fontSize:12.5, color:"var(--ink-soft)", marginBottom:14 }}>
                Assigned to: <strong>{c.assignedTo}</strong><br />
                Supervisor: <strong>{c.supervisor || "Department Head"}</strong>
              </p>

              {c.escalationApproved ? (
                <div style={{ fontSize:12, color:"var(--danger)", fontWeight:700 }}>
                  ✓ Escalation email approved and sent to supervisor.
                </div>
              ) : (
                <button className="btn btn-danger btn-block" onClick={handleApproveEscalation}>
                  Approve &amp; Send Escalation Email to Supervisor
                </button>
              )}
            </div>
          )}

          {/* ACTION TYPE 3: COMPLETION APPROVAL */}
          {c.status === "Pending Review" && (
            <div className="card card-pad" style={{ background:"var(--magenta-wash)", borderColor:"transparent" }}>
              <p className="field-label" style={{ color:"var(--magenta-dark)" }}>Completion Approval</p>
              <p style={{ fontSize:12.5, color:"var(--ink)", marginBottom:12 }}>
                <strong>Resolution Notes Submitted by {c.assignedTo}:</strong><br />
                "{c.resolutionNotes}"
              </p>

              {!showSendBack ? (
                <div style={{ display:"flex", gap:10 }}>
                  <button className="btn btn-primary" style={{ flex:1 }} onClick={handleApproveCompletion}>
                    Approve &amp; Mark Resolved
                  </button>
                  <button className="btn btn-secondary" style={{ flex:1 }} onClick={() => setShowSendBack(true)}>
                    Send Back
                  </button>
                </div>
              ) : (
                <>
                  <div className="field-group">
                    <label className="field-label">Reason for sending back</label>
                    <textarea
                      className="textarea"
                      placeholder="What still needs to be fixed before this can be approved?"
                      value={sendBackReason}
                      onChange={e => setSendBackReason(e.target.value)}
                    />
                  </div>
                  <div style={{ display:"flex", gap:10 }}>
                    <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSendBack}>
                      Confirm Send Back
                    </button>
                    <button className="btn btn-ghost" onClick={() => setShowSendBack(false)}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ACTION TYPE 4: NORMAL IN PROGRESS / APPROACHING — view only, nothing to action yet */}
          {c.status === "In Progress" && !exceeded && (
            <div className="card card-pad" style={{ background:"var(--paper)" }}>
              <p className="field-label">Activity</p>
              <div className="timeline">
                {(c.log || []).map((item, i) => (
                  <div className="tl-item" key={i}>
                    <div className="tl-dot-wrap">
                      <div className="tl-dot" />
                      {i < c.log.length - 1 && <div className="tl-bar" />}
                    </div>
                    <div>
                      <div className="tl-label">{item.label}</div>
                      <div className="tl-time">{item.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const key = status.replace(/\s/g, "");
  return <span className={`status-pill status-${key}`}>{status}</span>;
}
