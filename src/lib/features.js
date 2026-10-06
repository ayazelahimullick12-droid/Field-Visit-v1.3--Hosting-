// Feature switches. Flip one here to change who sees what — no other code changes needed.
export const FEATURES = {
  // Network health + coverage (coverage map, overdue / never-visited lists, the offices table)
  // is admin-only for now, in the admin console's "Network health" tab. Set this to true to
  // give it to employees tagged "management" as well: a "Network health" tab beside
  // "My complaints", and coverage colouring on the dashboard's visits map.
  managementSeesNetworkCoverage: false,
};
