// Feature switches. Flip one here to change who sees what — no other code changes needed.
export const FEATURES = {
  // Coverage (visited within the visit target / overdue / never visited). Admins always see it in
  // the admin console's Network health tab; management always sees it on Management → Offices.
  // This switch adds it to management's Analytics visits map (the Coverage colouring) and to the
  // branch status shown in quick search.
  managementSeesNetworkCoverage: true,
  // The Bangladesh maps (coverage map, visit density, Branch 360° locator). Off while locations come
  // from BRAC's branch API: its divisions and regions are BRAC's own, with no map outlines or
  // coordinates. The filters beside the maps stay. (The sign-in page's outline is decoration and stays.)
  maps: false,
};

// The Management section's tabs: every employee with the Management role sees all of them (listed
// on the admin console's Features page). The old per-tab switches in settings.managementTabs are ignored.
export const MANAGEMENT_TABS = [
  { key: "summary", label: "Overview", desc: "What needs attention today, and the programme in charts." },
  { key: "offices", label: "Offices", desc: "Every branch, VO, area and region office: visits, who went, and how its issues are doing. Also Branch 360° and branch search." },
  { key: "people", label: "People", desc: "Everyone who makes visits, where they went, what they recorded, and each person's full history." },
  { key: "departments", label: "Departments", desc: "How each department deals with the issues it is given: where they stand, how fast, and what is late." },
];
