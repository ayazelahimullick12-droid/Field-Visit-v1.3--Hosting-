// Simple, dependency-free unique-ish id generator for a local prototype.
// Not cryptographically unique, but collision odds are negligible at this scale.
export function makeId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
