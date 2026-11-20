// The one list of age groups in the panel (contract Section 3.3), in order.
// key   = the value the backend stores and sends (profile.ageGroup); never shown, never changed.
// label = what admins read; the same names as the app's en.json (age_group.*) and the backend's src/utils/ageGroup.js.
//         The key "Yuvak/Yuvatis A" reads "Yuvaks/Yuvatis A" so both Yuvak groups match (client choice, 20 Nov 2026).
export const AGE_GROUPS = [
  { key: 'Shishu', label: 'Shishu' },
  { key: 'Bals/Balikas A', label: 'Bals/Balikas A' },
  { key: 'Bals/Balikas B', label: 'Bals/Balikas B' },
  { key: 'Bals/Balikas C', label: 'Bals/Balikas C' },
  { key: 'Kishors/Kishoris A', label: 'Kishors/Kishoris A' },
  { key: 'Kishors/Kishoris B', label: 'Kishors/Kishoris B' },
  { key: 'Yuvak/Yuvatis A', label: 'Yuvaks/Yuvatis A' },
  { key: 'Yuvaks/Yuvatis B', label: 'Yuvaks/Yuvatis B' },
  { key: 'Vadil', label: 'Vadil' },
];

const BY_KEY = Object.fromEntries(AGE_GROUPS.map((g) => [g.key, g.label]));

/** Display name for a stored age-group key; null/empty stays null, an unknown key is shown as is. */
export const ageGroupLabel = (key) => (key ? BY_KEY[key] ?? key : null);
