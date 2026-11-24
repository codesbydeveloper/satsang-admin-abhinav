// Thin client for the Satsang Spark backend (/api/v1). Errors come back as { error: { code, message } }.
import { API_BASE_URL } from './config.js';

const BASE = `${API_BASE_URL}/api/v1`;
// Session storage rules:
// - Remember me OFF: the admin token lives in sessionStorage only (gone when the browser closes).
// - Remember me ON: the admin token + the 30-day rolling refresh token live in localStorage.
// - The trusted-device token (DEVICE_KEY) is separate: it survives logout so this browser skips the email code.
const KEY = 'ssa_admin_token';
const REFRESH_KEY = 'ssa_admin_refresh';
export const DEVICE_KEY = 'satsang_admin_device';

const read = (store, k) => { try { return store.getItem(k); } catch { return null; } };
const write = (store, k, v) => { try { if (v) store.setItem(k, v); else store.removeItem(k); } catch { /* storage blocked: stay logged in for this page only */ } };

export function getToken() { return read(sessionStorage, KEY) || read(localStorage, KEY); }
export function getRefreshToken() { return read(localStorage, REFRESH_KEY); }
export const isRemembered = () => !!(read(localStorage, KEY) || getRefreshToken());
// Starts a session. remember: true → localStorage (token + refreshToken); false → sessionStorage (token only).
export function setSession({ token, refreshToken = null, remember = false }) {
  if (remember) { write(sessionStorage, KEY, null); write(localStorage, KEY, token); write(localStorage, REFRESH_KEY, refreshToken); }
  else { write(localStorage, KEY, null); write(localStorage, REFRESH_KEY, null); write(sessionStorage, KEY, token); }
}
// Ends the session (both storages). The trusted-device token is kept on purpose.
export function clearSession() { write(sessionStorage, KEY, null); write(localStorage, KEY, null); write(localStorage, REFRESH_KEY, null); }
// Kept for older callers: null ends the session; a token replaces the current one where it is stored.
export function setToken(t) {
  if (!t) clearSession();
  else write(isRemembered() ? localStorage : sessionStorage, KEY, t);
}
export function getDeviceToken() { return read(localStorage, DEVICE_KEY); }
export function setDeviceToken(t) { write(localStorage, DEVICE_KEY, t); }

// Expiry (seconds since epoch) of a JWT, or null if it is not a readable JWT.
export function tokenExpiry(t) {
  try {
    const part = String(t).split('.')[1];
    if (!part) return null;
    const exp = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).exp;
    return typeof exp === 'number' ? exp : null;
  } catch { return null; }
}
export const REFRESH_EARLY_SECONDS = 60;   // renew this long before the admin token runs out
const expiresSoon = (t) => { const exp = tokenExpiry(t); return exp !== null && exp * 1000 - Date.now() < REFRESH_EARLY_SECONDS * 1000; };

