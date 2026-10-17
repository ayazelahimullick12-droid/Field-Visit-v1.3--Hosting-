import React, { useEffect, useState } from "react";
import { Mail, Send, Save } from "lucide-react";
import { api } from "../lib/session";

/* Admin console → Email settings.
   The account the app sends from. Fixers receive action item emails (assignment, deadline
   extended, deadline reminder) at the email address they registered with. The password is
   stored encrypted on the server and never shown again. */

const PRESETS = [
  { label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: 587, secure: false },
  { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 465, secure: true },
];

export default function EmailSettingsTab({ showToast, onSent }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [password, setPassword] = useState("");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/mail/settings").then((s) => { setSaved(s); setForm(s); }).catch((err) => showToast(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!form) return <div className="page"><div className="card card-pad empty-note">Loading…</div></div>;
  const set = (patch) => setForm({ ...form, ...patch });

  const save = async () => {
    setBusy(true);
    try {
      const s = await api("/mail/settings", { method: "PUT", body: { ...form, password: password || undefined } });
      setSaved(s); setForm(s); setPassword("");
      showToast("Email settings saved.");
    } catch (err) { showToast(err.message); } finally { setBusy(false); }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const r = await api("/mail/test", { method: "POST", body: { to: testTo.trim() } });
      showToast(r.message);
    } catch (err) { showToast(err.message); } finally { setBusy(false); onSent?.(); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="h-eyebrow">Configuration</p>
          <h1 className="h-title">Email settings</h1>
          <p className="h-desc">
            The email account the Field Visit Tracker sends from. Fixers get an email at their registered address when an
            action item is assigned to their unit, when its deadline is extended, and before the deadline.
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <p className="field-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Mail size={15} /> Sending account{" "}
          <span className={`pill ${saved?.configured ? "pill-ok" : "pill-stale"}`}>{saved?.configured ? (saved.enabled ? "Set up" : "Switched off") : "Not set up"}</span>
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0 14px" }}>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="filter-chip" onClick={() => set({ host: p.host, port: p.port, secure: p.secure })}>{p.label}</button>
          ))}
        </div>

        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Mail server (SMTP host)</label>
            <input className="input" placeholder="smtp.office365.com" value={form.host} onChange={(e) => set({ host: e.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label">Port</label>
            <input className="input" inputMode="numeric" value={form.port} onChange={(e) => set({ port: e.target.value })} />
            <p className="field-hint">587 with STARTTLS (most common) or 465 with SSL.</p>
          </div>
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Username</label>
            <input className="input" autoComplete="off" placeholder="fieldvisit@brac.net" value={form.user} onChange={(e) => set({ user: e.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label">Password {saved?.hasPassword && <span style={{ fontWeight: 500, color: "var(--ink-faint)" }}>(saved — leave blank to keep it)</span>}</label>
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="field-hint">For Gmail or Microsoft 365 with two-step sign-in, use an app password.</p>
          </div>
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Send from (email address)</label>
            <input className="input" type="email" placeholder="fieldvisit@brac.net" value={form.fromEmail} onChange={(e) => set({ fromEmail: e.target.value })} />
            <p className="field-hint">Usually the same as the username.</p>
          </div>
          <div className="field-group">
            <label className="field-label">Sender name</label>
            <input className="input" value={form.fromName} onChange={(e) => set({ fromName: e.target.value })} />
          </div>
        </div>
        <div className="checkbox-row" style={{ marginBottom: 16 }}>
          <label><input type="checkbox" checked={!!form.secure} onChange={(e) => set({ secure: e.target.checked })} /> Use SSL from the start (port 465)</label>
          <label><input type="checkbox" checked={!!form.allowInvalidCert} onChange={(e) => set({ allowInvalidCert: e.target.checked })} /> Accept the mail server's own (internal) certificate</label>
          <label><input type="checkbox" checked={form.enabled !== false} onChange={(e) => set({ enabled: e.target.checked })} /> Send emails</label>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={busy}><Save size={14} /> Save settings</button>
      </div>

      <div className="card card-pad">
        <p className="field-label">Send a test email</p>
        <p className="field-hint" style={{ marginTop: 0 }}>Save first, then send a test to your own address to check everything works.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input className="input" type="email" placeholder="you@brac.net" style={{ flex: "1 1 240px" }} value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <button className="btn btn-secondary" onClick={sendTest} disabled={busy || !saved?.configured}><Send size={14} /> Send test</button>
        </div>
      </div>
    </div>
  );
}
