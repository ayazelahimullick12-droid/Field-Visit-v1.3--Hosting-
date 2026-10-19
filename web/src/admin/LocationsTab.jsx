import React, { useEffect, useMemo, useState } from "react";
import { Plus, Edit3, Trash2, Power, Check, X, MapPin, Building2, Map as MapIcon, ListChecks, Layers, Lock, RefreshCw, CloudDownload } from "lucide-react";
import { api } from "../lib/session";
import { makeId } from "../lib/ids";
import { DEFAULT_PURPOSES } from "../lib/visits";

/* Admin console → Locations & lists.
   Division → Region → Area → Branch, BRAC's own structure:
     - Most of it comes from BRAC's ERP branch list (the card at the top; synced every night). Those
       rows show "From ERP" and can't be edited here; the sync keeps them up to date.
     - The admin can add more Divisions, Regions, Areas, Regional Offices and Area Offices by hand.
     - Branch Offices are on the Branch offices tab (each placed in an Area).
   Also the "Purpose of visit" choices on the visit form.
   Everything here is saved with one PUT /api/structure (or /api/settings for purposes). */

const SECTIONS = [
  { key: "divisions", label: "Divisions", icon: Layers },
  { key: "regions", label: "Regions", icon: MapIcon },
  { key: "areas", label: "Areas", icon: MapPin },
  { key: "regionalOffices", label: "Regional Offices", icon: Building2 },
  { key: "areaOffices", label: "Area Offices", icon: Building2 },
  { key: "purposes", label: "Purposes of visit", icon: ListChecks },
];

export default function LocationsTab({ structure, onSaveStructure, onSynced, offices, settings, setSettings, showToast }) {
  const [section, setSection] = useState("divisions");
  const s = { divisions: [], divisionList: [], regions: [], areas: [], regionalOffices: [], areaOffices: [], ...(structure || {}) };

  /** Saves the four lists (the server checks names and renames offices / past visits to match). */
  const save = async (patch, message) => {
    try {
      await onSaveStructure({ ...s, ...patch });
      showToast(message);
    } catch (err) {
      showToast(err.message);
    }
  };

  const counts = {
    divisions: s.divisionList.length, regions: s.regions.length, areas: s.areas.length, regionalOffices: s.regionalOffices.length, areaOffices: s.areaOffices.length,
    purposes: (settings?.visitPurposes?.length ? settings.visitPurposes : DEFAULT_PURPOSES).length + 1,
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="h-eyebrow">Configuration</p>
          <h1 className="h-title">Locations & lists</h1>
          <p className="h-desc">
            Division → Region → Area → Branch. Most of it comes from BRAC's ERP branch list below; you can add more by hand.
            Branch Offices are on the <b>Branch offices</b> tab. Everything here appears on the visit form straight away.
          </p>
        </div>
      </div>

      <BranchSyncCard showToast={showToast} onSynced={onSynced} />

      <div className="filter-chips" style={{ marginBottom: 16 }}>
        {SECTIONS.map((x) => (
          <button key={x.key} className={`filter-chip ${section === x.key ? "active" : ""}`} onClick={() => setSection(x.key)}>
            <x.icon size={13} /> {x.label} <span className="badge-count">{counts[x.key]}</span>
          </button>
        ))}
      </div>

      {section === "divisions" && (
        <ListEditor
          title="Divisions" what="division" rows={s.divisionList}
          hint="BRAC's divisions, the top of Division → Region → Area → Branch."
          columns={[]}
          usage={(d) => s.regions.filter((r) => r.division === d.name).length}
          usageText="It has regions: switch it off instead."
          onSave={(rows, msg) => save({ divisionList: rows }, msg)}
        />
      )}

      {section === "regions" && (
        <ListEditor
          title="Regions" what="region" rows={s.regions}
          hint="Each region belongs to one Division."
          columns={[{ key: "division", label: "Division", options: () => s.divisions }]}
          usage={(r) => s.areas.filter((a) => a.regionId === r.id).length + s.areaOffices.filter((o) => o.region === r.name).length + offices.filter((o) => o.district === r.name).length}
          usageText="It has areas, area offices or branches: switch it off instead."
          onSave={(rows, msg) => save({ regions: rows }, msg)}
        />
      )}

      {section === "areas" && (
        <ListEditor
          title="Areas" what="area" rows={s.areas.map((a) => ({ ...a, regionLabel: a.region }))}
          hint="Each area belongs to one Region (and so to that region's Division)."
          columns={[{ key: "regionId", label: "Region", options: () => s.regions.map((r) => ({ value: r.id, label: `${r.name} · ${r.division.replace(/ Division$/, "")}` })) }]}
          usage={(a) => offices.filter((o) => o.district === a.region && o.area === a.name).length}
          usageText="It has branch offices: switch it off instead."
          onSave={(rows, msg) => save({ areas: rows.map(({ regionLabel, ...a }) => a) }, msg)}
        />
      )}

      {section === "regionalOffices" && (
        <ListEditor
          title="Regional Offices" what="regional office" rows={s.regionalOffices}
          hint="A Regional Office is placed in a Division. Staff see the Regional Offices of the visit's division."
          columns={[{ key: "division", label: "Division", options: () => s.divisions }]}
          onSave={(rows, msg) => save({ regionalOffices: rows }, msg)}
        />
      )}

      {section === "areaOffices" && (
        <ListEditor
          title="Area Offices" what="area office" rows={s.areaOffices}
          hint="An Area Office is placed in a Region (and so its Division). Staff see the Area Offices of the visit's region."
          columns={[{ key: "region", label: "Region", options: () => s.regions.map((r) => ({ value: r.name, label: `${r.name} · ${r.division.replace(/ Division$/, "")}` })) }]}
          onSave={(rows, msg) => save({ areaOffices: rows }, msg)}
        />
      )}

      {section === "purposes" && <PurposesEditor settings={settings} setSettings={setSettings} showToast={showToast} />}
    </div>
  );
}