// One refresh at a time: parallel requests share it (a refresh token works only once).
let refreshing = null;
let onRefreshed = () => {};
export function setRefreshedHandler(fn) { onRefreshed = fn; }
export function refreshSession() {
  if (refreshing) return refreshing;
  const rt = getRefreshToken();
  if (!rt) return Promise.resolve(null);
  refreshing = (async () => {
    try {
      const r = await api('/admin/auth/refresh', { method: 'POST', token: '', body: { refreshToken: rt } });
      setSession({ token: r.token, refreshToken: r.refreshToken, remember: true });
      onRefreshed(r);
      return r.token;
    } catch (e) {
      // 401 REFRESH_INVALID (logged out, password/role changed, 30 days passed): the session is over.
      // A network error keeps it, so a short outage does not sign anyone out.
      if (e.status === 401) clearSession();
      return null;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export class ApiError extends Error {
  // details: field errors from a 400, e.g. [{ field: 'email', message: '…' }]
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

const isAuthPath = (path) => path.startsWith('/admin/auth/') || path.startsWith('/public/');

// raw: true returns the fetch Response itself on success (file downloads); errors are still read as JSON.
export async function api(path, { method = 'GET', body, token, params, raw = false, retried = false } = {}) {
  const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')).toString() : '';
  // token: undefined = "use the admin session". /admin/auth/me is the session check on start, so it counts too.
  const sessionCall = token === undefined && (!isAuthPath(path) || path === '/admin/auth/me');
  // Remember me: renew the admin token just before it runs out (or when only the refresh token is left).
  if (sessionCall && getRefreshToken() && (!getToken() || expiresSoon(getToken()))) await refreshSession();
  const t = token ?? getToken();
  let res;
  try {
    res = await fetch(`${BASE}${path}${qs}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.');
  }
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    // A stale admin session (never the login steps): try the refresh token once, else back to login.
    if (res.status === 401 && sessionCall) {
      if (!retried && getRefreshToken() && await refreshSession()) return api(path, { method, body, params, raw, retried: true });
      if (!isAuthPath(path)) onUnauthorized();
    }
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Request failed (${res.status})`, e.details);
  }
  return data;
}

export const adminApi = {
  // Step 1. A trusted device (deviceToken) can finish here with step: 'done'; otherwise step: 'email_otp'.
  login: (email, password, { deviceToken, rememberMe = false } = {}) => api('/admin/auth/login', { method: 'POST', token: '',
    body: { email, password, rememberMe, ...(deviceToken ? { deviceToken } : {}) } }),
  // Step 2: the 6-digit code emailed after a correct password. token: '' so no admin token is ever sent with it.
  // trustDevice: true → the answer carries a new deviceToken for this browser.
  verifyOtp: (challengeToken, code, trustDevice = false) => api('/admin/auth/verify-otp', { method: 'POST', token: '',
    body: { challengeToken, code, ...(trustDevice ? { trustDevice: true } : {}) } }),
  resendOtp: (challengeToken) => api('/admin/auth/resend-otp', { method: 'POST', token: '', body: { challengeToken } }),
  me: () => api('/admin/auth/me'),
  logout: () => api('/admin/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) => api('/admin/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  // Trusted devices: your own (both roles) and, for Full Admins, any admin's.
  myDevices: () => api('/admin/me/devices'),
  removeMyDevice: (id) => api(`/admin/me/devices/${id}`, { method: 'DELETE' }),
  adminDevices: (adminId) => api(`/admin/admins/${adminId}/devices`),
  removeAdminDevice: (adminId, deviceId) => api(`/admin/admins/${adminId}/devices/${deviceId}`, { method: 'DELETE' }),
  admins: () => api('/admin/admins'),   // { admins, fullAdminLimit: { max, used } }
  createAdmin: (b) => api('/admin/admins', { method: 'POST', body: b }),
  updateAdmin: (id, b) => api(`/admin/admins/${id}`, { method: 'PATCH', body: b }),   // { role? , active? }
  resendInvite: (id) => api(`/admin/admins/${id}/resend-invite`, { method: 'POST' }),
  cancelInvite: (id) => api(`/admin/admins/${id}`, { method: 'DELETE' }),
  // Public invite page: token: '' so an admin token in this browser is never sent along.
  inviteInfo: (inviteToken) => api(`/admin/auth/invite/${encodeURIComponent(inviteToken)}`, { token: '' }),
  acceptInvite: (inviteToken, password) => api('/admin/auth/accept-invite', { method: 'POST', token: '', body: { token: inviteToken, password } }),
  resetAdminPassword: (id, newPassword) => api(`/admin/admins/${id}/reset-password`, { method: 'POST', body: { newPassword } }),
  users: (params) => api('/admin/users', { params }),
  // Export to CSV (Full Admin; audited users.exported): the same filters and sort as users(), every page.
  // Returns { blob, filename }; the server names it satsang-spark-users-YYYY-MM-DD.csv.
  exportUsersCsv: async (params) => {
    const res = await api('/admin/users/export.csv', { params, raw: true });
    const m = /filename="?([^";]+)"?/i.exec(res.headers?.get?.('content-disposition') || '');
    return { blob: await res.blob(), filename: m ? m[1] : `satsang-spark-users-${new Date().toISOString().slice(0, 10)}.csv` };
  },
  user: (id) => api(`/admin/users/${id}`),
  // Loyadham Online Satsang Classes: action 'verify' | 'reject' | 'confirm_interest' | 'reset' (Full Admin; audited).
  studentStatusAction: (profileId, action) => api(`/admin/profiles/${profileId}/student-status`, { method: 'POST', body: { action } }),
  setAgeGroup: (profileId, ageGroup, reason) => api(`/admin/users/profiles/${profileId}/age-group`, { method: 'PATCH', body: { ageGroup, reason } }),
  words: () => api('/admin/blocked-words'),
  addWord: (word, kind) => api('/admin/blocked-words', { method: 'POST', body: { word, kind } }),
  removeWord: (id) => api(`/admin/blocked-words/${id}`, { method: 'DELETE' }),
  audit: (params) => api('/admin/audit-log', { params }),
  // One call fills the whole dashboard; the 7/30-day toggle slices the 30-day series in the browser.
  dashboard: () => api('/admin/dashboard', { params: { days: 30, recent: 5, activity: 10 } }),
  // Deletion requests (list, approve, reject): SAMPLE DATA in src/api/deletionRequests.js until the backend has them.
  // Deletes the account and every profile on it (a parent's child profiles too); reason is audited.
  // Referrals (Full Admin): settings (audited as referral_settings.updated) and the list (usernames, never emails).
  referralSettings: () => api('/admin/referrals/settings'),
  saveReferralSettings: (settings) => api('/admin/referrals/settings', { method: 'PUT', body: settings }),
  referrals: (params) => api('/admin/referrals', { params }),
  // For a parent: deletes the parent account and every child profile (the parent is emailed; email kept 30 days).
  deleteUserAccount: (accountId, reason) => api(`/admin/users/${accountId}`, { method: 'DELETE', body: { confirm: true, reason } }),
  // Deletes ONE child profile and only its own data; the parent and other children are untouched (audited child.deleted).
  // 200 { deleted, profileId, parentAccountId, sessionsEnded }; 409 NOT_A_CHILD_PROFILE for an adult's own profile.
  deleteProfile: (profileId, reason) => api(`/admin/users/profiles/${profileId}`, { method: 'DELETE', body: { confirm: true, reason } }),
  // NOT CONNECTED YET: the screen is designed, the backend endpoint doesn't exist. Suggested route:
  //   renameProfile: PATCH  /admin/users/profiles/:id/username { username, reason }
  renameProfile: (_profileId, _username, _reason) => notConnected(),
};

const notConnected = () => Promise.reject(new ApiError(501, 'NOT_CONNECTED', 'This action is designed but not connected to the server yet. Nothing was changed.'));

// The public delete-account page uses submitPublicRequest in src/api/deletionRequests.js (sample data for now).
// When it is connected, call api(..., { token: '' }) so an admin token in this browser is never sent.

// Age groups (keys + display labels): src/ageGroups.js is the one list.
