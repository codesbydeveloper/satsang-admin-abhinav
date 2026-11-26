// Sparks economy (Milestone 2, backend chunk 2.1): one ledger per playable profile. The backend is authoritative;
// the panel only shows balances/history and sends admin adjustments and reward-config changes.
// Backend: satsang-backend src/services/sparks.js, docs/postman-sparks.md.

// Ledger entry types (sparks.TYPES on the backend). Unknown types are shown as sent.
export const SPARKS_TYPES = {
  signup_bonus: 'Sign-up bonus',
  student_verified: 'Student verified',
  student_interest: 'Class interest confirmed',
  referral: 'Referral',
  explore_import: 'Explore (before sign-up)',
  daily_spin: 'Daily Spin',
  streak: 'Streak',
  quiz: 'Quiz',
  game: 'Game',
  puzzle: 'Puzzle',
  learn: 'Learn',
  purchase: 'Purchase',
  admin_adjust: 'Admin adjustment',
};
export const sparksTypeLabel = (t) => SPARKS_TYPES[t] || t;

export const SPARKS_STATUS = {
  verified: ['Verified', 'ok'],
  pending: ['Pending', 'warn'],
  reversed: ['Reversed', 'muted'],
};

// Activities whose reward is configured per age group (sparks_reward_config; order as the backend sends them).
export const REWARD_ACTIVITIES = { quiz: 'Quiz', game: 'Game', puzzle: 'Puzzle', learn: 'Learn' };
export const MAX_REWARD = 10000;      // PUT /admin/sparks/config: 0–10000
export const MAX_ADJUST = 1000000;    // POST /admin/profiles/:id/sparks/adjust: ±1,000,000, never 0

/** "+50" / "−20" (true minus sign) with thousands separators. */
export const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()}`;

/** A fresh idempotency key for one adjustment (the backend accepts 1–64 of a-z 0-9 _ . : -). */
export function newAdjustId() {
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `admin-adjust-${r}`.toLowerCase().slice(0, 64);
}

/** The INSUFFICIENT_SPARKS message for an ApiError (details: { balance, needed }), else null. */
export function insufficientMessage(e) {
  if (e?.code !== 'INSUFFICIENT_SPARKS') return null;
  const d = e.details || {};
  return typeof d.balance === 'number'
    ? `Not enough Sparks: the balance is ${d.balance.toLocaleString()}${typeof d.needed === 'number' ? `, this needs ${d.needed.toLocaleString()}` : ''}. Nothing was changed.`
    : 'Not enough Sparks: the balance cannot go below zero. Nothing was changed.';
}
