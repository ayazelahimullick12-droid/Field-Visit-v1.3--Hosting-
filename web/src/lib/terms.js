// What the interface calls the two levels a complaint is routed by.
//
// The stored data keeps its original keys, so nothing had to be migrated when the wording changed:
//   departments collection / complaint.department  ->  shown as a "Unit"
//   department.units[]     / complaint.unit        ->  shown as a "Team"
// Change the words here (and in server/logic.js messages) if the wording changes again.
export const TERMS = {
  unit: "Unit", units: "Units",
  team: "Team", teams: "Teams",
};
export const lower = (s) => s.toLowerCase();
