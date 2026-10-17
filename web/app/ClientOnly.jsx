"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "../src/lib/registerSW";

/**
 * Every page of this app runs in the browser only (it works offline and reads the
 * signed-in session), so each page loads its screen with ssr: false and wraps it here.
 */
export default function ClientOnly({ children, offline = false }) {
  useEffect(() => {
    if (offline) registerServiceWorker();
  }, [offline]);
  return children;
}
