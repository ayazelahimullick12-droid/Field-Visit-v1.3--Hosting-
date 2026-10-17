// Registers the offline service worker (public/sw.js) in production builds.
// In `npm run dev` it stays off, so live reload isn't served stale files.
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[sw] registration failed:", err));
}
