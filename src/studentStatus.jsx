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

// Users page "Online Classes" filter. The value goes to GET /admin/users?studentStatus= as is.
export const STUDENT_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending_verification', label: 'Pending verification' },
  { value: 'interested', label: 'Interested' },
  { value: 'verified', label: 'Verified' },
  { value: 'interest_confirmed', label: 'Interested – confirmed' },
  { value: 'not_enrolled', label: 'Not enrolled' },
  { value: 'not_asked', label: 'Not answered' },
  { value: TO_VERIFY, label: 'To verify (pending + interested)' },
];
export const isStudentFilter = (v) => STUDENT_FILTERS.some((f) => f.value === v);

// Reward amounts: the backend defaults (STUDENT_VERIFIED_SPARKS, STUDENT_INTEREST_SPARKS); the toast shows what the
// server actually gave (sparksAwarded).
export const STUDENT_SPARKS = { verified: 10, interestConfirmed: 5 };

export const SPARKS_NOTE = 'Reserved – becomes spendable when Sparks launch.';

export function StudentChip({ status }) {
  const s = STUDENT_STATUS[status];
  if (!s) return <span className="muted">—</span>;
  return <span className={`pill ${s.tone}`}>{s.label}</span>;
}
