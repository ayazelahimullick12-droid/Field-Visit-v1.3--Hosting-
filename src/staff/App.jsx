import React, { useState } from "react";
import {
  MapPin, Calendar, Clock, ChevronRight, ChevronLeft, Plus, X, Check,
  Camera, Star, Heart, MessageCircle, Share2, ArrowLeft, CheckCircle2,
  Send, Timer, Building2, Home, Mail, Lock, LogIn, ShieldCheck,
  User, Phone, UserPlus, LogOut
} from "lucide-react";
import { usePersistedCollection } from "../lib/usePersistedCollection";
import { makeId } from "../lib/ids";

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

  .login-screen{ min-height:100vh; display:flex; align-items:center; justify-content:center;
                 background:linear-gradient(160deg, var(--paper) 0%, var(--magenta-wash) 130%); padding:24px; }
  .login-card{ width:100%; max-width:380px; background:var(--card); border:1px solid var(--line);
               border-radius:var(--radius-lg); box-shadow:var(--shadow-pop); padding:36px 30px 28px; text-align:center; }
  .login-logo{ width:44px; height:44px; border-radius:12px; background:var(--magenta);
               display:flex; align-items:center; justify-content:center; margin:0 auto 16px; }
  .login-title{ font-size:19px; font-weight:750; margin:0; }
  .login-sub{ font-size:12px; color:var(--ink-faint); margin:4px 0 0; }
  .login-card .field-group{ text-align:left; margin-top:20px; margin-bottom:0; }
  .login-card .field-group + .field-group{ margin-top:16px; }
  .login-input-wrap{ position:relative; }
  .login-input-icon{ position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--ink-faint); pointer-events:none; }
  .login-input{ padding-left:36px; }
  .login-card .btn-block{ margin-top:24px; }
  .login-divider{ display:flex; align-items:center; gap:10px; margin:18px 0; color:var(--ink-faint);
                   font-size:11px; text-transform:uppercase; letter-spacing:0.05em; }
  .login-divider::before, .login-divider::after{ content:""; flex:1; height:1px; background:var(--line); }
  .login-footer{ font-size:11px; color:var(--ink-faint); margin:20px 0 0; }
  .login-error{ background:var(--danger-wash); color:var(--danger); font-size:12px; font-weight:650; padding:9px 12px; border-radius:8px; margin-top:16px; text-align:left; }
  .auth-tabs{ display:flex; background:var(--line-soft); border-radius:9px; padding:3px; gap:2px; margin-top:18px; }
  .auth-tab{ flex:1; border:none; background:transparent; padding:8px; border-radius:7px; font-size:12.5px; font-weight:650; color:var(--ink-soft); cursor:pointer; }
  .auth-tab.active{ background:var(--card); color:var(--ink); box-shadow:0 1px 3px rgba(0,0,0,0.08); }
  .fvt *{ box-sizing:border-box; }
  .mono{ font-family:'IBM Plex Mono','SF Mono',monospace; letter-spacing:-0.01em; }

  /* ---------- top nav ---------- */
  .nav{ position:sticky; top:0; z-index:40; background:var(--card); border-bottom:1px solid var(--line);
        display:flex; align-items:center; justify-content:space-between; padding:12px 20px; }
  .nav-left{ display:flex; align-items:center; gap:10px; }
  .nav-logo{ width:34px; height:34px; border-radius:9px; background:var(--magenta);
             display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .nav-title{ font-weight:700; font-size:15px; letter-spacing:-0.01em; }
  .nav-sub{ font-size:11px; color:var(--ink-faint); margin-top:-1px; }
  .nav-tabs{ display:flex; align-items:center; gap:2px; }
  .nav-tab{ display:flex; align-items:center; gap:6px; padding:7px 12px; border-radius:8px; font-size:13px;
            font-weight:600; color:var(--ink-soft); cursor:pointer; border:none; background:transparent; }
  .nav-tab.active{ background:var(--magenta-wash); color:var(--magenta-dark); }
  .avatar{ width:30px; height:30px; border-radius:999px; background:var(--magenta-wash-2); color:var(--magenta-dark);
           display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; flex-shrink:0; }
  .logout-btn{ background:none; border:none; color:var(--ink-faint); cursor:pointer; display:flex; align-items:center; padding:6px; border-radius:8px; }
  .logout-btn:hover{ color:var(--danger); background:var(--danger-wash); }

  .page{ max-width:1080px; margin:0 auto; padding:28px 20px 60px; }
  .page-narrow{ max-width:640px; margin:0 auto; padding:28px 20px 60px; }

  h1.h-title{ font-size:22px; font-weight:750; letter-spacing:-0.02em; margin:0; }
  .h-eyebrow{ font-size:11.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--magenta); margin:0 0 4px; }
  .h-desc{ color:var(--ink-soft); font-size:13.5px; margin:4px 0 0; }

  .btn{ display:inline-flex; align-items:center; justify-content:center; gap:7px; border:none; cursor:pointer;
        font-weight:650; font-size:13.5px; border-radius:9px; padding:10px 16px; transition:transform .06s ease; }
  .btn:active{ transform:scale(0.97); }
  .btn-primary{ background:var(--magenta); color:#fff; }
  .btn-primary:hover{ background:var(--magenta-dark); }
  .btn-secondary{ background:var(--card); color:var(--ink); border:1px solid var(--line); }
  .btn-secondary:hover{ background:var(--line-soft); }
  .btn-ghost{ background:transparent; color:var(--ink-soft); }
  .btn-ghost:hover{ color:var(--ink); }
  .btn-sm{ padding:7px 12px; font-size:12.5px; border-radius:8px; }
  .btn:disabled{ opacity:0.4; cursor:not-allowed; }
  .btn-block{ width:100%; }

  .card{ background:var(--card); border:1px solid var(--line); border-radius:var(--radius-lg); box-shadow:var(--shadow-card); }
  .card-pad{ padding:18px; }

  /* ---------- grouped stats ---------- */
  .stat-section { margin-bottom: 28px; }
  .stat-section-heading { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-faint); margin-bottom: 10px; }
  .stat-row-group { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
  .stat-card{ background:var(--card); border:1px solid var(--line); border-radius:var(--radius-md); padding:14px 16px; }
  .stat-num{ font-size:22px; font-weight:750; letter-spacing:-0.02em; }
  .stat-label{ font-size:11.5px; color:var(--ink-faint); font-weight:600; margin-top:2px; }

  .visit-grid{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .visit-card{ background:var(--card); border:1px solid var(--line); border-radius:var(--radius-lg); padding:16px;
               cursor:pointer; box-shadow:var(--shadow-card); transition:border-color .1s ease; }
  .visit-card:hover{ border-color:var(--magenta); }
  .visit-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  .visit-loc{ font-weight:700; font-size:14.5px; display:flex; align-items:center; gap:6px; }
  .visit-meta{ font-size:12px; color:var(--ink-soft); margin-top:3px; display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
  .visit-id{ font-size:10.5px; color:var(--ink-faint); }
  .visit-reason-tag{ font-size:10.5px; font-weight:700; padding:3px 8px; border-radius:6px; background:var(--info-wash); color:var(--info); text-transform:uppercase; letter-spacing:0.02em; }

  .route{ display:flex; align-items:center; gap:0; margin-top:14px; }
  .route-step{ display:flex; flex-direction:column; align-items:center; gap:5px; flex:1; position:relative; }
  .route-dot{ width:20px; height:20px; border-radius:999px; display:flex; align-items:center; justify-content:center;
              border:2px solid var(--line); background:var(--card); z-index:2; padding:0; cursor:pointer; }
  .route-dot:hover{ border-color:var(--magenta); }
  .route-dot.done{ background:var(--magenta); border-color:var(--magenta); }
  .route-dot.current{ border-color:var(--magenta); background:var(--magenta-wash); }
  .route-label{ font-size:9.5px; font-weight:700; color:var(--ink-faint); text-transform:uppercase; letter-spacing:0.03em; }
  .route-label.done{ color:var(--magenta-dark); }
  .route-line{ position:absolute; top:9px; left:-50%; width:100%; height:2px; background:var(--line); z-index:1; }
  .route-step:first-child .route-line{ display:none; }

  .empty-note{ text-align:center; padding:50px 20px; color:var(--ink-faint); }

  /* ---------- wizard ---------- */
  .wizard-shell{ background:var(--card); border:1px solid var(--line); border-radius:var(--radius-lg); box-shadow:var(--shadow-card); overflow:hidden; }
  .wizard-head{ padding:20px 24px 14px; border-bottom:1px solid var(--line-soft); }
  .wizard-body{ padding:24px; }
  .wizard-foot{ padding:16px 24px; border-top:1px solid var(--line-soft); display:flex; justify-content:space-between; align-items:center; }

  .stepper{ display:flex; align-items:center; margin-top:16px; }
  .step-node{ display:flex; flex-direction:column; align-items:center; flex:1; position:relative; }
  .step-circle{ width:30px; height:30px; border-radius:999px; display:flex; align-items:center; justify-content:center;
                background:var(--card); border:2px solid var(--line); font-size:12px; font-weight:700; color:var(--ink-faint); z-index:2; }
  .step-circle.done{ background:var(--magenta); border-color:var(--magenta); color:#fff; }
  .step-circle.current{ border-color:var(--magenta); color:var(--magenta); background:var(--magenta-wash); }
  .step-name{ font-size:11px; font-weight:650; color:var(--ink-faint); margin-top:6px; }
  .step-name.active{ color:var(--ink); }
  .step-connector{ position:absolute; top:14px; left:-50%; width:100%; height:2px; background:var(--line); z-index:1;
                    background-image: linear-gradient(to right, var(--line) 60%, transparent 0%); background-size:8px 2px; background-repeat:repeat-x; }
  .step-connector.done{ background-image:none; background:var(--magenta); }
  .step-node:first-child .step-connector{ display:none; }

  .field-group{ margin-bottom:18px; }
  .field-label{ font-size:12.5px; font-weight:650; color:var(--ink); margin-bottom:6px; display:block; }
  .field-hint{ font-size:11.5px; color:var(--ink-faint); margin-top:4px; }
  .input, .select, .textarea{ width:100%; border:1px solid var(--line); border-radius:99px; padding:10px 12px; font-size:13.5px;
        font-family:inherit; background:var(--card); color:var(--ink); }
  .input, .select { border-radius:9px; }
  .input:focus, .select:focus, .textarea:focus{ outline:2px solid var(--magenta); outline-offset:1px; border-color:var(--magenta); }
  .textarea{ resize:vertical; min-height:80px; border-radius:9px; }
  .field-row{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }

  .duration-display{ display:flex; align-items:center; gap:8px; background:var(--paper); border:1px solid var(--line);
                      border-radius:9px; padding:10px 12px; font-size:13px; font-weight:650; color:var(--ink-faint); }
  .duration-display.filled{ background:var(--info-wash); border-color:transparent; color:var(--info); }
  .duration-display.invalid{ background:var(--danger-wash); border-color:transparent; color:var(--danger); }

  .loc-office-row{ display:flex; justify-content:flex-end; margin:-6px 0 20px; }
  .loc-office-btn{ background:none; border:none; color:var(--magenta-dark); font-size:12px; font-weight:650;
                    cursor:pointer; display:flex; align-items:center; gap:5px; padding:4px 0; text-align:right; }
  .loc-office-btn:hover{ text-decoration:underline; }
  .loc-office-summary{ display:flex; align-items:center; justify-content:space-between; background:var(--magenta-wash);
                        border:1px solid var(--magenta-wash-2); border-radius:9px; padding:11px 14px; margin-bottom:18px; }
  .loc-office-summary-text{ font-size:13px; font-weight:650; color:var(--magenta-dark); display:flex; align-items:center; gap:7px; }
  .loc-office-clear{ background:none; border:1px solid var(--magenta-wash-2); border-radius:999px; width:24px; height:24px;
                      color:var(--magenta-dark); cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; }

  .seg{ display:inline-flex; background:var(--line-soft); border-radius:9px; padding:3px; gap:2px; }
  .seg-btn{ border:none; background:transparent; padding:8px 14px; border-radius:7px; font-size:12.5px; font-weight:650; color:var(--ink-soft); cursor:pointer; }
  .seg-btn.active{ background:var(--card); color:var(--ink); box-shadow:0 1px 3px rgba(0,0,0,0.08); }

  .chip{ display:inline-flex; align-items:center; padding:8px 13px; border-radius:999px; border:1.5px solid var(--line);
         font-size:12.5px; font-weight:600; cursor:pointer; color:var(--ink-soft); background:var(--card); margin:0 8px 8px 0; }
  .chip.selected{ background:var(--magenta); border-color:var(--magenta); color:#fff; }

  .stars{ display:flex; gap:5px; }
  .star-btn{ background:none; border:none; cursor:pointer; padding:2px; }

  .toggle-yn{ display:inline-flex; background:var(--line-soft); border-radius:9px; padding:3px; }
  .toggle-yn button{ border:none; background:transparent; padding:8px 20px; border-radius:7px; font-size:13px; font-weight:650; cursor:pointer; color:var(--ink-soft); }
  .toggle-yn button.active-yes{ background:var(--danger); color:#fff; }
  .toggle-yn button.active-no{ background:var(--ink); color:#fff; }

  .complaint-mini{ border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:flex-start; gap:10px; background:var(--paper); }
  .urgency-badge{ font-size:10px; font-weight:750; padding:3px 8px; border-radius:6px; text-transform:uppercase; letter-spacing:0.02em; }
  .urgency-Low{ background:var(--success-wash); color:var(--success); }
  .urgency-Medium{ background:var(--warning-wash); color:var(--warning); }
  .urgency-High{ background:var(--danger-wash); color:var(--danger); }
  .source-badge{ font-size:10px; font-weight:750; padding:3px 8px; border-radius:6px; text-transform:uppercase; background:var(--line-soft); color:var(--ink-soft); }

  .upload-box{ border:1.5px dashed var(--line); border-radius:12px; padding:34px 20px; text-align:center; color:var(--ink-faint);
               cursor:pointer; background:var(--paper); }
  .upload-box:hover{ border-color:var(--magenta); color:var(--magenta-dark); }

  .confirm-wrap{ text-align:center; padding:40px 24px; }
  .confirm-check{ width:56px; height:56px; border-radius:999px; background:var(--success-wash); color:var(--success);
                   display:flex; align-items:center; justify-content:center; margin:0 auto 14px; }

  /* ---------- story feed ---------- */
  .feed-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  .story-card{ background:var(--card); border:1px solid var(--line); border-radius:var(--radius-lg); overflow:hidden; box-shadow:var(--shadow-card); }
  .story-photo{ height:280px; width:100%; display:flex; align-items:center; justify-content:center; position:relative; }
  .story-photo-tag{ position:absolute; bottom:10px; left:12px; background:rgba(0,0,0,0.45); color:#fff; font-size:11px; font-weight:600; padding:4px 9px; border-radius:6px; display:flex; align-items:center; gap:5px; }
  .story-head{ display:flex; align-items:center; gap:10px; padding:13px 14px 6px; }
  .story-name{ font-weight:700; font-size:13.5px; }
  .story-loc{ font-size:11.5px; color:var(--ink-faint); }
  .story-cap{ padding:8px 14px 4px; font-size:13px; line-height:1.5; }
  .story-actions{ display:flex; align-items:center; gap:16px; padding:8px 14px 14px; color:var(--ink-soft); }
  .story-action{ display:flex; align-items:center; gap:5px; font-size:12.5px; font-weight:600; background:none; border:none; cursor:pointer; color:var(--ink-soft); }
  .story-action.liked{ color:var(--magenta); }

  /* ---------- modal & toast ---------- */
  .modal-veil{ position:fixed; inset:0; background:rgba(20,20,24,0.44); display:flex; align-items:flex-start; justify-content:center;
               padding:40px 16px; z-index:100; overflow-y:auto; }
  .modal-box{ background:var(--card); border-radius:16px; width:100%; max-width:620px; box-shadow:var(--shadow-pop); }
  .modal-head{ padding:20px 22px; border-bottom:1px solid var(--line-soft); display:flex; justify-content:space-between; align-items:flex-start; }
  .modal-body{ padding:22px; }
  .modal-close{ background:var(--line-soft); border:none; width:28px; height:28px; border-radius:999px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--ink-soft); flex-shrink:0; }

  .toast{ position:fixed; bottom:26px; left:50%; transform:translateX(-50%); background:var(--ink); color:#fff;
          padding:12px 20px; border-radius:10px; font-size:13px; font-weight:600; display:flex; align-items:center; gap:8px;
          box-shadow:var(--shadow-pop); z-index:200; }

  @media (max-width: 720px){
    .visit-grid{ grid-template-columns:1fr; }
    .field-row{ grid-template-columns:1fr; }
    .feed-grid{ grid-template-columns:1fr; }
  }
  @media (max-width: 980px) and (min-width: 721px){
    .feed-grid{ grid-template-columns:1fr 1fr; }
  }
`;

/* ------------------------------- MOCK REFERENCE DATA -------------------------------
   These are fixed organisational reference lists (branch/office structure, dropdown
   options) — not user data, so they stay as plain constants rather than living in
   the JSON database. Everything the user actually enters (accounts, visits,
   feedback, complaints, stories) is persisted via usePersistedCollection below.
   ----------------------------------------------------------------------------------- */

const LOCATIONS = {
  "Dhaka Division": {
    "Dhaka Region": {
      "Dhaka Metro Area": ["Dhanmondi Branch", "Mirpur Branch", "Uttara Branch"],
      "Narayanganj Area": ["Narayanganj Branch", "Savar Branch"],
    },
    "Gazipur Region": {
      "Gazipur Area": ["Gazipur Branch"],
      "Tongi Area": ["Tongi Branch"],
    },
  },
  "Chattogram Division": {
    "Chattogram Region": {
      "Chattogram Metro Area": ["Chattogram Branch", "Pahartali Branch"],
    },
  },
};

const ALL_REGIONS = Object.values(LOCATIONS).flatMap(regions => Object.keys(regions));
const ALL_AREAS = Object.values(LOCATIONS).flatMap(regions =>
  Object.values(regions).flatMap(areas => Object.keys(areas))
);
const areaOfficeName = (area) => `${area} Office`;
const regionalOfficeName = (region) => `${region} Office`;

const VILLAGE_ORGS = [
  "VO-104 · Dhanmondi Branch", "VO-118 · Dhanmondi Branch",
  "VO-142 · Mirpur Branch", "VO-156 · Mirpur Branch",
  "VO-091 · Savar Branch", "VO-073 · Gazipur Branch",
  "VO-062 · Uttara Branch", "VO-115 · Tongi Branch",
  "VO-088 · Narayanganj Branch",
];

function findBranchPath(branchName) {
  for (const [division, regions] of Object.entries(LOCATIONS)) {
    for (const [region, areas] of Object.entries(regions)) {
      for (const [area, branches] of Object.entries(areas)) {
        if (branches.includes(branchName)) return { division, region, area };
      }
    }
  }
  return null;
}

const REASONS = ["Monitoring", "Training", "Complaint resolution", "Survey", "Undefined"];
const DEPARTMENTS = ["Construction", "Software", "HR", "Finance", "Operations", "Undefined"];
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

function nextIncompleteStep(steps) {
  if (!steps.register) return 0;
  if (!steps.feedback) return 1;
  if (!steps.complaints) return 2;
  if (!steps.story) return 3;
  return 3;
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
// Real accounts: name + phone number + employee PIN, checked against the
// "employees" collection in the JSON database (server/db.json). Login only
// sets which employee is "active" in this browser tab — it doesn't create
// or change any stored data.

function AuthScreen({ employees, onRegister, onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const resetFields = () => { setName(""); setPhone(""); setPin(""); setError(""); };

  const switchMode = (m) => { setMode(m); resetFields(); };

  const handleLogin = () => {
    setError("");
    if (!phone.trim() || !pin.trim()) {
      setError("Enter your phone number and PIN.");
      return;
    }
    const match = employees.find(e => e.phone === phone.trim() && e.pin === pin.trim());
    if (!match) {
      setError("No account matches that phone number and PIN.");
      return;
    }
    onLogin(match);
  };

  const handleRegister = () => {
    setError("");
    if (!name.trim() || !phone.trim() || !pin.trim()) {
      setError("Fill in your name, phone number, and a PIN.");
      return;
    }
    if (!/^\d{4,8}$/.test(pin.trim())) {
      setError("PIN should be 4–8 digits.");
      return;
    }
    if (employees.some(e => e.phone === phone.trim())) {
      setError("That phone number is already registered — try logging in instead.");
      return;
    }
    const newEmployee = {
      id: makeId("EMP"),
      name: name.trim(),
      phone: phone.trim(),
      pin: pin.trim(),
      createdAt: new Date().toISOString(),
    };
    onRegister(newEmployee);
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo"><MapPin size={20} color="#fff" /></div>
        <h1 className="login-title">Field Visit Tracker</h1>
        <p className="login-sub">BRAC Microfinance Programme · Technology Unit</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === "login" ? "active" : ""}`} onClick={() => switchMode("login")}>Sign in</button>
          <button className={`auth-tab ${mode === "register" ? "active" : ""}`} onClick={() => switchMode("register")}>Create account</button>
        </div>

        {mode === "register" && (
          <div className="field-group">
            <label className="field-label">Full name</label>
            <div className="login-input-wrap">
              <User size={15} className="login-input-icon" />
              <input className="input login-input" type="text" placeholder="Ayaz Elahi"
                     value={name} onChange={e => setName(e.target.value)} />
            </div>
          </div>
        )}

        <div className="field-group">
          <label className="field-label">Phone number</label>
          <div className="login-input-wrap">
            <Phone size={15} className="login-input-icon" />
            <input className="input login-input" type="tel" placeholder="017XXXXXXXX"
                   value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Employee PIN</label>
          <div className="login-input-wrap">
            <Lock size={15} className="login-input-icon" />
            <input className="input login-input" type="password" inputMode="numeric" placeholder="4–8 digits"
                   value={pin} onChange={e => setPin(e.target.value)} />
          </div>
          {mode === "register" && <p className="field-hint">You'll use this PIN together with your phone number to sign in next time.</p>}
        </div>

        {error && <div className="login-error">{error}</div>}

        {mode === "login" ? (
          <button className="btn btn-primary btn-block" onClick={handleLogin}>
            <LogIn size={15} /> Sign in
          </button>
        ) : (
          <button className="btn btn-primary btn-block" onClick={handleRegister}>
            <UserPlus size={15} /> Create account
          </button>
        )}

        <p className="login-footer">Your account is stored locally in this app's database — it isn't shared outside this deployment.</p>
      </div>
    </div>
  );
}

/* ================================ APP ================================ */

export default function App() {
  const [employees, setEmployees] = usePersistedCollection("employees", []);
  const [visits, setVisits] = usePersistedCollection("visits", []);
  const [currentEmployee, setCurrentEmployee] = useState(null);

  const [staffTab, setStaffTab] = useState("dashboard"); // dashboard | history | wizard
  const [activeVisitId, setActiveVisitId] = useState(null);
  const [wizardStartStep, setWizardStartStep] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const handleRegister = (newEmployee) => {
    setEmployees(es => [...es, newEmployee]);
    setCurrentEmployee(newEmployee);
    showToast(`Welcome, ${newEmployee.name}!`);
  };

  const handleLogin = (employee) => {
    setCurrentEmployee(employee);
    showToast(`Welcome back, ${employee.name}!`);
  };

  const handleLogout = () => {
    setCurrentEmployee(null);
    setStaffTab("dashboard");
    setActiveVisitId(null);
  };

  if (!currentEmployee) {
    return (
      <div className="fvt">
        <style>{STYLES}</style>
        <AuthScreen employees={employees} onRegister={handleRegister} onLogin={handleLogin} />
        {toast && <div className="toast"><Check size={15} /> {toast}</div>}
      </div>
    );
  }

  // Every visit is the single record for everything that happened during it —
  // registration details, both feedback types, every complaint filed, and the
  // story — all nested under that visit's own unique id in the "visits"
  // collection (server/db.json).
  const openNewVisit = () => {
    const id = makeId("V");
    const draft = {
      id,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      location: "", locationType: "branch", division: "", region: "", area: "",
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

  const activeVisit = visits.find(v => v.id === activeVisitId);
  const closeWizard = () => { setStaffTab("dashboard"); setActiveVisitId(null); setWizardStartStep(null); };

  const myVisits = visits.filter(v => v.employeeId === currentEmployee.id);

  return (
    <div className="fvt">
      <style>{STYLES}</style>

      <div className="nav">
        <div className="nav-left">
          <div className="nav-logo"><MapPin size={18} color="#fff" /></div>
          <div>
            <div className="nav-title">Field Visit Tracker</div>
            <div className="nav-sub">BRAC Microfinance · Technology Unit</div>
          </div>
        </div>

        <div className="nav-tabs">
          <button className={`nav-tab ${staffTab === "dashboard" ? "active" : ""}`} onClick={() => setStaffTab("dashboard")}>
            <Home size={14} /> Dashboard
          </button>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div className="avatar" title={currentEmployee.name}>{initials(currentEmployee.name)}</div>
          <button className="logout-btn" title="Sign out" onClick={handleLogout}><LogOut size={16} /></button>
        </div>
      </div>

      {staffTab === "dashboard" && (
        <StaffDashboard
          currentEmployee={currentEmployee}
          visits={visits}
          myVisits={myVisits}
          onNew={openNewVisit}
          onResume={resumeVisit}
          onViewHistory={() => setStaffTab("history")}
          setVisits={setVisits}
        />
      )}

      {staffTab === "history" && (
        <VisitHistory visits={myVisits} onResume={resumeVisit} onNew={openNewVisit} />
      )}

      {staffTab === "wizard" && activeVisit && (
        <VisitWizard
          visit={activeVisit}
          startStep={wizardStartStep}
          onUpdate={(patch) => updateVisit(activeVisit.id, patch)}
          onDone={closeWizard}
          onExit={closeWizard}
          showToast={showToast}
        />
      )}

      {toast && (
        <div className="toast"><Check size={15} /> {toast}</div>
      )}
    </div>
  );
}

/* ============================ STAFF DASHBOARD ============================ */

const STEP_ORDER = [
  { key:"register", label:"Register" },
  { key:"feedback", label:"Feedback" },
  { key:"complaints", label:"Complaints" },
  { key:"story", label:"Story" },
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

function StaffDashboard({ currentEmployee, visits, myVisits, onNew, onResume, onViewHistory, setVisits }) {
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

  const toggleLike = (visitId) => {
    setVisits(vs => vs.map(v => v.id === visitId
      ? { ...v, story: { ...v.story, liked: !v.story.liked, likes: (v.story.likes || 0) + (v.story.liked ? -1 : 1) } }
      : v));
  };

  return (
    <div className="page">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:22, flexWrap:"wrap", gap:14 }}>
        <div>
          <p className="h-eyebrow">Welcome back</p>
          <h1 className="h-title">{currentEmployee.name}</h1>
          <p className="h-desc">{currentEmployee.phone} · Employee ID {currentEmployee.id}</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> Register new visit</button>
      </div>

      <p className="h-eyebrow" style={{ marginBottom: 16 }}>Your overview</p>

      <div className="stat-section">
        <div className="stat-section-heading">Visit Statistics</div>
        <div className="stat-row-group">
          <div className="stat-card">
            <div className="stat-num">{myVisits.length}</div>
            <div className="stat-label">Total Visits</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{todayVisits}</div>
            <div className="stat-label">Today's Visits</div>
          </div>
        </div>
      </div>

      <div className="stat-section">
        <div className="stat-section-heading">Activity Statistics</div>
        <div className="stat-row-group">
          <div className="stat-card">
            <div className="stat-num">{feedbacksLogged}</div>
            <div className="stat-label">Feedbacks Logged</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{myStoriesCount}</div>
            <div className="stat-label">Stories Shared</div>
          </div>
        </div>
      </div>

      <div className="stat-section">
        <div className="stat-section-heading">Complaint Statistics</div>
        <div className="stat-row-group">
          <div className="stat-card">
            <div className="stat-num">{openComplaints}</div>
            <div className="stat-label">Open Complaints</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{resolvedComplaints}</div>
            <div className="stat-label">Resolved Complaints</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, marginBottom:12, display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
        <p className="h-eyebrow" style={{ marginBottom:0 }}>Your visits</p>
        <button className="btn btn-ghost btn-sm" onClick={onViewHistory}>
          View all <ChevronRight size={13} />
        </button>
      </div>
      {latestVisits.length === 0 ? (
        <div className="empty-note card card-pad">No visits yet — register your first field visit to get started.</div>
      ) : (
        <div className="visit-grid">
          {latestVisits.map(v => <VisitCard key={v.id} v={v} onResume={onResume} />)}
        </div>
      )}

      <div style={{ marginTop:34, marginBottom:12, display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
        <p className="h-eyebrow" style={{ marginBottom:0 }}>Story feed</p>
      </div>

      {allStories.length === 0 ? (
        <div className="empty-note card card-pad">No stories posted yet.</div>
      ) : (
        <div className="feed-grid">
          {allStories.map((s, i) => (
            <div className="story-card" key={s.visitId || i}>
              <div className="story-photo" style={{ background: s.gradient || photoGradients[i % photoGradients.length] }}>
                <Camera size={28} color="rgba(255,255,255,0.85)" />
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
                  <Heart size={16} fill={s.liked ? "var(--magenta)" : "none"} /> {s.likes || 0}
                </button>
                <button className="story-action"><MessageCircle size={16} /> {s.comments || 0}</button>
                <button className="story-action" style={{ marginLeft:"auto" }}><Share2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
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

/* ============================== VISIT WIZARD ============================== */

const WIZARD_STEPS = ["Register", "Feedback", "Complaints", "Story"];

function OfficeModal({ onClose, onSelect }) {
  const [officeType, setOfficeType] = useState("area");
  const [choice, setChoice] = useState("");

  const changeType = (t) => { setOfficeType(t); setChoice(""); };

  const options = officeType === "area" ? ALL_AREAS.map(areaOfficeName)
    : officeType === "regional" ? ALL_REGIONS.map(regionalOfficeName)
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
              <button className={`seg-btn ${officeType === "regional" ? "active" : ""}`} onClick={() => changeType("regional")}>Regional Office</button>
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

function VisitWizard({ visit, startStep, onUpdate, onDone, onExit, showToast }) {
  const [step, setStep] = useState(startStep ?? nextIncompleteStep(visit.steps));
  const [finished, setFinished] = useState(false);

  const initialLocType = visit.locationType || "branch";
  const initialPath = initialLocType === "branch" ? findBranchPath(visit.location) : null;
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

  // Complaint fields — a visit can carry any number of complaints, each
  // filed either by staff or by a member, all nested under this visit's id.
  const [hasComplaints, setHasComplaints] = useState(visit.complaints && visit.complaints.length > 0 ? true : (visit.steps.complaints ? false : null));
  const [complaintDraft, setComplaintDraft] = useState({
    source: "staff", // "staff" or "member"
    department: "Construction",
    description: "",
    urgency: "Medium",
    consent: null
  });
  const [complaintsList, setComplaintsList] = useState(visit.complaints || []);

  const [caption, setCaption] = useState(visit.story?.caption || "");
  const [photoAdded, setPhotoAdded] = useState(!!visit.story);

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

  const saveFeedback = (skip) => {
    if (skip) { setStep(2); return; }
    onUpdate({
      feedback: {
        staff: { tags: staffTags, rating: staffRating, notes: staffNotes },
        member: { tags: memberTags, rating: memberRating, notes: memberNotes, count: membersConsulted },
        activeType: feedbackType,
      },
      steps: { ...visit.steps, feedback: true },
    });
    setStep(2);
  };

  const addComplaintToList = () => {
    if (!complaintDraft.description.trim()) return;
    setComplaintsList(l => [...l, { ...complaintDraft, id: makeId("FC") }]);
    setComplaintDraft({
      source: "staff",
      department: "Construction",
      description: "",
      urgency: "Medium",
      consent: null
    });
  };

  const saveComplaints = (skip) => {
    if (skip) { setStep(3); return; }
    // Each complaint is enriched with the admin-workflow fields here, once,
    // when it's first attached to the visit — the admin console reads and
    // mutates these same nested objects directly (nothing is duplicated
    // into a separate collection).
    const finalList = hasComplaints ? complaintsList.map(c => ({
      id: c.id,
      source: c.source,
      department: c.department,
      description: c.description,
      urgency: c.urgency,
      consent: c.consent,
      status: c.status || "Open",
      filedBy: visit.employeeName,
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
    setStep(3);
  };

  const saveStory = (skip) => {
    if (skip) { onExit(); return; }
    onUpdate({
      story: { caption, posted: true, likes: visit.story?.likes || 0, comments: visit.story?.comments || 0, gradient: visit.story?.gradient || photoGradients[Math.floor(Math.random() * photoGradients.length)] },
      steps: { ...visit.steps, story: true },
    });
    setFinished(true);
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
                        {Object.keys(LOCATIONS).map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Region</label>
                      <select className="select" value={region} disabled={!division} onChange={e => { setRegion(e.target.value); setArea(""); setLocation(""); }}>
                        <option value="">Select region…</option>
                        {division && Object.keys(LOCATIONS[division]).map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field-row">
                    <div className="field-group">
                      <label className="field-label">Area</label>
                      <select className="select" value={area} disabled={!region} onChange={e => { setArea(e.target.value); setLocation(""); }}>
                        <option value="">Select area…</option>
                        {division && region && Object.keys(LOCATIONS[division][region]).map(a => <option key={a}>{a}</option>)}
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Branch</label>
                      <select className="select" value={location} disabled={!area} onChange={e => setLocation(e.target.value)}>
                        <option value="">Select branch…</option>
                        {division && region && area && LOCATIONS[division][region][area].map(b => <option key={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="loc-office-row">
                    <button className="loc-office-btn" onClick={() => setShowOfficeModal(true)}>
                      <Building2 size={13} /> Visiting an Area/Regional Office or Village Organisation instead?
                    </button>
                  </div>
                </>
              )}

              {showOfficeModal && (
                <OfficeModal
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

              {feedbackType === "staff" && (
                <>
                  <p className="h-eyebrow" style={{ marginBottom:10 }}>Staff feedback</p>
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
                  <div className="field-group">
                    <label className="field-label">Notes</label>
                    <textarea className="textarea" placeholder="Notes from staff…" value={staffNotes} onChange={e => setStaffNotes(e.target.value)} />
                  </div>
                </>
              )}

              {feedbackType === "member" && (
                <>
                  <p className="h-eyebrow" style={{ marginBottom:10 }}>Member (client) feedback</p>
                  <div className="field-group">
                    <label className="field-label">Members consulted</label>
                    <input className="input" type="number" min="0" placeholder="e.g. 12" value={membersConsulted} onChange={e => setMembersConsulted(e.target.value)} />
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
                  <div className="field-group">
                    <label className="field-label">Notes</label>
                    <textarea className="textarea" placeholder="Notes from members…" value={memberNotes} onChange={e => setMemberNotes(e.target.value)} />
                  </div>
                </>
              )}
            </>
          )}

          {step === 2 && (
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
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                          <span className="source-badge">{c.source}</span>
                          <strong style={{ fontSize:13 }}>{c.department}</strong>
                          <span className={`urgency-badge urgency-${c.urgency}`}>{c.urgency}</span>
                        </div>
                        <div style={{ fontSize:12.5, color:"var(--ink-soft)" }}>{c.description}</div>
                        <div style={{ fontSize:11, color:"var(--ink-faint)", marginTop:4 }}>
                          Consent to follow up: {c.consent ? "Yes" : "No"}
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => setComplaintsList(l => l.filter((_, idx) => idx !== i))}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <div className="card card-pad" style={{ background:"var(--paper)" }}>
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

                    <div className="field-row">
                      <div className="field-group" style={{ marginBottom:12 }}>
                        <label className="field-label">Department</label>
                        <select className="select" value={complaintDraft.department} onChange={e => setComplaintDraft(d => ({ ...d, department: e.target.value }))}>
                          {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className="field-group" style={{ marginBottom:12 }}>
                        <label className="field-label">Urgency</label>
                        <div className="seg">
                          {["Low","Medium","High"].map(u => (
                            <button key={u} className={`seg-btn ${complaintDraft.urgency === u ? "active" : ""}`} onClick={() => setComplaintDraft(d => ({ ...d, urgency:u }))}>{u}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="field-group" style={{ marginBottom:12 }}>
                      <label className="field-label">Description</label>
                      <textarea className="textarea" placeholder={`Describe the complaint from ${complaintDraft.source}…`} value={complaintDraft.description} onChange={e => setComplaintDraft(d => ({ ...d, description: e.target.value }))} />
                    </div>
                    <div className="field-group" style={{ marginBottom:14 }}>
                      <label className="field-label">Consent to follow up</label>
                      <div className="toggle-yn">
                        <button className={complaintDraft.consent === true ? "active-yes" : ""} onClick={() => setComplaintDraft(d => ({ ...d, consent:true }))}>Yes</button>
                        <button className={complaintDraft.consent === false ? "active-no" : ""} onClick={() => setComplaintDraft(d => ({ ...d, consent:false }))}>No</button>
                      </div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={addComplaintToList}><Plus size={13} /> Add complaint</button>
                  </div>
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="field-group">
                <label className="field-label">Photo</label>
                <div className="upload-box" onClick={() => setPhotoAdded(true)}>
                  <Camera size={26} style={{ marginBottom:8 }} />
                  <div style={{ fontWeight:650, fontSize:13, color:"var(--ink)" }}>{photoAdded ? "Photo attached ✓" : "Tap to add a photo"}</div>
                  <div style={{ fontSize:11.5, marginTop:2 }}>JPG or PNG, up to 10MB</div>
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Caption / story</label>
                <textarea className="textarea" placeholder="Share a moment from this visit…" value={caption} onChange={e => setCaption(e.target.value)} />
              </div>
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
                if (step === 1) saveFeedback(true);
                else if (step === 2) saveComplaints(true);
                else if (step === 3) saveStory(true);
              }}>Skip for now</button>
            )}
            {step === 0 && (
              <button className="btn btn-primary" onClick={saveRegister} disabled={!location || !durationLabel}>
                Next <ChevronRight size={15} />
              </button>
            )}
            {step === 1 && (
              <button className="btn btn-primary" onClick={() => saveFeedback(false)}>Next <ChevronRight size={15} /></button>
            )}
            {step === 2 && (
              <button className="btn btn-primary" onClick={() => saveComplaints(false)} disabled={hasComplaints === null}>
                Next <ChevronRight size={15} />
              </button>
            )}
            {step === 3 && (
              <button className="btn btn-primary" onClick={() => saveStory(false)}>
                <Send size={14} /> Post to feed
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
