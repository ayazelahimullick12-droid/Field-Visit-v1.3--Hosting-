import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RefreshCw, Map as MapIcon, MapPin, ListChecks, GitMerge, Copy, CloudDownload, Undo2, X, BedDouble } from "lucide-react";
import { api } from "../lib/session";
import { DEFAULT_PURPOSES, BLCS } from "../lib/visits";

/* Admin console → Locations & lists.
   Division → Region → Area → Branch all come from BRAC's branch API: the server downloads it every
   night (and on "Sync now") and rebuilds the lists, all programmes together. Nothing here edits a
   location by hand. The admin can:
     - merge two spellings of one region or area (look-alike spellings), or say they are different;
     - list the branch IDs that two different offices share (the second shows as "<ID>.1");
     - see what each sync did, and what it left out.
   Also the "Purpose of visit" choices on the visit form. */

const SECTIONS = [
  { key: "sync", label: "Sync", icon: CloudDownload },
  { key: "spellings", label: "Look-alike spellings", icon: GitMerge },
  { key: "shared", label: "Shared branch IDs", icon: Copy },
  { key: "regions", label: "Regions", icon: MapIcon },
  { key: "areas", label: "Areas", icon: MapPin },
  { key: "purposes", label: "Purposes of visit", icon: ListChecks },
  { key: "blcs", label: "BRAC Learning Centres", icon: BedDouble },
];

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");
const STATUS_PILL = { ok: "pill-ok", running: "pill-info", refused: "pill-stale", failed: "pill-never" };
const TRIGGER = { nightly: "Nightly", manual: "Sync now", file: "From a file", rules: "After a rule change" };

