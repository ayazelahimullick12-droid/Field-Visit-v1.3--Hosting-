import { useState, useEffect, useCallback, useRef } from "react";
import { kvGet, kvSet } from "./offline";

const API_BASE = "/api";

// Reference data the staff app needs to open with no signal (who is signed in,
// units and teams, the office list, settings). A copy is kept in the browser's
// IndexedDB (room for the ~12,700 synced branches, unlike localStorage's ~5 MB)
// after every successful load. Passwords are never kept on the device.
const OFFLINE_COPY = new Set(["employees", "departments", "offices", "structure", "settings"]);
const cacheKey = (name) => `fvt-cache:${name}`;
const withoutSecrets = (data) => (Array.isArray(data) ? data.map(({ password, ...rest }) => rest) : data);

async function readCopy(name) {
  if (!OFFLINE_COPY.has(name)) return undefined;
  return (await kvGet(cacheKey(name))) ?? undefined;
}
function writeCopy(name, data) {
  if (!OFFLINE_COPY.has(name)) return;
  kvSet(cacheKey(name), withoutSecrets(data)); // never throws: a full or blocked store just means no offline copy
  try { localStorage.removeItem(cacheKey(name)); } catch { /* old copies lived here */ }
}

/**
 * Drop-in replacement for useState(initialValue) that is backed by a JSON
 * file on the local server instead of only living in memory.
 *
 * Usage (before):
 *   const [visits, setVisits] = useState(initialVisits);
 *
 * Usage (after):
 *   const [visits, setVisits] = usePersistedCollection("visits", initialVisits);
 *
 * - On mount, it fetches GET /api/<name> and replaces the seed data once the
 *   server responds. If the server can't be reached it falls back to the last
 *   copy kept on this device (for the collections listed above), and otherwise
 *   keeps using the local seed data so the UI still works.
 * - Every call to the returned setter (including functional updates, e.g.
 *   setVisits(vs => ...)) updates local state immediately AND sends the
 *   resulting array to the server with PUT /api/<name> so it's saved to
 *   server/db.json.
 * - The fourth value, reload(), fetches the collection again and only shows
 *   it — it never writes back, so a fresh read can't overwrite changes other
 *   people saved in the meantime.
 *
 * Visits in the staff app don't use this: they go through useVisitStore, which
 * saves one visit at a time and queues changes while offline.
 */
export function usePersistedCollection(name, fallback) {
  const [data, setData] = useState(fallback);
  const [loaded, setLoaded] = useState(false);
  const hasLoaded = useRef(false);
  // The device copy has no passwords, so it must never be written back over the server's data.
  const fromDeviceCopy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/${name}`)
      .then((r) => {
        // signed out (cookie expired): back to the sign-in page
        if (r.status === 401) { window.location.replace("/"); return Promise.reject(r); }
        return r.ok ? r.json() : Promise.reject(r);
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          writeCopy(name, json);
          hasLoaded.current = true;
          setLoaded(true);
        }
      })
      .catch(async (err) => {
        const copy = await readCopy(name);
        if (copy !== undefined) {
          if (!cancelled) { fromDeviceCopy.current = true; setData(copy); setLoaded(true); }
          return;
        }
        console.warn(
          `[usePersistedCollection] Could not load "${name}" from the server — using local seed data. Is the API server running (npm run dev:server)?`,
          err
        );
        if (!cancelled) setLoaded(true); // don't block callers forever if the server is down
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const setAndPersist = useCallback(
    (updater) => {
      if (fromDeviceCopy.current) {
        console.warn(`[usePersistedCollection] "${name}" was loaded from this device's offline copy, so changes can't be saved until the server is reachable.`);
        return;
      }
      setData((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        fetch(`${API_BASE}/${name}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        })
          .then(async (r) => {
            if (!r.ok) {
              const json = await r.json().catch(() => ({}));
              console.error(`[usePersistedCollection] "${name}" was not saved: ${json.error || r.status}`);
              if (typeof window !== "undefined") window.alert(`Not saved: ${json.error || `error ${r.status}`}`);
            }
          })
          .catch((err) => {
            console.error(`[usePersistedCollection] Failed to save "${name}":`, err);
          });
        writeCopy(name, next);
        return next;
      });
    },
    [name]
  );

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/${name}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
      writeCopy(name, json);
      fromDeviceCopy.current = false;
    } catch { /* offline: keep what's on screen */ }
  }, [name]);

  return [data, setAndPersist, loaded, reload];
}
