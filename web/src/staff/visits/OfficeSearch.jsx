import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, X, ArrowUp, ArrowDown, Building2, Users, Info, Undo2, ChevronLeft, ClipboardList, MapPinOff } from "lucide-react";
import { getOfficeList } from "../../lib/offices";
import { voName, placeKey, placeOfStop, isoDate } from "../../lib/visits";
import { useNarrow, ph } from "../../lib/ui";

/* Where a visit goes: offices picked one by one by searching, like the stops of a trip.
   No Division › Region › Area to choose first: the office list knows where each office is.
     - Search by name or BRAC branch code; spelling-tolerant ("beani" finds Bianibazar).
     - The type list (Any office / Branch / Area / Regional) narrows the search; "Any" is the default.
     - Paste several codes or names at once ("8772, 2331, 1917") to add them all.
     - A name shared by several offices is shown with its code and area, so the right one is picked.
     - Enter adds the highlighted office and keeps the search open for the next stop.
   On a phone the search opens full screen. It works offline from the office list kept on the phone. */

export const KIND_LABEL = { any: "Any office", branch: "Branch office", area: "Area office", region: "Regional office" };
const KIND_SHORT = { branch: "Branch", area: "Area office", region: "Regional office" };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// a spelling-tolerant key: no vowels, no doubled letters ("Beanibazar" and "Bianibazar" → "bnbzr")
const skel = (s) => norm(s).replace(/[aeiouy]/g, "").replace(/(.)\1+/g, "$1");
const where = (p) => [p.area, p.region, p.division].filter(Boolean).join(" · ");

/** The office list with search keys, built once per list. */
let indexCache = { from: null, index: [] };
function officeIndex() {
  const list = getOfficeList();
  if (indexCache.from === list) return indexCache.index;
  // loose keys start at each word ("Charkai/Bianibazar" → "chrkbnbzr", "bnbzr"), so a loose match begins a word
  const wordSkels = (name) => { const w = String(name).split(/[^A-Za-z0-9]+/).filter(Boolean); return w.map((_, i) => skel(w.slice(i).join(""))); };
  const index = list.map((o) => ({ ...o, n: norm(o.name), s: wordSkels(o.name), p: norm(o.places.map(where).join(" ")) }));
  indexCache = { from: list, index };
  return index;
}

