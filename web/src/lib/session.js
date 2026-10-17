import { useEffect, useState } from "react";

/* Signing in and out. The server keeps the session in an http-only cookie, so the page never
   sees a password or token. For working offline, the staff app also remembers *which*
   employee is signed in (just the id) so it can open without signal. */

const STAFF_ID_KEY = "fvt-staff-session";

/** Calls the API and returns its JSON; throws an Error with the server's message on failure. */
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json;
}

export const login = (pin, password, kind = "employee") => api("/auth/login", { method: "POST", body: { pin, password, kind } });
export const register = (fields) => api("/auth/register", { method: "POST", body: fields });

export async function logout() {
  try { localStorage.removeItem(STAFF_ID_KEY); } catch { /* ignore */ }
  try { await api("/auth/logout", { method: "POST" }); } catch { /* offline: the cookie expires by itself */ }
  window.location.href = "/";
}

/** Who is signed in: { kind: "employee" | "admin", user } or null. `offline` is true when the server can't be reached. */
export async function whoAmI() {
  try {
    const me = await api("/auth/me");
    if (me.kind === "employee") try { localStorage.setItem(STAFF_ID_KEY, me.user.id); } catch { /* ignore */ }
    return me;
  } catch (err) {
    if (err.status === 401) {
      try { localStorage.removeItem(STAFF_ID_KEY); } catch { /* ignore */ }
      return null;
    }
    // no connection: the staff app can still open for the person last signed in on this device
    let id = null;
    try { id = localStorage.getItem(STAFF_ID_KEY); } catch { /* ignore */ }
    return id ? { kind: "employee", user: { id }, offline: true } : null;
  }
}

/**
 * For a page that needs someone signed in: sends them to the sign-in page ("/") otherwise.
 * kind = "employee" (staff app) or "admin" (admin console).
 */
export function useSession(kind) {
  const [state, setState] = useState({ loaded: false, user: null });
  useEffect(() => {
    let cancelled = false;
    whoAmI().then((me) => {
      if (cancelled) return;
      if (!me || me.kind !== kind) { window.location.replace("/"); return; }
      setState({ loaded: true, user: me.user, offline: !!me.offline });
    });
    return () => { cancelled = true; };
  }, [kind]);
  return state;
}
