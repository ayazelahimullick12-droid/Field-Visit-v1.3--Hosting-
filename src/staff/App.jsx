import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  MapPin, Calendar, Clock, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Plus, X, Check,
  Camera, Star, Heart, MessageCircle, Share2, ArrowLeft, CheckCircle2,
  Send, Timer, Building2, Home, Wrench, ClipboardList, Search, Radar,
} from "lucide-react";
import { usePersistedCollection } from "../lib/usePersistedCollection";
import { makeId } from "../lib/ids";
import { useTheme } from "../lib/theme";
import AppShell from "../lib/AppShell";
import CommandPalette from "../lib/CommandPalette";
import { PersonFields, PersonDetails, emptyPerson, compactPerson, hasPerson } from "../lib/PersonInfo";
import { FEATURES } from "../lib/features";
import { TERMS, lower } from "../lib/terms";
import BdOutline from "../lib/BdOutline";
import { CountUp, Reveal, Sparkline, DeltaChip } from "../lib/ui";
import { buildLocationTree, computeCoverage, monthBuckets, monthKeyOf, DEFAULT_SETTINGS, STATUS_META } from "../lib/offices";
import Analytics from "./Analytics";
import NetworkHealth from "./NetworkHealth";
import BranchProfile from "./BranchProfile";

/* ------------------------------- API ACTION HELPERS -------------------------------
   Used only by the Fixer Queue tab (see FixerQueue below), which is the one part
   of the staff app that needs the server's business-logic endpoints rather than
   plain collection GET/PUT — see server/logic.js for what these actually do.
   ----------------------------------------------------------------------------------- */

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

// Server-side actions mutate visits/db.json directly, bypassing the usual
// client PUT — so after calling one, pull the fresh collection back down.
async function refetchCollection(name, setter) {
  const res = await fetch(`${API_BASE}/${name}`);
  if (!res.ok) return;
  const data = await res.json();
  setter(() => data);
}

/* ------------------------------- MOCK REFERENCE DATA -------------------------------
   These are fixed organisational reference lists (branch/office structure, dropdown
   options) — not user data, so they stay as plain constants rather than living in
   the JSON database. Everything the user actually enters (accounts, visits,
   feedback, complaints, stories) is persisted via usePersistedCollection below.
   ----------------------------------------------------------------------------------- */


// The location pickers are driven by the master office list (admin console →
// Offices), so adding an office there makes it available here straight away.
const areaOfficeName = (area) => `${area} Office`;
const regionOfficeName = (region) => `${region} Region Office`;
const allRegions = (tree) => Object.values(tree).flatMap((d) => Object.keys(d));
const allAreas = (tree) => Object.values(tree).flatMap((d) => Object.values(d).flatMap((a) => Object.keys(a)));
function findBranchPath(tree, branchName) {
  for (const [division, districts] of Object.entries(tree)) {
    for (const [region, areas] of Object.entries(districts)) {
      for (const [area, branches] of Object.entries(areas)) {
        if (branches.includes(branchName)) return { division, region, area };
      }
    }
  }
  return null;
}

const VILLAGE_ORGS = [
  "VO-104 · Dhanmondi Branch", "VO-118 · Dhanmondi Branch",
  "VO-142 · Mirpur Branch", "VO-156 · Mirpur Branch",
  "VO-091 · Savar Branch", "VO-073 · Gazipur Branch",
  "VO-062 · Uttara Branch", "VO-115 · Tongi Branch",
  "VO-088 · Narayanganj Branch",
];

const REASONS = ["Onboarding", "Monitoring", "Training", "Complaint resolution", "Survey", "Other"];
// Complaint departments (and their units) come from the "departments" collection,
// which the admin console manages; "Other" is always offered and has no units —
// an admin picks the real department when assigning it.
const OTHER_DEPARTMENT = "Other";
const STAFF_FEEDBACK_TAGS = ["Branch well-run", "Staff shortage", "Needs equipment", "Process delays", "Documentation gaps", "Strong loan recovery"];
const MEMBER_FEEDBACK_TAGS = ["Client satisfaction high", "Repayment concerns", "Wants more training", "Positive on service", "Access issues", "Trust in staff high"];

const photoGradients = [
  "linear-gradient(135deg,#EC008C 0%,#7A1FA2 100%)",
  "linear-gradient(135deg,#2F6FED 0%,#1D1E22 100%)",
  "linear-gradient(135deg,#1C8A54 0%,#0D3B24 100%)",
  "linear-gradient(135deg,#B7791F 0%,#5C3A0A 100%)",
  "linear-gradient(135deg,#EC008C 0%,#2F6FED 100%)",
  "linear-gradient(135deg,#5B5D68 0%,#1D1E22 100%)",
];

const initials = (name) => (name || "?").split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase();

/* ---------- Real photo capture (complaints & stories) ----------
   Files are read client-side, downscaled onto a canvas (so a phone photo
   doesn't balloon the JSON database), and stored as a data URL directly on
   the complaint/story record. No separate file server — fine for a
   prototype, but worth swapping for real object storage before this holds
   a lot of production traffic. */

function resizeImageFile(file, maxDim = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PhotoUploadBox({ photoUrl, onChange, hint }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeImageFile(file);
      onChange(dataUrl);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="upload-box" style={photoUrl ? { padding: 0, overflow: "hidden" } : undefined}>
      <input ref={inputRef} type="file" accept="image/*" capture="environment"
             style={{ display: "none" }} onChange={handleFile} />
      {photoUrl ? (
        <div style={{ position: "relative" }}>
          <img src={photoUrl} alt="Attached" style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block", borderRadius: 10 }} />
          <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>Replace</button>
            <button className="btn btn-secondary btn-sm" onClick={() => onChange(null)}><X size={12} /></button>
          </div>
        </div>
      ) : (
        <div onClick={() => !busy && inputRef.current?.click()} style={{ cursor: "pointer" }}>
          <Camera size={26} style={{ marginBottom: 8 }} />
          <div style={{ fontWeight: 650, fontSize: 13, color: "var(--ink)" }}>{busy ? "Processing…" : "Tap to add a photo"}</div>
          <div style={{ fontSize: 11.5, marginTop: 2 }}>{hint || "JPG or PNG"}</div>
        </div>
      )}
    </div>
  );
}