/** Best matches for what was typed, in the allowed kinds. */
export function searchOffices(query, kind = "any", kinds = ["branch", "area", "region"]) {
  const q = query.trim();
  const pool = officeIndex().filter((o) => kinds.includes(o.kind) && (kind === "any" || o.kind === kind));
  if (!q) return [];
  const nq = norm(q), sq = skel(q);
  const isCode = /^\d+(\.\d+)?$/.test(q);
  const scored = [];
  for (const o of pool) {
    let score = 0;
    if (isCode) { if (o.code === q) score = 100; else if (o.code.startsWith(q)) score = 80; }
    else if (o.n === nq) score = 95;
    else if (o.n.startsWith(nq)) score = 85;
    else if (o.n.includes(nq)) score = 70;
    else if (sq.length >= 3 && o.s.some((k) => k.startsWith(sq))) score = 55;
    else if (nq.length >= 3 && o.p.includes(nq)) score = 30;
    if (score) scored.push({ o, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.o.kind === "branch" ? -1 : 1) - (b.o.kind === "branch" ? -1 : 1) || a.o.name.localeCompare(b.o.name));
  return scored.slice(0, 8).map((x) => x.o);
}

/** "8772, 2331, Zakigonj Area Office" → the offices it names, and what couldn't be matched (or matched several). */
function parseList(text, kinds) {
  const parts = text.split(/[,;\n]+/).map((t) => t.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const pool = officeIndex().filter((o) => kinds.includes(o.kind));
  const found = [], missing = [];
  for (const t of parts) {
    const hits = /^\d+(\.\d+)?$/.test(t) ? pool.filter((o) => o.code === t) : pool.filter((o) => o.n === norm(t));
    if (hits.length === 1) { if (!found.includes(hits[0])) found.push(hits[0]); } else missing.push(hits.length > 1 ? `${t} (several offices: search it)` : t);
  }
  return { found, missing };
}

/** A stop as visits store it (the same shape the visit form always used, plus the office id and code). */
export function officeToStop(o) {
  const p = o.places[0] || {};
  return {
    kind: o.kind === "branch" ? "branch" : "office", name: o.name, officeId: o.id, ...(o.code ? { code: o.code } : {}),
    division: p.division || "", region: p.region || "", area: o.kind === "region" ? "" : p.area || "",
  };
}
/** The same office as an entry's place (see placeOfStop in lib/visits.js). */
export function officeToPlace(o) {
  const s = officeToStop(o);
  return { division: s.division, region: s.region, area: s.area, office: o.name, officeId: o.id, officeKind: o.kind, branch: o.kind === "branch" ? o.name : "" };
}

const KindIcon = ({ kind, size = 14 }) => (kind === "vo" ? <Users size={size} /> : <Building2 size={size} />);

/** One result line: name (matched part marked), type, code, and where it is. */
function ResultLine({ o, query, taken, on, onPick, onHover }) {
  const q = query.trim().toLowerCase();
  const i = q && !/^\d/.test(q) ? o.name.toLowerCase().indexOf(q) : -1;
  const name = i < 0 ? o.name : <>{o.name.slice(0, i)}<mark>{o.name.slice(i, i + q.length)}</mark>{o.name.slice(i + q.length)}</>;
  const more = o.places.length - 1;
  return (
    <button type="button" role="option" aria-selected={on} className={`os-opt ${on ? "on" : ""} ${taken ? "taken" : ""}`} disabled={taken}
            onMouseDown={(e) => { e.preventDefault(); if (!taken) onPick(o); }} onMouseEnter={onHover}>
      <span className="os-opt-main">
        <span className="os-opt-name">{name}</span>
        <span className="os-opt-sub">{KIND_SHORT[o.kind]} · {where(o.places[0])}{more > 0 ? ` · also in ${more} more area${more > 1 ? "s" : ""}` : ""}</span>
      </span>
      <span className="os-opt-code">{taken ? "Added" : o.code}</span>
    </button>
  );
}

/**
 * The search box: type filter + search field + results. `kinds` limits the office types offered,
 * `taken` (office ids) marks the ones already chosen, onPick(office) / onPickMany(offices) receive the choice.
 * `keepOpen`: after a pick the field clears and stays focused, ready for the next stop.
 */
export function OfficeSearchBox({ kinds = ["branch", "area", "region"], taken = [], onPick, onPickMany, keepOpen = false, autoFocus = false, placeholder, idPrefix = "os", onCancel }) {
  const [kind, setKind] = useState(kinds.length === 1 ? kinds[0] : "any");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(autoFocus);
  const [hi, setHi] = useState(0);
  const [note, setNote] = useState("");
  const input = useRef(null);
  const narrow = useNarrow();

  const list = useMemo(() => parseList(query, kinds), [query, kinds]);
  const results = useMemo(() => (list ? [] : searchOffices(query, kind, kinds)), [query, kind, kinds, list]);
  const pickable = results.filter((o) => !taken.includes(o.id));
  const fresh = list ? list.found.filter((o) => !taken.includes(o.id)) : [];
  const already = list ? list.found.filter((o) => taken.includes(o.id)) : [];
  useEffect(() => { setHi(0); }, [query, kind]);
  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);

  const done = () => {
    setQuery("");
    if (keepOpen) { setOpen(true); setTimeout(() => input.current?.focus(), 0); } else setOpen(false);
  };
  const pick = (o) => { onPick(o); setNote(""); done(); };
  const pickList = () => {
    if (fresh.length) (onPickMany ? onPickMany(fresh) : fresh.forEach(onPick));
    setNote(list.missing.length ? `Not matched: ${list.missing.join(", ")}. Search ${list.missing.length === 1 ? "it" : "them"} one by one.` : "");
    done();
  };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, pickable.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (fresh.length) pickList();
      else if (pickable[hi]) pick(pickable[hi]);
    } else if (e.key === "Escape") { e.stopPropagation(); setOpen(false); onCancel?.(); }
  };

  const typeSelect = kinds.length > 1 && (
    <select className="select os-kind" aria-label="Office type" value={kind} onChange={(e) => { setKind(e.target.value); input.current?.focus(); }}>
      <option value="any">{KIND_LABEL.any}</option>
      {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
    </select>
  );
  const field = (
    <div className="os-field">
      <Search size={15} aria-hidden="true" />
      <input ref={input} id={`${idPrefix}-search`} className="input" autoComplete="off" value={query} role="combobox" aria-expanded={open} aria-controls={`${idPrefix}-results`}
             placeholder={placeholder || (kind === "branch" ? ph(narrow, "Branch name or code, e.g. Kaligonj or 8772", "Branch name or code")
                                          : kind === "any" ? ph(narrow, "Office name or branch code, e.g. Kaligonj or 8772", "Office name or code") : `${KIND_LABEL[kind]} name`)}
             onChange={(e) => { setQuery(e.target.value); setOpen(true); setNote(""); }} onFocus={() => setOpen(true)}
             onBlur={() => { if (!narrow) setTimeout(() => setOpen(false), 150); }} onKeyDown={onKey} />
      {query && <button type="button" className="icon-btn" aria-label="Clear search" onMouseDown={(e) => { e.preventDefault(); setQuery(""); }}><X size={14} /></button>}
    </div>
  );
  const panel = open && (query.trim() || list) ? (
    <div className="os-results" id={`${idPrefix}-results`} role="listbox">
      {list ? (
        <button type="button" className="os-opt on" onMouseDown={(e) => { e.preventDefault(); pickList(); }} disabled={!fresh.length}>
          <span className="os-opt-main">
            <span className="os-opt-name"><ClipboardList size={14} style={{ verticalAlign: -2 }} /> {fresh.length ? `Add ${fresh.length} office${fresh.length > 1 ? "s" : ""}` : "Nothing new to add"}</span>
            <span className="os-opt-sub">
              {fresh.map((o) => `${o.name}${o.code ? ` (${o.code})` : ""}`).join(" · ")}
              {already.length ? `${fresh.length ? " — " : ""}already added: ${already.map((o) => o.name).join(", ")}` : ""}
              {list.missing.length ? ` — not matched: ${list.missing.join(", ")}` : ""}
            </span>
          </span>
        </button>
      ) : results.length ? results.map((o) => (
        <ResultLine key={o.id} o={o} query={query} taken={taken.includes(o.id)} on={pickable[hi]?.id === o.id} onPick={pick} onHover={() => setHi(pickable.indexOf(o))} />
      )) : <div className="os-empty">No {kind === "any" ? "office" : KIND_LABEL[kind].toLowerCase()} matches “{query.trim()}”. Try the branch code, or another spelling.</div>}
    </div>
  ) : null;

  // phones: the search takes the whole screen while it's open
  if (narrow && open) {
    return (
      <div className="os-sheet" role="dialog" aria-label="Find an office">
        <div className="os-sheet-head">
          <button type="button" className="icon-btn" aria-label="Close search" onClick={() => { setOpen(false); onCancel?.(); }}><ChevronLeft size={18} /></button>
          {field}
        </div>
        {typeSelect && <div className="os-sheet-kind">{typeSelect}</div>}
        <div className="os-sheet-body">{panel || <p className="field-hint">Type an office name or branch code. Several codes separated by commas add several stops.</p>}</div>
      </div>
    );
  }
  return (
    <div className="os-box">
      <div className="os-bar">{typeSelect}{field}</div>
      {panel}
      {note && <p className="field-hint" role="status">{note}</p>}
    </div>
  );
}

