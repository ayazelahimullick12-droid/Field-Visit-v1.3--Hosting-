import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = "/api";

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
 *   server responds. If the server isn't running, it silently keeps using
 *   the local seed data so the UI still works.
 * - Every call to the returned setter (including functional updates, e.g.
 *   setVisits(vs => ...)) updates local state immediately AND sends the
 *   resulting array to the server with PUT /api/<name> so it's saved to
 *   server/db.json.
 */
export function usePersistedCollection(name, fallback) {
  const [data, setData] = useState(fallback);
  const hasLoaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/${name}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => {
        if (!cancelled) {
          setData(json);
          hasLoaded.current = true;
        }
      })
      .catch((err) => {
        console.warn(
          `[usePersistedCollection] Could not load "${name}" from the server — using local seed data. Is the API server running (npm run dev:server)?`,
          err
        );
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const setAndPersist = useCallback(
    (updater) => {
      setData((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        fetch(`${API_BASE}/${name}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        }).catch((err) => {
          console.error(`[usePersistedCollection] Failed to save "${name}":`, err);
        });
        return next;
      });
    },
    [name]
  );

  return [data, setAndPersist];
}