export default function LocationsTab({ structure, offices, onLocationsChanged, settings, setSettings, showToast }) {
  const [section, setSection] = useState("sync");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const s = { divisions: [], regions: [], areas: [], regionalOffices: [], areaOffices: [], ...(structure || {}) };

  const load = () => api("/locations/status").then(setStatus).catch((e) => showToast(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const report = status?.lastOk?.report || null;
  const rules = status?.rules || { aliases: [], splits: [], dismissed: [] };

  /** Runs a sync or saves rules (both rebuild the locations), then re-reads everything. */
  const act = async (fn, done) => {
    setBusy(true);
    try {
      setStatus(await fn());
      await onLocationsChanged();
      showToast(done);
    } catch (e) {
      showToast(e.message);
      load();
    } finally {
      setBusy(false);
    }
  };
  const syncNow = () => act(() => api("/locations/sync", { method: "POST" }), "Synced with the branch API.");
  const saveRules = (patch, done) => act(() => api("/locations/rules", { method: "PUT", body: { ...rules, ...patch } }), done);

  const counts = {
    sync: null,
    spellings: report?.suggestions?.length ?? 0,
    shared: rules.splits.length,
    regions: s.regions.length,
    areas: s.areas.length,
    purposes: (settings?.visitPurposes?.length ? settings.visitPurposes : DEFAULT_PURPOSES).length + 1,
    blcs: (settings?.blcs?.length ? settings.blcs : BLCS).length,
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="h-eyebrow">Configuration</p>
          <h1 className="h-title">Locations & lists</h1>
          <p className="h-desc">
            Divisions, regions, areas and offices come from <b>BRAC's branch API</b>, all programmes together: every night at 2 a.m., or
            when you press <b>Sync now</b>. They can't be edited here. A branch sits in every area its programmes put it in.
          </p>
        </div>
      </div>

      <div className="filter-chips" style={{ marginBottom: 16 }}>
        {SECTIONS.map((x) => (
          <button key={x.key} className={`filter-chip ${section === x.key ? "active" : ""}`} onClick={() => setSection(x.key)}>
            <x.icon size={13} /> {x.label} {counts[x.key] != null && <span className="badge-count">{counts[x.key]}</span>}
          </button>
        ))}
      </div>

      {section === "sync" && <SyncPanel status={status} report={report} busy={busy} onSync={syncNow} s={s} offices={offices} />}
      {section === "spellings" && <SpellingsPanel report={report} rules={rules} busy={busy} onSave={saveRules} />}
      {section === "shared" && <SharedIdsPanel rules={rules} offices={offices} busy={busy} onSave={saveRules} />}
      {section === "regions" && (
        <ReadOnlyList title="Regions" hint="Each region is shown once per division, holding the areas of every programme that uses the name."
          rows={s.regions} columns={[{ label: "Division", get: (r) => r.division }, { label: "Areas", get: (r) => s.areas.filter((a) => a.regionId === r.id).length }]} />
      )}
      {section === "areas" && (
        <ReadOnlyList title="Areas" hint="Each area is shown once per region, holding the branches of every programme that uses the name."
          rows={s.areas} columns={[{ label: "Region", get: (a) => a.region }, { label: "Division", get: (a) => a.division }]} />
      )}
      {section === "purposes" && (
        <ListSettingEditor settings={settings} setSettings={setSettings} showToast={showToast} settingKey="visitPurposes" defaults={DEFAULT_PURPOSES}
          title="Purposes of visit" what="purpose" placeholder="New purpose, e.g. Audit" reserved={["other"]}
          desc={<>The choices on the visit form, in this order. <b>Other</b> is always offered last, and asks the person to type the reason. Removing a purpose doesn't change visits that already use it.</>}
          lastRow="Other (type the reason)" />
      )}
      {section === "blcs" && (
        <ListSettingEditor settings={settings} setSettings={setSettings} showToast={showToast} settingKey="blcs" defaults={BLCS}
          title="BRAC Learning Centres" what="BLC" placeholder="New BLC, e.g. BLC Bogura"
          desc={<>The BLCs staff can pick when they add accommodation to a visit, in this order. <b>Other BLC</b> is always offered last, so staff can type one that isn't listed. Removing a BLC doesn't change visits that already name it.</>}
          lastRow="Other BLC (type the name)" />
      )}
    </div>
  );
}

/* ---------- the last sync, Sync now, and what was left out ---------- */

function SyncPanel({ status, report, busy, onSync, s, offices }) {
  if (!status) return <div className="card card-pad"><p className="analytics-card-sub" style={{ margin: 0 }}>Loading…</p></div>;
  const last = status.runs?.[0];
  const sk = report?.skipped;
  const leftOutDivisions = sk ? Object.entries(sk.divisions || {}) : [];
  const branches = offices.filter((o) => o.active !== false).length;
  return (
    <>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <p className="analytics-card-title" style={{ marginBottom: 2 }}>Branch API</p>
            <p className="analytics-card-sub" style={{ margin: 0 }}>
              {status.apiConfigured
                ? <>Last successful sync: <b>{when(status.lastOk?.finishedAt)}</b>{status.lastOk ? ` · ${status.lastOk.message}` : ""}</>
                : <>Not set up yet: the server needs the variables <b>BRANCH_API_URL</b> and <b>BRANCH_API_TOKEN</b>.{status.lastOk ? ` Lists last loaded ${when(status.lastOk.finishedAt)}.` : ""}</>}
            </p>
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy || !status.apiConfigured || status.running} onClick={onSync}>
            <RefreshCw size={14} className={busy ? "spin" : undefined} /> {busy ? "Working…" : "Sync now"}
          </button>
        </div>
        {last && last.status !== "ok" && (
          <div className="form-error" role="alert" style={{ marginTop: 12 }}>
            {TRIGGER[last.trigger] || last.trigger} on {when(last.startedAt)}: {last.status === "refused" ? "refused" : last.status} — {last.message}
          </div>
        )}
        <div className="kpi-grid" style={{ marginTop: 14 }}>
          {[["Divisions", s.divisions.length], ["Regions", s.regions.length], ["Areas", s.areas.length], ["Branch offices", branches],
            ["Regional + area offices", s.regionalOffices.length + s.areaOffices.length]].map(([label, n]) => (
            <div key={label} className="kpi"><div className="kpi-num">{n.toLocaleString()}</div><div className="kpi-label">{label}</div></div>
          ))}
        </div>
      </div>

      {report && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <p className="analytics-card-title" style={{ marginBottom: 2 }}>What the last sync used</p>
          <p className="analytics-card-sub">
            {report.apiRows?.toLocaleString()} rows from the API (one per branch per programme), {report.usedRows?.toLocaleString()} used.
            Programmes: {(report.programmes || []).join(", ")}.
          </p>
          <ul className="place-list">
            <li>Left out, no programme (old copies of rows that are listed again with a programme): {sk.noProgramme}</li>
            <li>Left out, test records: {sk.test.length}{sk.test.length ? ` — ${sk.test.join(", ")}` : ""}</li>
            <li>Left out, offices that aren't branches (regional, market and head offices): {sk.notBranch.length}</li>
            {leftOutDivisions.length > 0 && <li>Left out, divisions without branch offices: {leftOutDivisions.map(([d, n]) => `${d} (${n})`).join(", ")}</li>}
            {(report.splitBranches || []).length > 0 && <li>Branch IDs shared by two offices: {report.splitBranches.join(", ")}</li>}
            {(report.codedNames || []).length > 0 && <li>Branches shown with their code, because another branch in the region has the same name: {report.codedNames.length}</li>}
          </ul>
          {sk.notBranch.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary className="field-hint" style={{ cursor: "pointer" }}>Show the offices left out</summary>
              <p className="field-hint">{sk.notBranch.join(" · ")}</p>
            </details>
          )}
        </div>
      )}

      <div className="card card-pad">
        <p className="analytics-card-title" style={{ marginBottom: 2 }}>Recent syncs</p>
        <p className="analytics-card-sub">A sync that would remove many offices at once, or that doesn't add up to the API's own total, is refused and changes nothing.</p>
        {(status.runs || []).length === 0 ? <div className="empty-state">No syncs yet.</div> : (
          <div className="ctable-wrap">
            <table className="ctable stack">
              <thead><tr><th>When</th><th>How</th><th>Result</th><th>Details</th></tr></thead>
              <tbody>
                {status.runs.map((r) => (
                  <tr key={r.id}>
                    <td data-label="When">{when(r.startedAt)}</td>
                    <td data-label="How">{TRIGGER[r.trigger] || r.trigger}</td>
                    <td data-label="Result"><span className={`pill ${STATUS_PILL[r.status] || "pill-brand"}`}>{r.status}</span></td>
                    <td data-label="Details"><span className="cell-sub">{r.message || "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- look-alike spellings: merge, or say they're different ---------- */

const where = (x) => [x.division, x.region].filter(Boolean).join(" › ");

function SpellingsPanel({ report, rules, busy, onSave }) {
  const open = report?.suggestions || [];
  const merge = (x, keep, fold) => onSave(
    { aliases: [...rules.aliases, { level: x.level, division: x.division, region: x.region || "", from: fold, to: keep }] },
    `"${fold}" is now part of "${keep}".`,
  );
  const dismiss = (x) => onSave({ dismissed: [...rules.dismissed, x.key] }, `Kept "${x.a}" and "${x.b}" apart.`);
  const undo = (a) => onSave({ aliases: rules.aliases.filter((y) => y !== a) }, `"${a.from}" is separate again.`);
  return (
    <>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <p className="analytics-card-title" style={{ marginBottom: 2 }}>Look-alike spellings</p>
        <p className="analytics-card-sub">
          Programmes sometimes spell one place differently, and each spelling then shows as its own region or area. Merge the ones that are
          the same place (choose the spelling to keep), and mark the rest as different so they stop showing here.
        </p>
        {open.length === 0 ? <div className="empty-state">Nothing to check.</div> : (
          <div className="ctable-wrap">
            <table className="ctable stack">
              <thead><tr><th>Spellings</th><th>Where</th><th style={{ textAlign: "right" }}>Action</th></tr></thead>
              <tbody>
                {open.map((x) => (
                  <tr key={x.key}>
                    <td data-label="Spellings"><div className="cell-main">{x.a} · {x.b}</div><div className="cell-sub">{x.level === "region" ? "Regions" : "Areas"}</div></td>
                    <td data-label="Where">{where(x)}</td>
                    <td data-label="" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => merge(x, x.a, x.b)}><GitMerge size={12} /> Keep "{x.a}"</button>
                      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => merge(x, x.b, x.a)}><GitMerge size={12} /> Keep "{x.b}"</button>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => dismiss(x)}><X size={12} /> Different places</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-pad">
        <p className="analytics-card-title" style={{ marginBottom: 2 }}>Merged spellings</p>
        <p className="analytics-card-sub">Each one folds a spelling into another. Undo to show them separately again.</p>
        {rules.aliases.length === 0 ? <div className="empty-state">None yet.</div> : (
          <div className="ctable-wrap">
            <table className="ctable stack">
              <tbody>
                {rules.aliases.map((a) => (
                  <tr key={`${a.level}|${a.division}|${a.region}|${a.from}`}>
                    <td data-label="Merged"><div className="cell-main">{a.from} → {a.to}</div><div className="cell-sub">{a.level === "region" ? "Region" : "Area"} · {where(a)}</div></td>
                    <td data-label="" style={{ textAlign: "right" }}><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => undo(a)}><Undo2 size={12} /> Undo</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- branch IDs that two different offices share ---------- */

function SharedIdsPanel({ rules, offices, busy, onSave }) {
  const [text, setText] = useState("");
  const add = () => {
    const id = text.trim();
    if (!/^\d+$/.test(id)) return;
    if (!rules.splits.includes(id)) onSave({ splits: [...rules.splits, id] }, `Branch ID ${id} is now treated as two offices where the names differ.`);
    setText("");
  };
  const officesOf = (id) => offices.filter((o) => o.code === id || String(o.code || "").startsWith(`${id}.`));
  return (
    <div className="card card-pad">
      <p className="analytics-card-title" style={{ marginBottom: 2 }}>Shared branch IDs</p>
      <p className="analytics-card-sub">
        A branch ID listed here is used by two different offices (the programmes give it different names). Each name becomes its own
        branch: the first programme's keeps the ID, the next gets the ID with ".1" added (2853.1). Other IDs are always one branch, whatever the names.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "8px 0 14px" }}>
        <input className="input" style={{ flex: "1 1 200px" }} inputMode="numeric" placeholder="Branch ID, e.g. 2853" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-primary" disabled={busy} onClick={add}><Plus size={14} /> Add</button>
      </div>
      {rules.splits.length === 0 ? <div className="empty-state">None.</div> : (
        <div className="ctable-wrap">
          <table className="ctable stack">
            <tbody>
              {rules.splits.map((id) => (
                <tr key={id}>
                  <td data-label="Branch ID"><div className="cell-main mono">{id}</div></td>
                  <td data-label="Offices">{officesOf(id).map((o) => `${o.name} (${o.code})`).join(" · ") || <span className="cell-sub">not in the API</span>}</td>
                  <td data-label="" style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onSave({ splits: rules.splits.filter((x) => x !== id) }, `Branch ID ${id} is one office again.`)}><Trash2 size={12} /> Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- regions and areas, read-only ---------- */

const PAGE = 50;

function ReadOnlyList({ title, hint, rows, columns }) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => !q || `${r.name} ${columns.map((c) => c.get(r)).join(" ")}`.toLowerCase().includes(q));
  }, [rows, columns, query]);
  return (
    <div className="card card-pad">
      <p className="analytics-card-title" style={{ marginBottom: 2 }}>{title}</p>
      <p className="analytics-card-sub">{hint}</p>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <div className="search-box"><input className="input" placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={(e) => { setQuery(e.target.value); setShowAll(false); }} /></div>
      </div>
      {shown.length === 0 ? <div className="empty-state">No {title.toLowerCase()} found.</div> : (
        <div className="ctable-wrap">
          <table className="ctable stack">
            <thead><tr><th>Name</th>{columns.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
            <tbody>
              {(showAll ? shown : shown.slice(0, PAGE)).map((r) => (
                <tr key={r.id}>
                  <td data-label="Name"><div className="cell-main">{r.name}</div></td>
                  {columns.map((c) => <td key={c.label} data-label={c.label}>{c.get(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shown.length > PAGE && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAll((x) => !x)}>{showAll ? "Show fewer" : `Show all ${shown.length}`}</button>
        </div>
      )}
    </div>
  );
}

/* ---------- a list the admin keeps in the app settings (purposes of visit, BLCs) ---------- */

function ListSettingEditor({ settings, setSettings, showToast, settingKey, defaults, title, what, placeholder, desc, lastRow, reserved = [] }) {
  const saved = settings?.[settingKey]?.length ? settings[settingKey] : defaults;
  const [list, setList] = useState(saved);
  const [text, setText] = useState("");
  useEffect(() => { setList(saved); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [settings?.[settingKey]]);

  const persist = (next, msg) => { setList(next); setSettings({ ...(settings || {}), [settingKey]: next }); showToast(msg); };
  const add = () => {
    const p = text.trim();
    if (!p) return;
    if (reserved.includes(p.toLowerCase()) || list.some((x) => x.toLowerCase() === p.toLowerCase())) { showToast(`"${p}" is already on the list.`); return; }
    persist([...list, p], `"${p}" added.`);
    setText("");
  };
  const move = (i, d) => { const next = [...list]; [next[i], next[i + d]] = [next[i + d], next[i]]; persist(next, "Order saved."); };

  return (
    <div className="card card-pad">
      <p className="analytics-card-title" style={{ marginBottom: 2 }}>{title}</p>
      <p className="analytics-card-sub">{desc}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "8px 0 14px" }}>
        <input className="input" style={{ flex: "1 1 240px" }} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} maxLength={60} />
        <button className="btn btn-primary" onClick={add}><Plus size={14} /> Add {what}</button>
      </div>
      <div className="ctable-wrap">
        <table className="ctable stack">
          <tbody>
            {list.map((p, i) => (
              <tr key={p}>
                <td data-label={what}><div className="cell-main">{p}</div></td>
                <td data-label="" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${p} up`}>↑</button>
                  <button className="btn btn-ghost btn-sm" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${p} down`}>↓</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} disabled={list.length === 1} onClick={() => persist(list.filter((x) => x !== p), `"${p}" removed.`)}><Trash2 size={12} /> Remove</button>
                </td>
              </tr>
            ))}
            <tr><td data-label={what}><div className="cell-main" style={{ color: "var(--ink-faint)" }}>{lastRow}</div></td><td data-label="" style={{ textAlign: "right" }}><span className="field-hint">always shown</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