/* ------------------------------ the visit's stops ------------------------------ */

/** VO codes typed under a branch stop ("VO-142"). */
const normCode = (raw) => raw.trim().toUpperCase().replace(/\s+/g, "-");
function VoAdd({ onAdd }) {
  const [text, setText] = useState(null);
  const narrow = useNarrow();
  if (text === null) return <button type="button" className="link-btn os-vo-add" onClick={() => setText("")}><Plus size={12} /> VO code</button>;
  // several codes are separated by commas; "vo 142" is one code (VO-142)
  const add = () => { text.split(/[,;]+/).map(normCode).filter(Boolean).forEach(onAdd); setText(null); };
  return (
    <input className="input os-vo-input" autoFocus placeholder={ph(narrow, "The VO's code or name, e.g. VO-142", "e.g. VO-142")} value={text} onChange={(e) => setText(e.target.value)}
           onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") setText(null); }} onBlur={add} />
  );
}

/** Everything the app knows about where a chosen office is, to check it's the right one. */
function StopDetails({ stop }) {
  const o = getOfficeList().find((x) => x.id === stop.officeId);
  if (!o) return <div className="os-details">This office is no longer in the office list.</div>;
  return (
    <div className="os-details">
      <b>{o.name}</b>{o.code ? <> · branch code <span className="mono">{o.code}</span></> : null} · {KIND_SHORT[o.kind]}
      <ul>{o.places.map((p) => <li key={where(p)}>{[p.division, p.region, p.area].filter(Boolean).join(" › ")}</li>)}</ul>
    </div>
  );
}

