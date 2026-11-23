// Loyadham Online Classes (Bals-Balikas or Kishor-Kishori Classes): one student status per playable profile.
// Backend rules: satsang-backend src/utils/studentStatus.js (POST /admin/profiles/:id/student-status, Full Admin only).

export const STUDENT_STATUS = {
  not_asked: { label: 'Not answered', tone: 'muted' },
  pending_verification: { label: 'Pending verification', tone: 'warn' },
  verified: { label: 'Verified student', tone: 'ok' },
  interested: { label: 'Interested', tone: 'info' },
  interest_confirmed: { label: 'Interested – confirmed', tone: 'brand' },
  not_enrolled: { label: 'Not enrolled', tone: 'muted' },
};

// The two review queues; the dashboard's "Students to verify" card opens the Users page with both.
export const TO_VERIFY = 'pending_verification,interested';

// Users page "Class Status" filter (client 23 Nov 2026) → GET /admin/users?classStatus=.
// The backend counts interest_confirmed as Interested and not_asked (never answered) as Not Enrolled.
export const CLASS_STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'verified', label: 'Verified Students' },
  { value: 'pending_verification', label: 'Pending Verification' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_enrolled', label: 'Not Enrolled' },
];
// Old Users links used ?studentStatus=<one status or a comma list>. One status maps to its Class Status; the
// dashboard's "pending + interested" (TO_VERIFY) has no single Class Status, so it is still sent as studentStatus.
const LEGACY_STATUS = {
  verified: 'verified', pending_verification: 'pending_verification', interested: 'interested',
  interest_confirmed: 'interested', not_enrolled: 'not_enrolled', not_asked: 'not_enrolled',
};
export function classStatusFromUrl(classStatus, studentStatus) {
  if (CLASS_STATUS_FILTERS.some((f) => f.value === classStatus)) return { classStatus, studentStatus: undefined };
  if (studentStatus && LEGACY_STATUS[studentStatus]) return { classStatus: LEGACY_STATUS[studentStatus], studentStatus: undefined };
  if (studentStatus === TO_VERIFY) return { classStatus: 'all', studentStatus: TO_VERIFY };
  return { classStatus: 'all', studentStatus: undefined };
}

// Reward amounts: the backend defaults (STUDENT_VERIFIED_SPARKS, STUDENT_INTEREST_SPARKS); the toast shows what the
// server actually gave (sparksAwarded).
export const STUDENT_SPARKS = { verified: 10, interestConfirmed: 5 };

export const SPARKS_NOTE = 'Reserved – becomes spendable when Sparks launch.';

export function StudentChip({ status }) {
  const s = STUDENT_STATUS[status];
  if (!s) return <span className="muted">—</span>;
  return <span className={`pill ${s.tone}`}>{s.label}</span>;
}
