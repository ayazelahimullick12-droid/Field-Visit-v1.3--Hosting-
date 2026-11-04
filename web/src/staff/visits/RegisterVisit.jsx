import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Check, Trash2, Plus, BedDouble, X, GraduationCap, Hotel, Home, Building2, MapPin } from "lucide-react";
import { REASONS, STAY_TYPES, BLCS, tripDays, isoDate, countsOf } from "../../lib/visits";
import { makeId } from "../../lib/ids";
import { StopsEditor } from "./OfficeSearch";

const BLC = STAY_TYPES[0];
const OTHER_BLC = "__other";
const optional = (t = "(optional)") => <span className="opt">{t}</span>;

// The accommodation types, as big buttons: the card asks for the type first and only then shows the rest.
const STAY_ICONS = { [BLC]: GraduationCap, Hotel: Hotel, "Guest house": Home, "BRAC office": Building2, Other: MapPin };
const STAY_HINTS = { [BLC]: "BRAC Learning Centre", Hotel: "Any hotel", "Guest house": "Government or private", "BRAC office": "Staying at an office", Other: "Somewhere else" };
const NAME_PLACEHOLDERS = {
  Hotel: "Name of the hotel and its town, e.g. Hotel Al-Amin, Sylhet",
  "Guest house": "Name of the guest house and its town, e.g. Parjatan Motel, Cox's Bazar",
  "BRAC office": "Which BRAC office you are staying at, e.g. Rangpur Regional Office",
  Other: "Where you are staying, e.g. a relative's house in Bogura town",
};

/** One accommodation: first its type (a BLC, a hotel, a guest house…), then where, when and any remarks. */
function StayCard({ stay: s, index, blcs, onChange, onRemove }) {
  const set = (patch) => onChange({ ...s, ...patch });
  const blcPick = blcs.includes(s.name) ? s.name : s.other ? OTHER_BLC : "";
  const Icon = STAY_ICONS[s.type] || BedDouble;
  return (
    <div className={`stay-card ${s.type ? "" : "picking"}`}>
      <div className="stay-head">
        <span className="hub-ico ico-stay"><Icon size={17} /></span>
        <b>{s.type ? s.name || (s.type === BLC ? "BRAC Learning Centre" : s.type) : "What kind of place are you staying at?"}</b>
        {s.type && <button type="button" className="link-btn stay-change" onClick={() => set({ type: "", name: "", other: false })}>Change type</button>}
        <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Remove accommodation ${index + 1}`}><X size={15} /></button>
      </div>
      {!s.type ? (
        <div className="stay-types" role="group" aria-label="Accommodation type">
          {STAY_TYPES.map((t) => {
            const I = STAY_ICONS[t] || BedDouble;
            return (
              <button key={t} type="button" id={index === 0 && t === BLC ? "reg-stay-type" : undefined} className="stay-type" onClick={() => set({ type: t, name: "", other: false })}>
                <I size={20} />
                <b>{t === BLC ? "BLC" : t}</b>
                <small>{STAY_HINTS[t]}</small>
              </button>
            );
          })}
        </div>
      ) : (
      <div className="stay-rest">
      <div className="field-group">
        <label className="field-label" htmlFor={`stay-name-${s.id}`}>{s.type === BLC ? "Which BLC" : "Name of the place"}</label>
        {s.type === BLC ? (
          <select id={`stay-name-${s.id}`} className="select" autoFocus value={blcPick}
                  onChange={(e) => (e.target.value === OTHER_BLC ? set({ name: "", other: true }) : set({ name: e.target.value, other: false }))}>
            <option value="">Select the BLC you are staying at</option>
            {blcs.map((b) => <option key={b}>{b}</option>)}
            <option value={OTHER_BLC}>Another BLC (type its name)</option>
          </select>
        ) : (
          <input id={`stay-name-${s.id}`} className="input" autoFocus placeholder={NAME_PLACEHOLDERS[s.type] || NAME_PLACEHOLDERS.Other} value={s.name} onChange={(e) => set({ name: e.target.value })} />
        )}
      </div>
      {s.type === BLC && blcPick === OTHER_BLC && (
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-other-${s.id}`}>BLC name</label>
          <input id={`stay-other-${s.id}`} className="input" autoFocus placeholder="The BLC's name as written on its signboard, e.g. BLC Bogura" value={s.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
      )}
      <div className="field-row">
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-in-${s.id}`}>Check-in date</label>
          <input id={`stay-in-${s.id}`} type="date" className="input" value={s.checkIn} onChange={(e) => set({ checkIn: e.target.value, ...(s.checkOut && s.checkOut < e.target.value ? { checkOut: e.target.value } : {}) })} />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-out-${s.id}`}>Check-out date</label>
          <input id={`stay-out-${s.id}`} type="date" className="input" value={s.checkOut} min={s.checkIn || undefined} onChange={(e) => set({ checkOut: e.target.value })} />
        </div>
      </div>
      <div className="field-group" style={{ marginBottom: 0 }}>
        <label className="field-label" htmlFor={`stay-notes-${s.id}`}>Remarks {optional()}</label>
        <input id={`stay-notes-${s.id}`} className="input" placeholder="Room number, the caretaker's name and phone, or anything a colleague staying there should know" value={s.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      </div>
      )}
    </div>
  );
}