/**
 * The visit's stops, in order: each chosen office as one compact line (number, name, code, area),
 * VO codes under their branch, and the search to add the next one. `value` / onChange: the stops.
 */
export function StopsEditor({ value, onChange, idPrefix = "stops" }) {
  const narrow = useNarrow();
  const [openInfo, setOpenInfo] = useState(null);
  const [removed, setRemoved] = useState(null); // { stops, name } for Undo
  const timer = useRef(null);
  const offices = value.filter((s) => s.kind !== "vo");
  const vosOf = (s) => value.filter((v) => v.kind === "vo" && (v.branchOfficeId ? v.branchOfficeId === s.officeId : v.name.endsWith(` · ${s.name}`)));
  const taken = offices.map((s) => s.officeId).filter(Boolean);

  // keep each branch's VOs right after it
  const rebuild = (list) => list.flatMap((s) => [s, ...vosOf(s)]);
  const add = (os) => onChange([...value, ...os.map(officeToStop)]);
  const move = (i, d) => { const next = [...offices]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(rebuild(next)); };
  const remove = (s) => {
    const prev = value;
    onChange(value.filter((x) => x !== s && !vosOf(s).includes(x)));
    setRemoved({ stops: prev, name: s.name });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRemoved(null), 6000);
  };
  const addVo = (s, code) => {
    const name = voName(code, s.name);
    if (value.some((v) => v.name === name)) return;
    const vo = { kind: "vo", name, branchOfficeId: s.officeId, division: s.division, region: s.region, area: s.area };
    // the new VO goes after the branch's other VOs
    onChange(offices.flatMap((x) => (x === s ? [x, ...vosOf(x), vo] : [x, ...vosOf(x)])));
  };
  const removeVo = (vo) => onChange(value.filter((x) => x !== vo));

  return (
    <div className="os-stops">
      {offices.map((s, i) => (
        <div key={placeKey({ office: s.name, officeId: s.officeId })} className="os-stop">
          <span className="os-num" aria-hidden="true">{i + 1}</span>
          <div className="os-stop-main">
            <div className="os-stop-line">
              <span className="os-stop-name"><KindIcon kind={s.kind} /> {s.name}</span>
              {s.code && <span className="mono os-code">{s.code}</span>}
              <span className="os-stop-where">{s.kind === "branch" ? s.area : s.kind === "office" && s.area ? s.region : s.division}</span>
            </div>
            {s.kind === "branch" && (
              <div className="os-vos">
                {vosOf(s).map((v) => (
                  <span key={v.name} className="os-vo"><Users size={11} /> {v.name.split(" · ")[0]}
                    <button type="button" aria-label={`Remove ${v.name}`} onClick={() => removeVo(v)}><X size={11} /></button></span>
                ))}
                <VoAdd onAdd={(code) => addVo(s, code)} />
              </div>
            )}
            {openInfo === s.officeId && <StopDetails stop={s} />}
          </div>
          <div className="os-stop-actions">
            <button type="button" className="icon-btn" aria-label={`Where is ${s.name}?`} aria-pressed={openInfo === s.officeId} onClick={() => setOpenInfo(openInfo === s.officeId ? null : s.officeId)}><Info size={15} /></button>
            {i > 0 && <button type="button" className="icon-btn" aria-label={`Move ${s.name} up`} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>}
            {i < offices.length - 1 && <button type="button" className="icon-btn" aria-label={`Move ${s.name} down`} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>}
            <button type="button" className="icon-btn" aria-label={`Remove ${s.name}`} onClick={() => remove(s)}><X size={15} /></button>
          </div>
        </div>
      ))}
      {removed && (
        <div className="os-undo" role="status">
          {removed.name} removed.
          <button type="button" className="link-btn" onClick={() => { onChange(removed.stops); setRemoved(null); }}><Undo2 size={12} /> Undo</button>
        </div>
      )}
      <div className="os-stop os-stop-new">
        <span className="os-num add" aria-hidden="true"><Plus size={13} /></span>
        <div className="os-stop-main">
          <OfficeSearchBox taken={taken} keepOpen idPrefix={idPrefix} onPick={(o) => add([o])} onPickMany={add}
                           placeholder={offices.length ? ph(narrow, "Add another office: its name or branch code", "Add another office") : undefined} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ an entry's office ------------------------------ */

/**
 * Which office an entry is about: the offices on this visit as chips to tap (the ones it couldn't
 * visit left out), VO codes under a chosen branch, and "Another office" to search the full list.
 * `kinds`: the office types this entry allows; `single`: one office (plus at most one VO under it).
 * `value` / onChange: the entry's places.
 */
export function EntryPlacePicker({ visit, kinds, single = false, value, onChange, idPrefix = "entry" }) {
  const [searching, setSearching] = useState(false);
  const allowed = (p) => kinds.includes(p.officeKind);
  const planned = (visit.stops || []).filter((s) => !s.skipped && s.kind !== "vo").map((s) => placeOfStop(s, visit)).filter(allowed);
  const keys = value.map(placeKey);
  const chosenBranches = value.filter((p) => p.officeKind === "branch");
  // offices chosen earlier that aren't on the visit (picked with "Another office") stay visible
  const extra = value.filter((p) => p.officeKind !== "vo" && !planned.some((q) => placeKey(q) === placeKey(p)));
  const toggle = (p) => {
    if (keys.includes(placeKey(p))) onChange(value.filter((x) => placeKey(x) !== placeKey(p) && !(p.officeKind === "branch" && x.officeKind === "vo" && x.branch === p.office)));
    else onChange(single ? [p] : [...value, p]);
  };
  const visitVos = (b) => (visit.stops || []).filter((s) => s.kind === "vo" && (s.branchOfficeId ? s.branchOfficeId === b.officeId : s.name.endsWith(` · ${b.office}`)));
  const addVo = (b, code) => {
    const vo = { division: b.division, region: b.region, area: b.area, office: voName(code, b.office), officeKind: "vo", branch: b.office, ...(b.officeId ? { branchOfficeId: b.officeId } : {}) };
    const kept = single ? value.filter((x) => x.officeKind !== "vo") : value;
    if (!kept.some((x) => x.office === vo.office)) onChange([...kept, vo]);
  };
  const chip = (p, isExtra) => {
    const on = keys.includes(placeKey(p));
    return (
      <button type="button" key={placeKey(p)} className={`os-chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => toggle(p)}>
        <KindIcon kind={p.officeKind} size={13} /> {p.office}{isExtra ? <em> · not on the visit</em> : null}
      </button>
    );
  };
  return (
    <div className="os-entry">
      {planned.length > 0
        ? <div className="os-chips" role="group" aria-label="Offices on this visit">{planned.map((p) => chip(p, false))}{extra.map((p) => chip(p, true))}</div>
        : <p className="field-hint" style={{ marginTop: 0 }}>{(visit.stops || []).length ? "No office on this visit fits this entry." : "No offices on this visit yet."} Search for the office below.</p>}
      {chosenBranches.map((b) => (
        <div key={placeKey(b)} className="os-vos">
          <span className="field-hint" style={{ margin: 0 }}>VO under {b.office}:</span>
          {visitVos(b).map((s) => {
            const p = placeOfStop(s, visit);
            const on = keys.includes(placeKey(p));
            return <button type="button" key={s.name} className={`os-chip sm ${on ? "on" : ""}`} aria-pressed={on} onClick={() => (on ? onChange(value.filter((x) => placeKey(x) !== placeKey(p))) : onChange([...(single ? value.filter((x) => x.officeKind !== "vo") : value), p]))}><Users size={11} /> {s.name.split(" · ")[0]}</button>;
          })}
          {value.filter((x) => x.officeKind === "vo" && x.branch === b.office && !visitVos(b).some((s) => s.name === x.office)).map((x) => (
            <span key={x.office} className="os-vo"><Users size={11} /> {x.office.split(" · ")[0]}<button type="button" aria-label={`Remove ${x.office}`} onClick={() => onChange(value.filter((y) => y !== x))}><X size={11} /></button></span>
          ))}
          <VoAdd onAdd={(code) => addVo(b, code)} />
        </div>
      ))}
      {searching || !planned.length ? (
        <OfficeSearchBox kinds={kinds} taken={value.map((p) => p.officeId).filter(Boolean)} autoFocus={searching} idPrefix={idPrefix}
                         onPick={(o) => { const p = officeToPlace(o); onChange(single ? [p] : [...value, p]); setSearching(false); }}
                         onCancel={() => setSearching(false)} />
      ) : (
        <button type="button" className="link-btn" onClick={() => setSearching(true)}><Search size={12} style={{ verticalAlign: -2 }} /> Another office</button>
      )}
    </div>
  );
}

/* ------------------------------ the visit page's offices ------------------------------ */

const SKIP_REASONS = ["Office closed", "Not enough time", "Plan changed", "Other"];

/**
 * The visit's offices on the visit page. While the visit is open, and once its date has come: mark
 * an office as not visited (with a reason; it then doesn't count as visited) or undo that, and "Add a stop on the way" for
 * an office added during the trip. `onChange(stops)` saves the visit.
 */
export function VisitStops({ visit, readOnly, onChange }) {
  const narrow = useNarrow();
  const stops = visit.stops || [];
  const offices = stops.filter((s) => s.kind !== "vo");
  const [skipping, setSkipping] = useState(null); // index of the office being marked
  const [reason, setReason] = useState(SKIP_REASONS[0]);
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const vosOf = (s) => stops.filter((v) => v.kind === "vo" && (v.branchOfficeId ? v.branchOfficeId === s.officeId : v.name.endsWith(` · ${s.name}`)));
  const update = (s, patch) => onChange(stops.map((x) => (x === s ? (patch ? { ...x, ...patch } : (({ skipped, ...rest }) => rest)(x)) : x)));
  const saveSkip = (s) => {
    update(s, { skipped: { reason: reason === "Other" && note.trim() ? note.trim() : reason, at: new Date().toISOString() } });
    setSkipping(null); setNote(""); setReason(SKIP_REASONS[0]);
  };
  // before the visit date there is nothing to mark yet
  const started = !!visit.date && visit.date <= isoDate(new Date());
  if (!offices.length && readOnly) return <div className="rs-none">No offices on this visit.</div>;
  return (
    <div className="os-visit">
      {offices.map((s, i) => (
        <div key={s.officeId || s.name} className={`os-vstop ${s.skipped ? "skipped" : ""}`}>
          <span className="os-num" aria-hidden="true">{i + 1}</span>
          <div className="os-stop-main">
            <div className="os-stop-line">
              <span className="os-stop-name"><KindIcon kind={s.kind} /> {s.name}</span>
              {s.code && <span className="mono os-code">{s.code}</span>}
              {s.addedOnTheWay && <span className="pill pill-info">Added on the way</span>}
            </div>
            <div className="os-stop-where">{[s.area, s.region].filter(Boolean).join(" · ")}{vosOf(s).length ? ` · VO ${vosOf(s).map((v) => v.name.split(" · ")[0]).join(", ")}` : ""}</div>
            {s.skipped && (
              <div className="os-skip-note">Couldn't visit: {s.skipped.reason}
                {!readOnly && <button type="button" className="link-btn" onClick={() => update(s, null)}><Undo2 size={12} /> Visited after all</button>}
              </div>
            )}
            {skipping === i && (
              <div className="os-skip-form">
                <select className="select" aria-label="Why not" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {SKIP_REASONS.map((r) => <option key={r}>{r}</option>)}
                </select>
                {reason === "Other" && <input className="input" autoFocus placeholder={ph(narrow, "Why you couldn't go, e.g. the road was flooded", "e.g. the road was flooded")} value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => saveSkip(s)}>Save</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSkipping(null)}>Cancel</button>
              </div>
            )}
          </div>
          {!readOnly && started && !s.skipped && skipping !== i && (
            <button type="button" className="os-skip-btn" title="Mark this office as not visited, with a reason"
                    onClick={() => { setSkipping(i); setReason(SKIP_REASONS[0]); setNote(""); }}>
              <MapPinOff size={13} /> Mark as not visited
            </button>
          )}
        </div>
      ))}
      {!readOnly && (adding ? (
        <div className="os-vstop">
          <span className="os-num add" aria-hidden="true"><Plus size={13} /></span>
          <div className="os-stop-main">
            <OfficeSearchBox autoFocus idPrefix="onway" taken={offices.map((s) => s.officeId).filter(Boolean)}
                             onPick={(o) => { onChange([...stops, { ...officeToStop(o), addedOnTheWay: true }]); setAdding(false); }}
                             onCancel={() => setAdding(false)} />
          </div>
        </div>
      ) : (
        <button type="button" className="link-btn os-onway" onClick={() => setAdding(true)}><Plus size={13} style={{ verticalAlign: -2 }} /> Add a stop on the way</button>
      ))}
    </div>
  );
}