/* ---------- one list (name + where it sits), with add / edit / switch off / delete ---------- */

function ListEditor({ title, what, rows, hint, columns, usage, usageText, onSave }) {
  const empty = () => Object.fromEntries([["name", ""], ...columns.map((c) => [c.key, ""])]);
  const [form, setForm] = useState(null); // null | { id?, name, ...columns }
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sureId, setSureId] = useState(null);
  const [limit, setLimit] = useState(50); // long lists (synced areas run into the thousands) show 50 at a time
  const opts = (c) => c.options().map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const labelOf = (c, v) => opts(c).find((o) => o.value === v)?.label || v || "—";

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => !q || `${r.name} ${columns.map((c) => labelOf(c, r[c.key])).join(" ")}`.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query]);

  const submit = () => {
    const name = form.name.trim();
    if (!name) return setError(`Give the ${what} a name.`);
    for (const c of columns) if (!form[c.key]) return setError(`Choose the ${c.label.toLowerCase()}.`);
    // division and region names are unique everywhere; other names only within their place
    const everywhere = what === "region" || what === "division";
    const scope = columns[0]?.key;
    if (rows.some((r) => r.id !== form.id && r.name.toLowerCase() === name.toLowerCase() && (everywhere || r[scope] === form[scope])))
      return setError(`There is already a ${what} called "${name}"${everywhere ? "" : " there"}.`);
    const row = { ...form, name };
    const prefix = { division: "DIV", region: "RGN", area: "AREA" }[what] || "OFF";
    const next = form.id ? rows.map((r) => (r.id === form.id ? { ...r, ...row } : r)) : [...rows, { id: makeId(prefix), active: true, source: "admin", ...row }];
    onSave(next, `${name} ${form.id ? "saved" : "added"}.`);
    setForm(null);
  };

  const toggle = (r) => onSave(rows.map((x) => (x.id === r.id ? { ...x, active: x.active === false } : x)), `${r.name} ${r.active === false ? "switched on" : "switched off — it no longer shows on the visit form"}.`);
  const remove = (r) => {
    if (sureId !== r.id) { setSureId(r.id); return; }
    setSureId(null);
    onSave(rows.filter((x) => x.id !== r.id), `${r.name} deleted.`);
  };

  return (
    <div className="card card-pad">
      <div className="section-header">
        <div>
          <p className="analytics-card-title" style={{ marginBottom: 2 }}>{title}</p>
          <p className="analytics-card-sub" style={{ margin: 0 }}>{hint}</p>
        </div>
        {!form && <button className="btn btn-primary btn-sm" onClick={() => { setForm(empty()); setError(""); }}><Plus size={14} /> Add {what}</button>}
      </div>

      {form && (
        <div className="card card-pad page-enter" style={{ margin: "12px 0 16px", background: "var(--paper, transparent)" }}>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Name</label>
              <input className="input" autoFocus value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} />
            </div>
            {columns.map((c) => (
              <div className="field-group" key={c.key}>
                <label className="field-label">{c.label}</label>
                <select className="select" value={form[c.key]} onChange={(e) => { setForm({ ...form, [c.key]: e.target.value }); setError(""); }}>
                  <option value="">Select {c.label.toLowerCase()}…</option>
                  {opts(c).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          {form.id && <p className="field-hint" style={{ marginTop: -4 }}>Renaming or moving it also updates its offices and past visits.</p>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={submit}><Check size={14} /> {form.id ? "Save" : `Add ${what}`}</button>
            <button className="btn btn-ghost" onClick={() => setForm(null)}><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <div className="search-box"><input className="input" placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      </div>

      {shown.length === 0 ? <div className="empty-state">No {title.toLowerCase()} yet.</div> : (<>
        <div className="ctable-wrap">
          <table className="ctable stack">
            <thead><tr><th>Name</th>{columns.map((c) => <th key={c.key}>{c.label}</th>)}<th>Status</th><th style={{ textAlign: "right" }}>Action</th></tr></thead>
            <tbody>
              {shown.slice(0, limit).map((r) => {
                const used = usage ? usage(r) : 0;
                const erp = r.source === "erp";
                return (
                  <tr key={r.id} style={r.active === false ? { opacity: 0.6 } : undefined}>
                    <td data-label="Name"><div className="cell-main">{r.name}</div>{erp && <div className="cell-sub">From ERP{r.erpCode ? ` · ${r.erpCode}` : ""}</div>}</td>
                    {columns.map((c) => <td key={c.key} data-label={c.label}>{labelOf(c, r[c.key])}</td>)}
                    <td data-label="Status">{r.active !== false ? <span className="pill pill-ok">On</span> : erp ? <span className="pill pill-stale" title="The ERP no longer lists it. Kept for past visits; hidden from the visit form.">No longer in ERP</span> : <span className="pill pill-stale">Off</span>}</td>
                    <td data-label="" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {erp ? <span className="field-hint" title="Synced from BRAC's ERP. Change it in the ERP; the next sync brings it here."><Lock size={12} style={{ verticalAlign: -2 }} /> Synced</span> : <>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setForm({ id: r.id, name: r.name, ...Object.fromEntries(columns.map((c) => [c.key, r[c.key] || ""])) }); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Edit3 size={12} /> Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggle(r)}><Power size={12} /> {r.active === false ? "Switch on" : "Switch off"}</button>
                      {used === 0 ? (
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => remove(r)}><Trash2 size={12} /> {sureId === r.id ? "Tap again" : "Delete"}</button>
                      ) : <span className="field-hint" title={usageText} style={{ marginLeft: 6 }}>in use</span>}
                      </>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown.length > limit && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setLimit((n) => n + 200)}>Show more ({shown.length - limit} left)</button>
          </div>
        )}
      </>)}
    </div>
  );
}

/* ---------- BRAC's ERP branch list: last sync and "Sync now" ---------- */

function BranchSyncCard({ showToast, onSynced }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/branch-sync").then(setInfo).catch(() => {}); }, []);

  const run = async () => {
    setBusy(true);
    try {
      const r = await api("/branch-sync/run", { method: "POST" });
      setInfo(r);
      showToast(r.last?.message || "Sync finished.");
      if (r.last?.ok) await onSynced?.();
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const last = info?.last;
  const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never");
  const c = last?.counts;
  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="section-header" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <p className="analytics-card-title" style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}><CloudDownload size={16} /> BRAC branch list (ERP)</p>
          <p className="analytics-card-sub" style={{ margin: 0, overflowWrap: "anywhere" }}>
            {info ? <>{info.source} · {info.schedule}{info.tokenSet ? "" : " · "}{!info.tokenSet && <b style={{ color: "var(--danger)" }}>token not set on the server</b>}</> : "Loading…"}
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={busy || !info?.tokenSet}><RefreshCw size={14} className={busy ? "spin" : ""} /> {busy ? "Syncing… (about a minute)" : "Sync now"}</button>
      </div>
      {last && (
        <p className="field-hint" style={{ margin: "10px 0 0", color: last.ok ? undefined : "var(--danger)" }}>
          {last.ok ? "Last sync" : "Last try"} {when(last.finishedAt || last.startedAt)}: {last.message}
          {last.ok && c && <> · {c.added} added, {c.updated} updated, {c.switchedOff} no longer in the ERP{c.switchedOn ? `, ${c.switchedOn} back again` : ""}</>}
          {!last.ok && last.lastSuccessAt && <> Last good sync: {when(last.lastSuccessAt)}.</>}
        </p>
      )}
      {!last && info && <p className="field-hint" style={{ margin: "10px 0 0" }}>Not synced yet.</p>}
    </div>
  );
}

/* ---------- Purpose of visit choices ---------- */

function PurposesEditor({ settings, setSettings, showToast }) {
  const saved = settings?.visitPurposes?.length ? settings.visitPurposes : DEFAULT_PURPOSES;
  const [list, setList] = useState(saved);
  const [text, setText] = useState("");
  useEffect(() => { setList(saved); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [settings?.visitPurposes]);

  const persist = (next, msg) => { setList(next); setSettings({ ...(settings || {}), visitPurposes: next }); showToast(msg); };
  const add = () => {
    const p = text.trim();
    if (!p) return;
    if (p.toLowerCase() === "other" || list.some((x) => x.toLowerCase() === p.toLowerCase())) { showToast(`"${p}" is already on the list.`); return; }
    persist([...list, p], `"${p}" added.`);
    setText("");
  };
  const move = (i, d) => { const next = [...list]; [next[i], next[i + d]] = [next[i + d], next[i]]; persist(next, "Order saved."); };

  return (
    <div className="card card-pad">
      <p className="analytics-card-title" style={{ marginBottom: 2 }}>Purposes of visit</p>
      <p className="analytics-card-sub">The choices on the visit form, in this order. <b>Other</b> is always offered last, and asks the person to type the reason. Removing a purpose doesn't change visits that already use it.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "8px 0 14px" }}>
        <input className="input" style={{ flex: "1 1 240px" }} placeholder="New purpose, e.g. Audit" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} maxLength={60} />
        <button className="btn btn-primary" onClick={add}><Plus size={14} /> Add purpose</button>
      </div>
      <div className="ctable-wrap">
        <table className="ctable stack">
          <tbody>
            {list.map((p, i) => (
              <tr key={p}>
                <td data-label="Purpose"><div className="cell-main">{p}</div></td>
                <td data-label="" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${p} up`}>↑</button>
                  <button className="btn btn-ghost btn-sm" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${p} down`}>↓</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} disabled={list.length === 1} onClick={() => persist(list.filter((x) => x !== p), `"${p}" removed.`)}><Trash2 size={12} /> Remove</button>
                </td>
              </tr>
            ))}
            <tr><td data-label="Purpose"><div className="cell-main" style={{ color: "var(--ink-faint)" }}>Other (type the reason)</div></td><td data-label="" style={{ textAlign: "right" }}><span className="field-hint">always shown</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
