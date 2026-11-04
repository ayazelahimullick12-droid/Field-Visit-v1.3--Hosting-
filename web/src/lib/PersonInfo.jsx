import React, { useId } from "react";

/* Optional "who is this?" details, captured for client interactions, observations
   from staff and complaints, and shown to fixers and admins. Staff and members have different identifiers, but
   the same shape is used everywhere: a plain { key: value } object that only
   holds the fields that were actually filled in. */

export const PERSON_FIELDS = {
  staff: [
    { key: "name", label: "Name", placeholder: "Full name, e.g. Nasima Begum" },
    { key: "pin", label: "PIN", inputMode: "numeric", placeholder: "Their staff PIN, e.g. 51023" },
    { key: "designation", label: "Designation", placeholder: "Their job title, e.g. Branch Manager" },
    { key: "department", label: "Department", suggest: true, placeholder: "Pick from the list or type, e.g. Microfinance" },
    { key: "contact", label: "Contact", inputMode: "tel", placeholder: "Mobile number or email, e.g. 01712-345678" },
  ],
  member: [
    { key: "name", label: "Name", placeholder: "Full name, e.g. Rahima Khatun" },
    { key: "phone", label: "Phone", inputMode: "tel", placeholder: "Mobile number, e.g. 01712-345678" },
    { key: "memberNumber", label: "Member number", placeholder: "As written in their passbook" },
    { key: "voCode", label: "VO code", placeholder: "The VO they belong to, e.g. VO-142" },
    { key: "branchCode", label: "Branch code", placeholder: "Their branch's code, e.g. 8772" },
    { key: "projectCode", label: "Project code", placeholder: "As written in their passbook" },
  ],
};

export const kindOf = (source) => (source === "member" ? "member" : "staff");
export const emptyPerson = (kind) => Object.fromEntries(PERSON_FIELDS[kindOf(kind)].map((f) => [f.key, ""]));
export const compactPerson = (p) => Object.fromEntries(Object.entries(p || {}).filter(([, v]) => String(v ?? "").trim() !== ""));
export const hasPerson = (p) => Object.keys(compactPerson(p)).length > 0;

/** The inputs. Every field is optional. `departments` only feeds the staff Department suggestions. */
export function PersonFields({ kind, value, onChange, departments = [], title = "Details" }) {
  const k = kindOf(kind);
  const listId = useId();
  const fields = PERSON_FIELDS[k];
  const set = (key, v) => onChange({ ...value, [key]: v });
  // two fields per row
  const rows = [];
  for (let i = 0; i < fields.length; i += 2) rows.push(fields.slice(i, i + 2));
  return (
    <div className="person-box">
      {title && <p className="person-title">{title} <span>optional</span></p>}
      {rows.map((row, i) => (
        <div className="field-row" key={i}>
          {row.map((f) => <PersonInput key={f.key} f={f} value={value[f.key] || ""} onChange={(v) => set(f.key, v)} listId={f.suggest ? listId : undefined} />)}
        </div>
      ))}
      <datalist id={listId}>{departments.map((d) => <option key={d.id} value={d.name} />)}</datalist>
    </div>
  );
}

function PersonInput({ f, value, onChange, listId }) {
  const id = useId();
  return (
    <div className="field-group">
      <label className="field-label" htmlFor={id}>{f.label}</label>
      <input id={id} className="input" autoComplete="off" inputMode={f.inputMode} list={listId} placeholder={f.placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Read-only summary: who raised it and how to reach them. `consent === false` is flagged. */
export function PersonDetails({ kind, person, consent, compact = false }) {
  const k = kindOf(kind);
  const p = compactPerson(person);
  const fields = PERSON_FIELDS[k].filter((f) => p[f.key]);
  return (
    <div className={`person-detail ${compact ? "compact" : ""}`}>
      <div className="pd-head">
        <span className="source-badge">{k}</span>
        {fields.length === 0 && <span className="pd-none">no details given</span>}
        {consent === false && <span className="pd-flag">No consent to follow up</span>}
      </div>
      {fields.map((f) => <span key={f.key}><b>{f.label}</b>{p[f.key]}</span>)}
    </div>
  );
}