function computeDuration(startDate, startTime, endDate, endTime) {
  if (!startDate || !startTime || !endDate || !endTime) return "";
  const start = new Date(`${startDate}T${startTime}`);
  const end = new Date(`${endDate}T${endTime}`);
  if (isNaN(start) || isNaN(end) || end <= start) return "";
  const totalMinutes = Math.round((end - start) / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days} day${days > 1 ? "s" : ""}`);
  if (hours) parts.push(`${hours} hr${hours > 1 ? "s" : ""}`);
  if (minutes) parts.push(`${minutes} min${minutes > 1 ? "s" : ""}`);
  return parts.join(" ");
}

function StepCount({ steps }) {
  const total = 4;
  const done = Object.values(steps).filter(Boolean).length;
  return { done, total };
}

// The wizard's order: Register → Complaints → Story → Feedback.
const STEP_KEYS = ["register", "complaints", "story", "feedback"];

function nextIncompleteStep(steps) {
  const i = STEP_KEYS.findIndex((k) => !steps[k]);
  return i === -1 ? STEP_KEYS.length - 1 : i;
}

function RingProgress({ done, total }) {
  const pct = done / total;
  const r = 18, c = 2 * Math.PI * r;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--magenta)" strokeWidth="4"
        strokeDasharray={c} strokeDashoffset={c - pct * c} strokeLinecap="round"
        transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--ink)">{done}/{total}</text>
    </svg>
  );
}

/* ================================ AUTH ================================ */
// Login/registration now lives in a shared component (src/lib/AuthScreen.jsx)
// used by both the Staff and Fixer apps — every employee is tracked by a
// unique PIN and can sign in with just that PIN, or with email + password.

/* ================================ APP ================================ */

const SESSION_KEY = "fvt-staff-session"; // stores just the employee id

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [employees, , employeesLoaded] = usePersistedCollection("employees", []);
  const [visits, setVisits] = usePersistedCollection("visits", []);
  const [departments] = usePersistedCollection("departments", []);
  const [offices] = usePersistedCollection("offices", []);
  const [settings] = usePersistedCollection("settings", DEFAULT_SETTINGS);

  // The session only remembers *which* employee is signed in (their id) —
  // the actual employee record always comes fresh from the "employees"
  // collection, so admin edits (role changes, etc.) are reflected without
  // needing to log out and back in.
  const [sessionEmployeeId, setSessionEmployeeId] = useState(() => {
    try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
  });
  const currentEmployee = employees.find((e) => e.id === sessionEmployeeId) || null;

  const [staffTab, setStaffTab] = useState("dashboard"); // dashboard | history | wizard | myComplaints | fixerQueue | branch
  const [prevTab, setPrevTab] = useState("dashboard");
  const [branchKey, setBranchKey] = useState(null);
  const [activeVisitId, setActiveVisitId] = useState(null);
  const [wizardStartStep, setWizardStartStep] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const persistSession = (id) => {
    setSessionEmployeeId(id);
    try {
      if (id) localStorage.setItem(SESSION_KEY, id);
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* private browsing etc. — session just won't survive a reload */ }
  };

  const handleLogout = () => {
    persistSession(null);
    setStaffTab("dashboard");
    setActiveVisitId(null);
    window.location.href = "/";
  };

  // Sign-in/registration lives on the unified landing page ("/"). If there's
  // no valid session here (never logged in, or a stale/deleted employee id),
  // bounce back there instead of showing a login form.
  useEffect(() => {
    if (!employeesLoaded) return;
    if (!currentEmployee) {
      try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      window.location.replace("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeesLoaded, currentEmployee]);

  // Ctrl/⌘ + K opens quick search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const roles = currentEmployee?.roles || [];
  const isManagement = roles.includes("management");
  const isFixer = roles.includes("fixer");
  // Network health / coverage is admin-only unless the feature switch (src/lib/features.js) says otherwise
  const seesNetwork = isManagement && FEATURES.managementSeesNetworkCoverage;
  const tree =useMemo(() => buildLocationTree(offices), [offices]);
  const target = settings?.visitTargetDays || DEFAULT_SETTINGS.visitTargetDays;
  const coverage = useMemo(() => (isManagement ? computeCoverage(offices, visits, target) : []), [isManagement, offices, visits, target]);

  if (!employeesLoaded || !currentEmployee) {
    return (
      <div className="fvt">
        <div className="session-loading"><div className="brand-mark"><MapPin size={20} /></div></div>
      </div>
    );
  }

  // Every visit is the single record for everything that happened during it —
  // registration details, both feedback types, every complaint filed, and the
  // story — all nested under that visit's own unique id in the "visits"
  // collection (server/db.json).
  const openNewVisit = (prefill) => {
    const p = prefill && prefill.key ? prefill : null; // from a branch profile; ignore click events
    const id = makeId("V");
    const draft = {
      id,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      location: p ? p.name : "", locationType: "branch", division: p ? p.division : "", region: p ? p.district : "", area: p ? p.area : "",
      date: "", visitTime: "", returnDate: "", returnTime: "", reason: "Monitoring", duration: "",
      steps: { register: false, feedback: false, complaints: false, story: false },
      feedback: null,
      complaints: [],
      story: null,
    };
    setVisits(vs => [draft, ...vs]);
    setActiveVisitId(id);
    setWizardStartStep(0);
    setStaffTab("wizard");
  };

  const resumeVisit = (id, stepIndex = null) => {
    setActiveVisitId(id);
    setWizardStartStep(stepIndex);
    setStaffTab("wizard");
  };

  const updateVisit = (id, patch) => {
    setVisits(vs => vs.map(v => v.id === id ? { ...v, ...patch } : v));
  };

  const openBranch = (office) => {
    setPrevTab(staffTab === "branch" ? prevTab : staffTab);
    setBranchKey(office.key);
    setStaffTab("branch");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeVisit = visits.find(v => v.id === activeVisitId);
  const closeWizard = () => {
    // opening the wizard saves a draft straight away; don't leave an untouched one behind
    if (activeVisit && !activeVisit.location && !activeVisit.date && !Object.values(activeVisit.steps || {}).some(Boolean)) {
      setVisits(vs => vs.filter(v => v.id !== activeVisit.id));
    }
    setStaffTab("dashboard"); setActiveVisitId(null); setWizardStartStep(null);
  };
  const myVisits = visits.filter(v => v.employeeId === currentEmployee.id);
  const branchRow = branchKey ? coverage.find((o) => o.key === branchKey) : null;

  const assignedOpen = visits.flatMap((v) => v.complaints || []).filter((c) => c.assignedEmployeeId === currentEmployee.id && c.status !== "Resolved").length;
  const tabs = [
    { key: "dashboard", label: "Dashboard", short: "Home", icon: Home },
    { key: "history", label: "Visits", short: "Visits", icon: ClipboardList },
    { key: "myComplaints", label: "My complaints", short: "Complaints", icon: MessageCircle },
    ...(seesNetwork ? [{ key: "network", label: "Network health", short: "Network", icon: Radar }] : []),
    ...(isFixer ? [{ key: "fixerQueue", label: "Fixer queue", short: "Queue", icon: Wrench, count: assignedOpen }] : []),
  ];
  // the wizard belongs to "Visits"; a branch profile belongs to whichever page it was opened from
  const shellActive = staffTab === "wizard" ? "history" : staffTab === "branch" ? (prevTab || "dashboard") : staffTab;

  const paletteItems = [
    { id: "go-dash", group: "Go to", label: "Dashboard", icon: Home, run: () => setStaffTab("dashboard") },
    { id: "go-new", group: "Go to", label: "Register a new visit", icon: Plus, run: () => openNewVisit() },
    { id: "go-visits", group: "Go to", label: "My visits", icon: ClipboardList, run: () => setStaffTab("history") },
    { id: "go-comp", group: "Go to", label: "My complaints", icon: MessageCircle, run: () => setStaffTab("myComplaints") },
    ...(seesNetwork ? [{ id: "go-net", group: "Go to", label: "Network health", icon: Radar, run: () => setStaffTab("network") }] : []),
    ...(isFixer ? [{ id: "go-fix", group: "Go to", label: "Fixer queue", icon: Wrench, run: () => setStaffTab("fixerQueue") }] : []),
    // branch search for management; the coverage status is only shown to those who may see coverage
    ...(isManagement ? coverage.map((o) => ({
      id: o.key, group: "Branches", label: o.name,
      sub: seesNetwork ? `${o.area} · ${o.district} — ${STATUS_META[o.status].label}` : `${o.area} · ${o.district}`,
      icon: MapPin, color: seesNetwork ? STATUS_META[o.status].color : undefined, run: () => openBranch(o),
    })) : []),
    ...myVisits.slice(0, 25).map((v) => ({
      id: v.id, group: "My visits", label: v.location || "Untitled visit", sub: `${v.date || "Draft"} · ${v.reason || ""}`,
      icon: Calendar, run: () => resumeVisit(v.id),
    })),
  ];

  let content;
  if (staffTab === "dashboard") {
    content = (
      <StaffDashboard
        currentEmployee={currentEmployee} visits={visits} myVisits={myVisits} departments={departments}
        offices={offices} settings={settings} isManagement={isManagement}
        onNew={() => openNewVisit()} onResume={resumeVisit} onViewHistory={() => setStaffTab("history")}
        setVisits={setVisits} onOpenBranch={openBranch}
      />
    );
  } else if (staffTab === "history") {
    content = <VisitHistory visits={myVisits} onResume={resumeVisit} onNew={() => openNewVisit()} />;
  } else if (staffTab === "myComplaints") {
    content = <MyComplaints currentEmployee={currentEmployee} visits={visits} />;
  } else if (staffTab === "network" && seesNetwork) {
    content = <NetworkHealth visits={visits} offices={offices} settings={settings} onOpenBranch={openBranch} />;
  } else if (staffTab === "fixerQueue" && isFixer) {
    content = <FixerQueue me={currentEmployee} visits={visits} setVisits={setVisits} showToast={showToast} />;
  } else if (staffTab === "branch" && branchRow) {
    content = <BranchProfile office={branchRow} coverageRows={coverage} onBack={() => setStaffTab(prevTab || "dashboard")} onNewVisit={openNewVisit} />;
  } else if (staffTab === "wizard" && activeVisit) {
    content = (
      <VisitWizard
        visit={activeVisit} tree={tree} departments={departments} startStep={wizardStartStep}
        onUpdate={(patch) => updateVisit(activeVisit.id, patch)}
        onDone={closeWizard} onExit={closeWizard} showToast={showToast}
      />
    );
  } else {
    content = null;
  }

  return (
    <div className="fvt">
      <AppShell
        theme={theme} onToggleTheme={toggleTheme} brandSub="BRAC · Head Office"
        tabs={tabs} active={shellActive} pageKey={staffTab} onTab={setStaffTab}
        fab={{ label: "New visit", icon: Plus, onClick: () => openNewVisit() }}
        onSearch={() => setPaletteOpen(true)}
        user={currentEmployee.name} userSub={roles.length ? roles.join(" · ") : "employee"} onLogout={handleLogout}
      >
        {content}
      </AppShell>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems}
        placeholder={isManagement ? "Search pages, branches, visits…" : "Search pages and your visits…"} />

      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  );
}

/* ============================ STAFF DASHBOARD ============================ */

const STEP_ORDER = [
  { key:"register", label:"Register" },
  { key:"complaints", label:"Complaints" },
  { key:"story", label:"Story" },
  { key:"feedback", label:"Feedback" },
];

function VisitCard({ v, onResume }) {
  const { done, total } = StepCount({ steps: v.steps });
  const curIdx = nextIncompleteStep(v.steps);
  return (
    <div className="visit-card" onClick={() => onResume(v.id)}>
      <div className="visit-top">
        <div>
          <div className="visit-loc"><MapPin size={14} color="var(--magenta)" /> {v.location || "Untitled visit"}</div>
          <div className="visit-meta">
            <Calendar size={11} /> {v.date || "No date set"}
          </div>
          <div className="visit-id mono">{v.id}</div>
        </div>
        <RingProgress done={done} total={total} />
      </div>
      <div style={{ marginTop:10 }}>
        <span className="visit-reason-tag">{v.reason}</span>
      </div>
      <div className="route">
        {STEP_ORDER.map((s, i) => {
          const locked = i > 0 && !v.steps.register;
          return (
            <div className="route-step" key={s.key}>
              <div className="route-line" style={{ display: i === 0 ? "none" : "block" }} />
              <button
                className={`route-dot ${v.steps[s.key] ? "done" : i === curIdx ? "current" : ""}`}
                disabled={locked}
                style={locked ? { opacity:0.4, cursor:"not-allowed" } : undefined}
                onClick={(e) => { e.stopPropagation(); if (!locked) onResume(v.id, i); }}
              >
                {v.steps[s.key] ? <Check size={11} color="#fff" /> : null}
              </button>
              <div className={`route-label ${v.steps[s.key] ? "done" : ""}`}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function SectionHead({ eyebrow, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
      <p className="h-eyebrow" style={{ margin: 0, fontSize: 12 }}>{eyebrow}</p>
      {action}
    </div>
  );
}

function StaffDashboard({ currentEmployee, visits, myVisits, departments, offices, settings, isManagement, onNew, onResume, onViewHistory, setVisits, onOpenBranch }) {
  // Every number here is derived live from the "visits" collection — nothing
  // is tracked separately, so it always matches what's actually stored.
  const myComplaints = myVisits.flatMap(v => v.complaints || []);
  const openComplaints = myComplaints.filter(c => c.status !== "Resolved").length;
  const resolvedComplaints = myComplaints.filter(c => c.status === "Resolved").length;

  const todayVisits = myVisits.filter(v => v.date === new Date().toISOString().slice(0, 10)).length;
  const feedbacksLogged = myVisits.filter(v => v.steps.feedback).length;

  // Story feed shows everyone's posted stories; "your stories" is filtered
  // to this employee. Both are derived from visits.story, not a separate list.
  const allStories = visits.filter(v => v.story?.posted).map(v => ({ ...v.story, visitId: v.id, location: v.location, staffName: v.employeeName, date: v.date, employeeId: v.employeeId }));
  const myStoriesCount = allStories.filter(s => s.employeeId === currentEmployee.id).length;

  const latestVisits = [...myVisits].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 3);

  const months = useMemo(() => monthBuckets(6), []);
  const mySpark = months.map(m => myVisits.filter(v => monthKeyOf(v.date) === m.key).length);
  const thisMonth = mySpark[5], lastMonth = mySpark[4];
  const officesVisited = new Set(myVisits.filter(v => v.location && v.steps?.register).map(v => v.location)).size;

  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const STORY_PREVIEW_COUNT = 4;
  const visibleStories = storiesExpanded ? allStories : allStories.slice(0, STORY_PREVIEW_COUNT);
  const roles = currentEmployee.roles || [];

  const toggleLike = (visitId) => {
    setVisits(vs => vs.map(v => v.id === visitId
      ? { ...v, story: { ...v.story, liked: !v.story.liked, likes: (v.story.likes || 0) + (v.story.liked ? -1 : 1) } }
      : v));
  };

  return (
    <div className="page">
      {/* hero */}
      <Reveal className="hero">
        <BdOutline className="hero-outline" />
        <div className="hero-row">
          <div>
            <p className="h-eyebrow">{greeting()}</p>
            <h1>{currentEmployee.name.split(" ")[0]}</h1>
            <p style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {roles.map(r => <span key={r} className="role-chip">{r}</span>)}
              <span>{currentEmployee.phone ? `${currentEmployee.phone} · ` : ""}ID {currentEmployee.id}</span>
            </p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={onNew}><Plus size={18} strokeWidth={2.6} /> Register new visit</button>
        </div>
        <div className="hero-tiles">
          <div className="hero-tile glass"><div className="ht-num"><CountUp value={myVisits.length} /></div><div className="ht-label">Your visits</div></div>
          <div className="hero-tile glass"><div className="ht-num"><CountUp value={thisMonth} /></div><div className="ht-label">This month</div></div>
          <div className="hero-tile glass"><div className="ht-num"><CountUp value={officesVisited} /></div><div className="ht-label">Offices visited</div></div>
          <div className="hero-tile glass"><div className="ht-num"><CountUp value={openComplaints} /></div><div className="ht-label">Open complaints</div></div>
        </div>
      </Reveal>

      {/* your overview */}
      <div className="section-gap">
        <SectionHead
          eyebrow="Your overview"
          action={
            <button className="btn btn-ghost btn-sm" onClick={() => setOverviewExpanded(e => !e)}>
              {overviewExpanded ? <>Show less <ChevronUp size={14} /></> : <>Show more <ChevronDown size={14} /></>}
            </button>
          }
        />
        <div className="stat-row-group">
          <Reveal i={0} className="stat-card">
            <div className="stat-num"><CountUp value={myVisits.length} /></div>
            <div className="stat-label">Total visits</div>
            <div className="kpi-foot"><Sparkline data={mySpark} color="var(--brand)" w={92} h={26} /></div>
          </Reveal>
          <Reveal i={1} className="stat-card">
            <div className="stat-num"><CountUp value={thisMonth} /></div>
            <div className="stat-label">Visits this month</div>
            <div className="kpi-foot"><DeltaChip current={thisMonth} previous={lastMonth} /><span /></div>
          </Reveal>
          <Reveal i={2} className="stat-card">
            <div className="stat-num"><CountUp value={todayVisits} /></div>
            <div className="stat-label">Today's visits</div>
          </Reveal>
          {overviewExpanded && (
            <>
              <Reveal i={0} className="stat-card"><div className="stat-num"><CountUp value={feedbacksLogged} /></div><div className="stat-label">Feedbacks logged</div></Reveal>
              <Reveal i={1} className="stat-card"><div className="stat-num"><CountUp value={myStoriesCount} /></div><div className="stat-label">Stories shared</div></Reveal>
              <Reveal i={2} className="stat-card"><div className="stat-num" style={{ color: "var(--danger)" }}><CountUp value={openComplaints} /></div><div className="stat-label">Open complaints</div></Reveal>
              <Reveal i={3} className="stat-card"><div className="stat-num" style={{ color: "var(--success)" }}><CountUp value={resolvedComplaints} /></div><div className="stat-label">Resolved complaints</div></Reveal>
            </>
          )}
        </div>
      </div>

      {/* your visits */}
      <div className="section-gap">
        <SectionHead
          eyebrow="Your visits"
          action={<button className="btn btn-ghost btn-sm" onClick={onViewHistory}>View all <ChevronRight size={14} /></button>}
        />
        {latestVisits.length === 0 ? (
          <div className="empty-note card card-pad">
            <p style={{ margin: "0 0 14px" }}>No visits yet — register your first field visit to get started.</p>
            <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> Register new visit</button>
          </div>
        ) : (
          <div className="snap-row">
            {latestVisits.map((v, i) => <Reveal key={v.id} i={i}><VisitCard v={v} onResume={onResume} /></Reveal>)}
          </div>
        )}
      </div>

      {/* management view: visit + complaint analytics (network health & coverage live in their own tab) */}
      {isManagement && (
        <div className="section-gap">
          <Analytics visits={visits} offices={offices} departments={departments} settings={settings} onOpenBranch={onOpenBranch} />
        </div>
      )}

      {/* story feed */}
      <div className="section-gap">
        <SectionHead
          eyebrow="Story feed"
          action={allStories.length > STORY_PREVIEW_COUNT && (
            <button className="btn btn-ghost btn-sm" onClick={() => setStoriesExpanded(e => !e)}>
              {storiesExpanded ? <>Show less <ChevronUp size={14} /></> : <>Show more <ChevronDown size={14} /></>}
            </button>
          )}
        />
        {allStories.length === 0 ? (
          <div className="empty-note card card-pad">No stories posted yet.</div>
        ) : (
          <div className="feed-grid">
            {visibleStories.map((s, i) => (
              <Reveal className="story-card" i={i % 4} key={s.visitId || i}>
                <div className="story-photo" style={s.photoUrl ? undefined : { background: s.gradient || photoGradients[i % photoGradients.length] }}>
                  {s.photoUrl ? (
                    <img src={s.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <Camera size={28} color="rgba(255,255,255,0.85)" />
                  )}
                  <div className="story-photo-tag"><MapPin size={11} /> {s.location}</div>
                </div>
                <div className="story-head">
                  <div className="avatar">{initials(s.staffName)}</div>
                  <div>
                    <div className="story-name">{s.staffName}</div>
                    <div className="story-loc">{s.location} · {s.date}</div>
                  </div>
                </div>
                <div className="story-cap">{s.caption}</div>
                <div className="story-actions">
                  <button className={`story-action ${s.liked ? "liked" : ""}`} onClick={() => toggleLike(s.visitId)}>
                    <Heart size={17} fill={s.liked ? "var(--brand)" : "none"} /> {s.likes || 0}
                  </button>
                  <button className="story-action"><MessageCircle size={17} /> {s.comments || 0}</button>
                  <button className="story-action" style={{ marginLeft: "auto" }}><Share2 size={17} /></button>
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== VISIT HISTORY ============================== */

function VisitHistory({ visits, onResume, onNew }) {
  const sorted = [...visits].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div className="page">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:22, flexWrap:"wrap", gap:14 }}>
        <div>
          <p className="h-eyebrow">All visits</p>
          <h1 className="h-title">Visit history</h1>
          <p className="h-desc">{visits.length} visits on record · tap any step to update it</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> Register new visit</button>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-note card card-pad">No visits yet.</div>
      ) : (
        <div className="visit-grid">
          {sorted.map(v => <VisitCard key={v.id} v={v} onResume={onResume} />)}
        </div>
      )}
    </div>
  );
}

/* ============================== MY COMPLAINTS ============================== */
// Read-only view: every complaint this signed-in employee has filed, across
// all of their visits, with its current status. Filing/editing complaints
// still only happens inside the visit wizard — this is just visibility.

function MyComplaints({ currentEmployee, visits }) {
  const myComplaints = visits
    .flatMap(v => (v.complaints || [])
      .filter(c => c.filedBy === currentEmployee.name)
      .map(c => ({ ...c, visitId: v.id, visitLocation: v.location, visitDate: v.date })))
    .sort((a, b) => (b.filedDate || "").localeCompare(a.filedDate || ""));

  return (
    <div className="page">
      <div style={{ marginBottom: 22 }}>
        <p className="h-eyebrow">Your submissions</p>
        <h1 className="h-title">My Complaints</h1>
        <p className="h-desc">{myComplaints.length} complaint(s) filed by you, and where each one stands.</p>
      </div>

      {myComplaints.length === 0 ? (
        <div className="empty-note card card-pad">You haven't filed any complaints yet.</div>
      ) : (
        myComplaints.map(c => (
          <div className="card card-pad" key={c.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
              <div>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-faint)" }}>{c.id}</span>
                <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{c.description}</div>
              </div>
              <span className={`status-pill status-${c.status.replace(/\s/g, "")}`}>{c.status}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--ink-soft)" }}>
              <span className={`urgency-badge urgency-${c.urgency}`}>{c.urgency}</span>
              <span className="source-badge">{c.department}{c.unit ? ` · ${c.unit}` : ""}</span>
              <span>Filed {c.filedDate} · Visit: {c.visitLocation || c.visitId}</span>
            </div>
            {c.person && <PersonDetails kind={c.source} person={c.person} compact />}
            {c.photoUrl && (
              <img src={c.photoUrl} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, marginTop: 10 }} />
            )}
            {c.assignedTo && (
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>
                Assigned to <strong>{c.assignedTo}</strong>
                {c.deadline && <> · Deadline: {new Date(c.deadline).toLocaleString()}</>}
              </div>
            )}
            {c.status === "Resolved" && c.resolvedAt && (
              <div style={{ fontSize: 12, color: "var(--success)", marginTop: 6, fontWeight: 650 }}>
                Resolved on {new Date(c.resolvedAt).toLocaleString()}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/* ============================== FIXER QUEUE ============================== */
// Visible only to employees tagged with the "fixer" role — since fixers are
// "just like normal users" with an extra role, this lives as another tab in
// the same app rather than a separate login/panel.

function FixerQueue({ me, visits, setVisits, showToast }) {
  const [busyId, setBusyId] = useState(null);

  // Work still to do comes first (escalated ones at the very top, then the soonest
  // deadline); resolved complaints sit at the bottom, newest first.
  const mine = visits
    .flatMap(v => (v.complaints || []).map(c => ({ ...c, visitId: v.id, location: v.location, visitDate: v.date })))
    .filter(c => c.assignedEmployeeId === me.id);
  const inProgress = mine
    .filter(c => c.status !== "Resolved")
    .sort((a, b) => (b.escalated ? 1 : 0) - (a.escalated ? 1 : 0) || new Date(a.deadline || 8.64e15) - new Date(b.deadline || 8.64e15));
  const resolved = mine
    .filter(c => c.status === "Resolved")
    .sort((a, b) => new Date(b.resolvedAt || 0) - new Date(a.resolvedAt || 0));
  const myComplaints = [...inProgress, ...resolved];

  const assignedCount = myComplaints.length;
  const fixedCount = resolved.length;

  const handleResolve = async (c) => {
    setBusyId(c.id);
    try {
      await postAction("resolve-complaint", { visitId: c.visitId, complaintId: c.id, employeeId: me.id });
      await refetchCollection("visits", setVisits);
      showToast(`Marked ${c.id} as resolved.`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 22 }}>
        <p className="h-eyebrow">Fixer Queue</p>
        <h1 className="h-title">Assigned to you</h1>
        <p className="h-desc">Everything assigned to you as a fixer, its timeline, and whether it's been dealt with.</p>
      </div>

      <div className="score-row">
        <div className="score-card"><div className="score-num">{assignedCount}</div><div className="score-label">Assigned</div></div>
        <div className="score-card"><div className="score-num" style={{ color: "var(--success)" }}>{fixedCount}</div><div className="score-label">Fixed</div></div>
        <div className="score-card"><div className="score-num" style={{ color: "var(--magenta)" }}>{assignedCount - fixedCount}</div><div className="score-label">Still Open</div></div>
      </div>

      {myComplaints.length === 0 ? (
        <div className="card empty-note card-pad">Nothing assigned to you yet.</div>
      ) : (
        myComplaints.map((c, idx) => (
          <React.Fragment key={c.id}>
          {idx === 0 && inProgress.length > 0 && <QueueHeading label="In progress" count={inProgress.length} />}
          {idx === inProgress.length && resolved.length > 0 && <QueueHeading label="Resolved" count={resolved.length} />}
          <div className="card complaint-card" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
              <div>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-faint)" }}>{c.id}</span>
                <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{c.description}</div>
              </div>
              <span className={`status-pill status-${c.status.replace(/\s/g, "")}`}>{c.status}</span>
            </div>

            {c.photoUrl && (
              <img src={c.photoUrl} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>
              <span className={`urgency-badge urgency-${c.urgency}`}>{c.urgency}</span>
              <span className="source-badge">{c.department}{c.unit ? ` · ${c.unit}` : ""}</span>
              <span>Visit: {c.location} · {c.visitDate}</span>
            </div>

            {/* who raised it and how to reach them, so the fixer can follow up */}
            <div style={{ marginBottom: 10 }}>
              <PersonDetails kind={c.source} person={c.person} consent={c.consent} />
            </div>

            {c.deadline && (
              <div style={{ fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, color: c.escalated ? "var(--danger)" : "var(--ink-soft)" }}>
                <Clock size={13} /> Deadline: {new Date(c.deadline).toLocaleString()}
                {c.escalated && c.status !== "Resolved" && " — ESCALATED"}
              </div>
            )}

            <div className="timeline" style={{ marginTop: 12, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
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

            {c.status !== "Resolved" && (
              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => handleResolve(c)} disabled={busyId === c.id}>
                <CheckCircle2 size={14} /> Mark Resolved
              </button>
            )}
          </div>
          </React.Fragment>
        ))
      )}
    </div>
  );
}

function QueueHeading({ label, count }) {
  return (
    <div className="section-header" style={{ margin: "6px 0 12px" }}>
      <div className="section-title">{label}</div>
      <span className="badge-count">{count}</span>
    </div>
  );
}

/* ============================== VISIT WIZARD ============================== */

const WIZARD_STEPS = ["Register", "Complaints", "Story", "Feedback"];

function OfficeModal({ tree, onClose, onSelect }) {
  const [officeType, setOfficeType] = useState("area");
  const [choice, setChoice] = useState("");

  const changeType = (t) => { setOfficeType(t); setChoice(""); };

  const options = officeType === "area" ? allAreas(tree).map(areaOfficeName)
    : officeType === "regional" ? allRegions(tree).map(regionOfficeName)
    : VILLAGE_ORGS;

  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth:440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h1 className="h-title" style={{ fontSize:17 }}>Select office or VO</h1>
          </div>
          <button className="modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="modal-body">
          <div className="field-group">
            <label className="field-label">Office type</label>
            <div className="seg">
              <button className={`seg-btn ${officeType === "area" ? "active" : ""}`} onClick={() => changeType("area")}>Area Office</button>
              <button className={`seg-btn ${officeType === "regional" ? "active" : ""}`} onClick={() => changeType("regional")}>Region Office</button>
              <button className={`seg-btn ${officeType === "vo" ? "active" : ""}`} onClick={() => changeType("vo")}>Village Org</button>
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">{officeType === "vo" ? "Village organisation" : "Office"}</label>
            <select className="select" value={choice} onChange={e => setChoice(e.target.value)}>
              <option value="">Select…</option>
              {options.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-block" disabled={!choice} onClick={() => onSelect(choice)}>
            <Check size={14} /> Use this location
          </button>
        </div>
      </div>
    </div>
  );
}

function VisitWizard({ visit, tree, departments, startStep, onUpdate, onDone, onExit, showToast }) {
  const [step, setStep] = useState(startStep ?? nextIncompleteStep(visit.steps));
  const [finished, setFinished] = useState(false);

  const initialLocType = visit.locationType || "branch";
  const initialPath = initialLocType === "branch" ? findBranchPath(tree, visit.location) : null;
  const [locationType, setLocationType] = useState(initialLocType);
  const [division, setDivision] = useState(initialPath?.division || "");
  const [region, setRegion] = useState(initialPath?.region || "");
  const [area, setArea] = useState(initialPath?.area || "");
  const [location, setLocation] = useState(visit.location || "");
  const [showOfficeModal, setShowOfficeModal] = useState(false);
  const [visitDate, setVisitDate] = useState(visit.date || "");
  const [visitTime, setVisitTime] = useState(visit.visitTime || "");
  const [returnDate, setReturnDate] = useState(visit.returnDate || "");
  const [returnTime, setReturnTime] = useState(visit.returnTime || "");
  const [reason, setReason] = useState(visit.reason || "Monitoring");
  const durationLabel = computeDuration(visitDate, visitTime, returnDate, returnTime);
  const allDateTimeFilled = visitDate && visitTime && returnDate && returnTime;

  // Feedback fields
  const [staffTags, setStaffTags] = useState(visit.feedback?.staff?.tags || []);
  const [staffRating, setStaffRating] = useState(visit.feedback?.staff?.rating || 0);
  const [staffNotes, setStaffNotes] = useState(visit.feedback?.staff?.notes || "");
  const [memberTags, setMemberTags] = useState(visit.feedback?.member?.tags || []);
  const [memberRating, setMemberRating] = useState(visit.feedback?.member?.rating || 0);
  const [memberNotes, setMemberNotes] = useState(visit.feedback?.member?.notes || "");
  const [membersConsulted, setMembersConsulted] = useState(visit.feedback?.member?.count || "");
  const [feedbackType, setFeedbackType] = useState(visit.feedback?.activeType || "staff");
  // Who gave the feedback — all optional. Staff: name, PIN, department, contact.
  // Member: name, phone, member number, VO code.
  const [staffPerson, setStaffPerson] = useState({ ...emptyPerson("staff"), ...(visit.feedback?.staff?.person || {}) });
  const [memberPerson, setMemberPerson] = useState({ ...emptyPerson("member"), ...(visit.feedback?.member?.person || {}) });

  // Complaint fields — a visit can carry any number of complaints, each
  // filed either by staff or by a member, all nested under this visit's id.
  // A complaint is routed by department first, then by one of that department's units.
  const [hasComplaints, setHasComplaints] = useState(visit.complaints && visit.complaints.length > 0 ? true : (visit.steps.complaints ? false : null));
  const emptyComplaint = () => ({
    source: "staff", // "staff" or "member"
    // optional details of whoever raised it — one set per source, only the chosen one is saved
    staffPerson: emptyPerson("staff"),
    memberPerson: emptyPerson("member"),
    department: "",
    unit: "",
    description: "",
    urgency: "Medium",
    consent: null,
    photoUrl: null,
  });
  const [complaintDraft, setComplaintDraft] = useState(emptyComplaint);
  const [complaintsList, setComplaintsList] = useState(visit.complaints || []);
  const draftDept = (departments || []).find((d) => d.name === complaintDraft.department);
  const draftUnits = draftDept?.units || [];
  const draftReady = complaintDraft.description.trim() && complaintDraft.department && (draftUnits.length === 0 || complaintDraft.unit);

  const [caption, setCaption] = useState(visit.story?.caption || "");
  const [storyPhotoUrl, setStoryPhotoUrl] = useState(visit.story?.photoUrl || null);

  const makeToggleTag = (setter) => (t) => setter(ts => ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t]);
  const toggleStaffTag = makeToggleTag(setStaffTags);
  const toggleMemberTag = makeToggleTag(setMemberTags);

  const saveRegister = () => {
    onUpdate({
      location, locationType, division, region, area,
      date: visitDate, visitTime, returnDate, returnTime, reason,
      duration: durationLabel,
      steps: { ...visit.steps, register: true },
    });
    setStep(1);
  };

  // Feedback is the last step: saving it completes the visit. The person details
  // are optional; only the ones actually filled in are stored.
  const saveFeedback = (skip) => {
    if (skip) { onExit(); return; }
    const sp = compactPerson(staffPerson), mp = compactPerson(memberPerson);
    onUpdate({
      feedback: {
        staff: { tags: staffTags, rating: staffRating, notes: staffNotes, ...(hasPerson(sp) ? { person: sp } : {}) },
        member: { tags: memberTags, rating: memberRating, notes: memberNotes, count: membersConsulted, ...(hasPerson(mp) ? { person: mp } : {}) },
        activeType: feedbackType,
      },
      steps: { ...visit.steps, feedback: true },
    });
    setFinished(true);
  };

  const addComplaintToList = () => {
    if (!draftReady) return;
    const { staffPerson: sp, memberPerson: mp, ...rest } = complaintDraft;
    const person = compactPerson(rest.source === "member" ? mp : sp);
    setComplaintsList(l => [...l, { ...rest, unit: rest.unit || null, person: hasPerson(person) ? person : null, id: makeId("FC") }]);
    setComplaintDraft(emptyComplaint());
  };

  const saveComplaints = (skip) => {
    if (skip) { setStep(2); return; }
    // Each complaint is enriched with the admin-workflow fields here, once,
    // when it's first attached to the visit — the admin console reads and
    // mutates these same nested objects directly (nothing is duplicated
    // into a separate collection).
    const finalList = hasComplaints ? complaintsList.map(c => ({
      ...c, // keep anything the admin workflow already added (fixer, deadline history, escalation…)
      id: c.id,
      source: c.source,
      department: c.department,
      unit: c.unit ?? null,
      person: c.person ?? null, // optional details of the staff member / member who raised it
      description: c.description,
      urgency: c.urgency,
      consent: c.consent,
      photoUrl: c.photoUrl ?? null,
      status: c.status || "Open",
      filedBy: c.filedBy || visit.employeeName,
      visitId: visit.id,
      filedDate: visit.date || new Date().toISOString().slice(0, 10),
      assignedTo: c.assignedTo ?? null,
      supervisor: c.supervisor ?? null,
      deadline: c.deadline ?? null,
      escalationApproved: c.escalationApproved ?? false,
      resolutionNotes: c.resolutionNotes ?? null,
      log: c.log || [{ label: "Complaint submitted", time: new Date().toLocaleString() }],
    })) : [];
    onUpdate({ complaints: finalList, steps: { ...visit.steps, complaints: true } });
    if (finalList.length) showToast(`${finalList.length} complaint${finalList.length > 1 ? "s" : ""} filed`);
    setStep(2);
  };

  const saveStory = (skip) => {
    if (skip) { setStep(3); return; }
    onUpdate({
      story: {
        caption, posted: true, likes: visit.story?.likes || 0, comments: visit.story?.comments || 0,
        photoUrl: storyPhotoUrl || null,
        gradient: storyPhotoUrl ? null : (visit.story?.gradient || photoGradients[Math.floor(Math.random() * photoGradients.length)]),
      },
      steps: { ...visit.steps, story: true },
    });
    setStep(3);
  };

  if (finished) {
    return (
      <div className="page-narrow">
        <div className="wizard-shell">
          <div className="confirm-wrap">
            <div className="confirm-check"><CheckCircle2 size={30} /></div>
            <h1 className="h-title">Visit fully logged</h1>
            <p className="h-desc">{visit.location} · {visit.date || "today"}</p>
            <p className="field-hint" style={{ marginTop:8 }}>Visit ID: <span className="mono">{visit.id}</span></p>
            <div style={{ display:"flex", gap:10, justifyContent:"center", marginTop:24 }}>
              <button className="btn btn-primary" onClick={onDone}>Back to dashboard</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-narrow">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom:10, paddingLeft:0 }} onClick={onExit}>
        <ArrowLeft size={14} /> Save &amp; exit
      </button>

      <div className="wizard-shell">
        <div className="wizard-head">
          <p className="h-eyebrow">Visit wizard · <span className="mono">{visit.id}</span></p>
          <h1 className="h-title">{visit.location || "New visit"}</h1>
          <div className="stepper">
            {WIZARD_STEPS.map((s, i) => (i === 0 || visit.steps.register) && (
              <div className="step-node" key={s}>
                <div className={`step-connector ${i <= step ? "done" : ""}`} />
                <div className={`step-circle ${i < step ? "done" : i === step ? "current" : ""}`}>
                  {i < step ? <Check size={13} /> : i + 1}
                </div>
                <div className={`step-name ${i === step ? "active" : ""}`}>{s}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="wizard-body">
          {step === 0 && (
            <>
              {locationType === "office" ? (
                <div className="loc-office-summary">
                  <span className="loc-office-summary-text"><Building2 size={14} /> {location}</span>
                  <button className="loc-office-clear" onClick={() => { setLocationType("branch"); setLocation(""); }}>
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="field-row">
                    <div className="field-group">
                      <label className="field-label">Division</label>
                      <select className="select" value={division} onChange={e => { setDivision(e.target.value); setRegion(""); setArea(""); setLocation(""); }}>
                        <option value="">Select division…</option>
                        {Object.keys(tree).map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Region</label>
                      <select className="select" value={region} disabled={!division} onChange={e => { setRegion(e.target.value); setArea(""); setLocation(""); }}>
                        <option value="">Select region…</option>
                        {division && Object.keys(tree[division] || {}).map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field-row">
                    <div className="field-group">
                      <label className="field-label">Area</label>
                      <select className="select" value={area} disabled={!region} onChange={e => { setArea(e.target.value); setLocation(""); }}>
                        <option value="">Select area…</option>
                        {division && region && Object.keys((tree[division] || {})[region] || {}).map(a => <option key={a}>{a}</option>)}
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Branch</label>
                      <select className="select" value={location} disabled={!area} onChange={e => setLocation(e.target.value)}>
                        <option value="">Select branch…</option>
                        {division && region && area && (((tree[division] || {})[region] || {})[area] || []).map(b => <option key={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="loc-office-row">
                    <button className="loc-office-btn" onClick={() => setShowOfficeModal(true)}>
                      <Building2 size={13} /> Visiting an Area/Region Office or Village Organisation instead?
                    </button>
                  </div>
                </>
              )}

              {showOfficeModal && (
                <OfficeModal tree={tree}
                  onClose={() => setShowOfficeModal(false)}
                  onSelect={(name) => { setLocation(name); setLocationType("office"); setShowOfficeModal(false); }}
                />
              )}

              <div className="field-group">
                <label className="field-label">Reason for visit</label>
                <select className="select" value={reason} onChange={e => setReason(e.target.value)}>
                  {REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>

              <div className="field-row">
                <div className="field-group">
                  <label className="field-label">Visiting date</label>
                  <input type="date" className="input" value={visitDate} onChange={e => setVisitDate(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Visiting time</label>
                  <input type="time" className="input" value={visitTime} onChange={e => setVisitTime(e.target.value)} />
                </div>
              </div>
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label">Returning date</label>
                  <input type="date" className="input" value={returnDate} min={visitDate || undefined} onChange={e => setReturnDate(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Returning time</label>
                  <input type="time" className="input" value={returnTime} onChange={e => setReturnTime(e.target.value)} />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Expected duration</label>
                <div className={`duration-display ${durationLabel ? "filled" : allDateTimeFilled ? "invalid" : ""}`}>
                  <Timer size={14} />
                  {durationLabel
                    ? durationLabel
                    : allDateTimeFilled
                      ? "Returning time must be after visiting time"
                      : "Fill dates & times to calculate"}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="field-group">
                <label className="field-label">Any complaints received?</label>
                <div className="toggle-yn">
                  <button className={hasComplaints === true ? "active-yes" : ""} onClick={() => setHasComplaints(true)}>Yes</button>
                  <button className={hasComplaints === false ? "active-no" : ""} onClick={() => setHasComplaints(false)}>No</button>
                </div>
              </div>

              {hasComplaints && (
                <>
                  {complaintsList.map((c, i) => (
                    <div className="complaint-mini" key={c.id || i}>
                      <div style={{ display: "flex", gap: 10 }}>
                        {c.photoUrl && (
                          <img src={c.photoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                        )}
                        <div>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                            <span className="source-badge">{c.source}</span>
                            <strong style={{ fontSize:13 }}>{c.department}{c.unit ? ` · ${c.unit}` : ""}</strong>
                            <span className={`urgency-badge urgency-${c.urgency}`}>{c.urgency}</span>
                          </div>
                          <div style={{ fontSize:12.5, color:"var(--ink-soft)" }}>{c.description}</div>
                          {c.person && <PersonDetails kind={c.source} person={c.person} compact />}
                          <div style={{ fontSize:11, color:"var(--ink-faint)", marginTop:4 }}>
                            Consent to follow up: {c.consent ? "Yes" : "No"}
                          </div>
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => setComplaintsList(l => l.filter((_, idx) => idx !== i))}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <div className="card card-pad" style={{ background:"var(--paper)" }}>
                    {/* The flow: Member/Staff info → Description → Urgency → Photo → Assign to → Consent → Add */}

                    {/* 1 · who is raising it */}
                    <div className="field-group" style={{ marginBottom:14 }}>
                      <label className="field-label">Complaint Source</label>
                      <div className="seg">
                        <button className={`seg-btn ${complaintDraft.source === "staff" ? "active" : ""}`} onClick={() => setComplaintDraft(d => ({ ...d, source: "staff" }))}>
                          Staff
                        </button>
                        <button className={`seg-btn ${complaintDraft.source === "member" ? "active" : ""}`} onClick={() => setComplaintDraft(d => ({ ...d, source: "member" }))}>
                          Member
                        </button>
                      </div>
                    </div>

                    <PersonFields
                      kind={complaintDraft.source}
                      title="Who is raising this complaint?"
                      value={complaintDraft.source === "member" ? complaintDraft.memberPerson : complaintDraft.staffPerson}
                      onChange={(p) => setComplaintDraft(d => ({ ...d, [d.source === "member" ? "memberPerson" : "staffPerson"]: p }))}
                      departments={departments}
                    />

                    {/* 2 · description */}
                    <div className="field-group" style={{ marginBottom:12 }}>
                      <label className="field-label">Description</label>
                      <textarea className="textarea" placeholder={`Describe the complaint from ${complaintDraft.source}…`} value={complaintDraft.description} onChange={e => setComplaintDraft(d => ({ ...d, description: e.target.value }))} />
                    </div>

                    {/* 3 · urgency */}
                    <div className="field-group" style={{ marginBottom:12 }}>
                      <label className="field-label">Urgency</label>
                      <div className="seg">
                        {["Low","Medium","High"].map(u => (
                          <button key={u} className={`seg-btn ${complaintDraft.urgency === u ? "active" : ""}`} onClick={() => setComplaintDraft(d => ({ ...d, urgency:u }))}>{u}</button>
                        ))}
                      </div>
                    </div>

                    {/* 4 · photo */}
                    <div className="field-group" style={{ marginBottom:14 }}>
                      <label className="field-label">Photo (optional)</label>
                      <PhotoUploadBox photoUrl={complaintDraft.photoUrl} onChange={(url) => setComplaintDraft(d => ({ ...d, photoUrl: url }))} />
                    </div>

                    {/* 5 · assign to: a unit, then one of its teams */}
                    <div className="assign-box">
                      <p className="assign-title">Assign to</p>
                      <div className="field-row">
                        <div className="field-group" style={{ marginBottom:12 }}>
                          <label className="field-label">{TERMS.unit}</label>
                          <select className="select" value={complaintDraft.department} onChange={e => setComplaintDraft(d => ({ ...d, department: e.target.value, unit: "" }))}>
                            <option value="">{`Select ${lower(TERMS.unit)}…`}</option>
                            {(departments || []).map(d => <option key={d.id}>{d.name}</option>)}
                            <option>{OTHER_DEPARTMENT}</option>
                          </select>
                        </div>
                        <div className="field-group" style={{ marginBottom:12 }}>
                          <label className="field-label">{TERMS.team}</label>
                          <select className="select" value={complaintDraft.unit} disabled={draftUnits.length === 0}
                                  onChange={e => setComplaintDraft(d => ({ ...d, unit: e.target.value }))}>
                            <option value="">
                              {!complaintDraft.department ? `Select ${lower(TERMS.unit)} first…` : draftUnits.length ? `Select ${lower(TERMS.team)}…` : `No ${lower(TERMS.teams)} — admin will route it`}
                            </option>
                            {draftUnits.map(u => <option key={u.id}>{u.name}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* 6 · consent */}
                    <div className="field-group" style={{ marginBottom:14 }}>
                      <label className="field-label">Consent to follow up</label>
                      <div className="toggle-yn">
                        <button className={complaintDraft.consent === true ? "active-yes" : ""} onClick={() => setComplaintDraft(d => ({ ...d, consent:true }))}>Yes</button>
                        <button className={complaintDraft.consent === false ? "active-no" : ""} onClick={() => setComplaintDraft(d => ({ ...d, consent:false }))}>No</button>
                      </div>
                    </div>

                    {/* 7 · add */}
                    <button className="btn btn-secondary btn-sm" onClick={addComplaintToList} disabled={!draftReady}><Plus size={13} /> Add complaint</button>
                    {!draftReady && complaintDraft.description.trim() && (
                      <span className="field-hint" style={{ marginLeft: 10 }}>
                        {!complaintDraft.department ? `Choose a ${lower(TERMS.unit)}` : `Choose a ${lower(TERMS.team)}`} to add it.
                      </span>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="field-group">
                <label className="field-label">Photo</label>
                <PhotoUploadBox photoUrl={storyPhotoUrl} onChange={setStoryPhotoUrl} hint="JPG or PNG" />
              </div>
              <div className="field-group">
                <label className="field-label">Caption / story</label>
                <textarea className="textarea" placeholder="Share a moment from this visit…" value={caption} onChange={e => setCaption(e.target.value)} />
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <div className="field-group">
                <label className="field-label">Feedback from</label>
                <div className="seg">
                  <button className={`seg-btn ${feedbackType === "staff" ? "active" : ""}`} onClick={() => setFeedbackType("staff")}>
                    Staff
                  </button>
                  <button className={`seg-btn ${feedbackType === "member" ? "active" : ""}`} onClick={() => setFeedbackType("member")}>
                    Member
                  </button>
                </div>
              </div>

              {/* Feedback order: Staff/Member information → (Members consulted, member form only) → Notes / description → Quick tags → Overall rating */}
              {feedbackType === "staff" && (
                <>
                  <p className="h-eyebrow" style={{ marginBottom:10 }}>Staff feedback</p>
                  <PersonFields kind="staff" title="Staff information" value={staffPerson} onChange={setStaffPerson} departments={departments} />
                  <div className="field-group">
                    <label className="field-label">Notes / description</label>
                    <textarea className="textarea" placeholder="Notes from staff…" value={staffNotes} onChange={e => setStaffNotes(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Quick tags</label>
                    <div>
                      {STAFF_FEEDBACK_TAGS.map(t => (
                        <button key={t} className={`chip ${staffTags.includes(t) ? "selected" : ""}`} onClick={() => toggleStaffTag(t)}>{t}</button>
                      ))}
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Overall rating</label>
                    <div className="stars">
                      {[1,2,3,4,5].map(n => (
                        <button key={n} className="star-btn" onClick={() => setStaffRating(n)}>
                          <Star size={22} fill={n <= staffRating ? "var(--magenta)" : "none"} color={n <= staffRating ? "var(--magenta)" : "var(--line)"} />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {feedbackType === "member" && (
                <>
                  <p className="h-eyebrow" style={{ marginBottom:10 }}>Member (client) feedback</p>
                  <PersonFields kind="member" title="Member information" value={memberPerson} onChange={setMemberPerson} />
                  <div className="field-group">
                    <label className="field-label">Members consulted</label>
                    <input className="input" type="number" min="0" placeholder="e.g. 12" value={membersConsulted} onChange={e => setMembersConsulted(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Notes / description</label>
                    <textarea className="textarea" placeholder="Notes from members…" value={memberNotes} onChange={e => setMemberNotes(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Quick tags</label>
                    <div>
                      {MEMBER_FEEDBACK_TAGS.map(t => (
                        <button key={t} className={`chip ${memberTags.includes(t) ? "selected" : ""}`} onClick={() => toggleMemberTag(t)}>{t}</button>
                      ))}
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Overall rating</label>
                    <div className="stars">
                      {[1,2,3,4,5].map(n => (
                        <button key={n} className="star-btn" onClick={() => setMemberRating(n)}>
                          <Star size={22} fill={n <= memberRating ? "var(--magenta)" : "none"} color={n <= memberRating ? "var(--magenta)" : "var(--line)"} />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

        </div>

        <div className="wizard-foot">
          <button className="btn btn-ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft size={15} /> Back
          </button>
          <div style={{ display:"flex", gap:10 }}>
            {step > 0 && (
              <button className="btn btn-secondary" onClick={() => {
                if (step === 1) saveComplaints(true);
                else if (step === 2) saveStory(true);
                else if (step === 3) saveFeedback(true);
              }}>Skip for now</button>
            )}
            {step === 0 && (
              <button className="btn btn-primary" onClick={saveRegister} disabled={!location || !durationLabel}>
                Next <ChevronRight size={15} />
              </button>
            )}
            {step === 1 && (
              <button className="btn btn-primary" onClick={() => saveComplaints(false)} disabled={hasComplaints === null}>
                Next <ChevronRight size={15} />
              </button>
            )}
            {step === 2 && (
              <button className="btn btn-primary" onClick={() => saveStory(false)}>
                <Send size={14} /> Post to feed
              </button>
            )}
            {step === 3 && (
              <button className="btn btn-primary" onClick={() => saveFeedback(false)}>
                <Check size={15} /> Finish visit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
