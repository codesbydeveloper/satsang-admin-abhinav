/*
 * Admin "Add user" — for the backend team (endpoint not built yet).
 *
 * POST /api/v1/admin/users                                                    (Full Admin only, audited)
 *   body { email, password, accountType: 'adult' | 'parent', language: 'en' | 'gu', mode: 'sanatan' | 'satsang',
 *          phone: string | null, emailVerified: boolean }
 *   Same rules as app registration: email lower-cased; password 8–72 chars with a letter and a number;
 *   phone /^\+?[0-9 ()\-]{7,20}$/. No child profiles here: only the parent adds those, in the app.
 *   201 { id, email, accountType, emailVerified, createdAt }
 *   400 VALIDATION_ERROR { details: [{ field, message }] }    409 EMAIL_TAKEN    403 not a Full Admin
 *
 * The existing user calls (search, view, age-group override, delete) stay in src/api.js (adminApi).
 */
// import { api } from '../api';

const DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 500;

export function createUser({ email, password, accountType, language = 'en', mode = 'satsang', phone = null, emailVerified = false }) {
  // TODO: connect to real API — replace the mock below with:
  //   return api('/admin/users', { method: 'POST', body: { email, password, accountType, language, mode, phone, emailVerified } });
  void password; void language; void mode; void phone;
  return new Promise((resolve) => setTimeout(() => resolve({
    id: Date.now(), email: email.trim().toLowerCase(), accountType, emailVerified, createdAt: new Date().toISOString(),
  }), DELAY_MS));
}