/** The visit's own place is its first office's (older screens and the figures read it). */
const placeOfVisit = (stops) => {
  const first = stops.find((s) => s.kind !== "vo");
  return first ? { division: first.division || "", region: first.region || "", area: first.area || "" } : { division: "", region: "", area: "" };
};

/**
 * Register a visit (or edit one), in this order: the offices (found by searching, like the stops of
 * a trip), the dates, the purpose, then accommodation. Required: at least one office and the visit
 * date. Visits don't ask for times; ones that already have times keep them.
 */
export default function RegisterVisit({ purposes = REASONS, blcs = BLCS, visit, prefill, focusField, onSave, onCancel, onDelete }) {
  const edit = !!visit;
  const now = useMemo(() => new Date(), []);

  const [stops, setStops] = useState(() => {
    if (visit) return (visit.stops || []).map((s) => ({ ...s }));
    if (prefill) return [{ kind: "branch", name: prefill.name, ...(prefill.id ? { officeId: prefill.id } : {}), ...(prefill.code ? { code: prefill.code } : {}), division: prefill.division, region: prefill.district, area: prefill.area }];
    return [];
  });
  const [reason, setReason] = useState(visit?.reason || (purposes.includes("Monitoring") ? "Monitoring" : purposes[0]));
  const [reasonOther, setReasonOther] = useState(visit?.reasonOther || "");
  const [date, setDate] = useState(visit?.date || isoDate(now));
  const [returnDate, setReturnDate] = useState(visit?.returnDate || "");
  const [stays, setStays] = useState(() => (visit?.stays || []).map((s) => ({ ...s })));
  const [sureDelete, setSureDelete] = useState(false);

  const newStay = () => ({ id: makeId("SY"), type: "", name: "", checkIn: date, checkOut: returnDate || date, notes: "" });

  // Accommodation dates follow the visit dates until they're changed by hand.
  const changeDates = (nextDate, nextReturn) => {
    setStays((list) => list.map((s) => ({
      ...s,
      checkIn: !s.checkIn || s.checkIn === date ? nextDate : s.checkIn,
      checkOut: !s.checkOut || s.checkOut === (returnDate || date) ? nextReturn || nextDate : s.checkOut,
    })));
    setDate(nextDate);
    setReturnDate(nextReturn);
  };

  // "Add times" or "Add accommodation" from the visit page lands straight on that field
  useEffect(() => {
    if (!focusField) return;
    if (focusField === "stay" && stays.length === 0) setStays([newStay()]);
    setTimeout(() => {
      const el = document.getElementById(`reg-${focusField}`);
      if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); }
    }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusField]);

  const days = tripDays({ date, returnDate });
  const why = !stops.some((x) => x.kind !== "vo") ? "Add at least one office you're visiting."
    : !date ? "Select the visit date."
    : reason === "Other" && !reasonOther.trim() ? "Specify the purpose of the visit."
    : returnDate && returnDate < date ? "The return date cannot be before the visit date." : "";
  const later = why ? "" : edit ? "" : "The return date and accommodation can be added later from the visit page.";

  const save = () => {
    if (why) return;
    onSave({
      ...placeOfVisit(stops), stops,
      reason, reasonOther: reason === "Other" ? reasonOther.trim() : "",
      // times are no longer asked for; an older visit keeps the ones it has
      date, returnDate, visitTime: visit?.visitTime || "", returnTime: visit?.returnTime || "",
      stays: stays.filter((s) => s.name.trim() || s.notes.trim()).map(({ other, ...s }) => ({ ...s, name: s.name.trim(), notes: s.notes.trim() })),
    });
  };

  const counts = edit ? countsOf(visit) : null;
  const canDelete = edit && visit.status !== "done" && onDelete;
  const lost = edit ? [counts.submitted && `${counts.submitted} submitted ${counts.submitted === 1 ? "entry" : "entries"}`, counts.drafts && `${counts.drafts} draft${counts.drafts === 1 ? "" : "s"}`].filter(Boolean).join(" and ") : "";

  return (
    <div className="page-narrow">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10, paddingLeft: 0 }} onClick={onCancel}>
        <ArrowLeft size={14} /> {edit ? "Back to visit" : "Cancel"}
      </button>

      <div className="wizard-shell">
        <div className="wizard-head">
          <p className="h-eyebrow">{edit ? <>Visit details · <span className="mono">{visit.id}</span></> : "New visit"}</p>
          <h1 className="h-title">{edit ? "Update visit details" : "Register a visit"}</h1>
          <p className="h-desc">
            {edit
              ? "Update the offices, schedule, purpose or accommodation."
              : "Register a visit on the day or in advance. The offices and date are required; other details can be added later."}
          </p>
        </div>

        <div className="wizard-body">
          <fieldset className="form-sec">
            <legend>Offices you're visiting <span className="req">*</span></legend>
            <StopsEditor value={stops} onChange={setStops} idPrefix="reg" />
            <p className="field-hint" style={{ marginBottom: 0 }}>Search by office name or branch code. Paste several codes separated by commas to add them together. Press Enter to add the highlighted office.</p>
          </fieldset>

          <fieldset className="form-sec">
            <legend>Schedule</legend>
            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="reg-date">Visit date <span className="req">*</span></label>
                <input id="reg-date" type="date" className="input" value={date}
                       onChange={(e) => changeDates(e.target.value, returnDate && returnDate < e.target.value ? e.target.value : returnDate)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="reg-returnDate">Return date {optional()}</label>
                <input id="reg-returnDate" type="date" className="input" value={returnDate} min={date || undefined} onChange={(e) => changeDates(date, e.target.value)} />
              </div>
            </div>
            <div className={`duration-display ${days ? "filled" : ""}`}>
              <CalendarDays size={14} />
              {days || "The number of days shows when the return date is set"}
            </div>
          </fieldset>

          <fieldset className="form-sec">
            <legend>Purpose of visit</legend>
            <div className="field-group">
              <label className="field-label" htmlFor="reg-reason">Purpose <span className="req">*</span></label>
              <select id="reg-reason" className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
                {/* the admin's list; a purpose since removed from it stays selectable on visits that use it */}
                {(purposes.includes(reason) ? purposes : [reason, ...purposes]).map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            {reason === "Other" && (
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label className="field-label" htmlFor="reg-reasonOther">Specify purpose <span className="req">*</span></label>
                <input id="reg-reasonOther" className="input" autoFocus={!edit || !visit.reasonOther} placeholder="Why you are going, in a few words, e.g. follow-up on last month's audit findings" value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} maxLength={120} />
              </div>
            )}
          </fieldset>


          {/* Optional: hidden until asked for. */}
          <div className="stay-sec">
            {stays.length === 0 ? (
              <button type="button" id="reg-stay" className="add-optional" onClick={() => setStays([newStay()])}>
                <span className="hub-ico ico-stay"><BedDouble size={18} /></span>
                <span className="ao-text"><b>Add accommodation</b><small>Optional · for overnight visits, e.g. a BRAC Learning Centre (BLC)</small></span>
                <Plus size={18} />
              </button>
            ) : (
              <fieldset className="form-sec">
                <legend>Accommodation {optional()}</legend>
                {stays.map((s, i) => (
                  <StayCard key={s.id} stay={s} index={i} blcs={blcs}
                            onChange={(next) => setStays((list) => list.map((x) => (x.id === s.id ? next : x)))}
                            onRemove={() => setStays((list) => list.filter((x) => x.id !== s.id))} />
                ))}
                <button type="button" id="reg-stay" className="link-btn" onClick={() => setStays((list) => [...list, { ...newStay(), checkIn: list[list.length - 1]?.checkOut || date }])}>
                  <Plus size={13} style={{ verticalAlign: -2 }} /> Add another accommodation
                </button>
              </fieldset>
            )}
          </div>

          {canDelete && (
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)", paddingLeft: 0, marginTop: 18 }} onClick={() => (sureDelete ? onDelete() : setSureDelete(true))}>
              <Trash2 size={14} /> {sureDelete ? `Select again to delete this visit${lost ? ` and its ${lost}` : ""}. This cannot be undone.` : "Delete visit"}
            </button>
          )}
        </div>

        <div className="wizard-foot" style={{ position: "static", flexWrap: "wrap" }}>
          <span className="field-hint" style={{ margin: 0, flex: "1 1 220px" }}>{why || later}</span>
          <button className="btn btn-primary" onClick={save} disabled={!!why}>
            <Check size={15} /> {edit ? "Save changes" : "Register visit"}
          </button>
        </div>
      </div>
    </div>
  );
}
