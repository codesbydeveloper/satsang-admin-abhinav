// Thin client for the Satsang Spark backend (/api/v1). Errors come back as { error: { code, message } }.
import { API_BASE_URL } from './config.js';

const BASE = `${API_BASE_URL}/api/v1`;
const KEY = 'ssa_admin_token';

export function getToken() { try { return sessionStorage.getItem(KEY); } catch { return null; } }
export function setToken(t) { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch { /* storage blocked: stay logged in for this page only */ } }

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export class ApiError extends Error {
  // details: field errors from a 400, e.g. [{ field: 'email', message: '…' }]
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

export async function api(path, { method = 'GET', body, token, params } = {}) {
  const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')).toString() : '';
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    // A stale admin session: send the person back to login (not for the login steps themselves).
    if (res.status === 401 && !token && !path.startsWith('/admin/auth/') && !path.startsWith('/public/')) onUnauthorized();
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Request failed (${res.status})`, e.details);
  }
  return data;
}

export const adminApi = {
  login: (email, password) => api('/admin/auth/login', { method: 'POST', token: '', body: { email, password } }),
  // Step 2: the 6-digit code emailed after a correct password. token: '' so no admin token is ever sent with it.
  verifyOtp: (challengeToken, code) => api('/admin/auth/verify-otp', { method: 'POST', token: '', body: { challengeToken, code } }),
  resendOtp: (challengeToken) => api('/admin/auth/resend-otp', { method: 'POST', token: '', body: { challengeToken } }),
  me: () => api('/admin/auth/me'),
  logout: () => api('/admin/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) => api('/admin/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  admins: () => api('/admin/admins'),
  createAdmin: (b) => api('/admin/admins', { method: 'POST', body: b }),
  updateAdmin: (id, b) => api(`/admin/admins/${id}`, { method: 'PATCH', body: b }),   // { role? , active? }
  resendInvite: (id) => api(`/admin/admins/${id}/resend-invite`, { method: 'POST' }),
  cancelInvite: (id) => api(`/admin/admins/${id}`, { method: 'DELETE' }),
  // Public invite page: token: '' so an admin token in this browser is never sent along.
  inviteInfo: (inviteToken) => api(`/admin/auth/invite/${encodeURIComponent(inviteToken)}`, { token: '' }),
  acceptInvite: (inviteToken, password) => api('/admin/auth/accept-invite', { method: 'POST', token: '', body: { token: inviteToken, password } }),
  resetAdminPassword: (id, newPassword) => api(`/admin/admins/${id}/reset-password`, { method: 'POST', body: { newPassword } }),
  users: (params) => api('/admin/users', { params }),
  user: (id) => api(`/admin/users/${id}`),
  // Loyadham Online Classes: action 'verify' | 'reject' | 'confirm_interest' | 'reset' (Full Admin; audited).
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
  deleteUserAccount: (accountId, reason) => api(`/admin/users/${accountId}`, { method: 'DELETE', body: { confirm: true, reason } }),
  // NOT CONNECTED YET: the screens are designed, the backend endpoints don't exist. Suggested routes:
  //   renameProfile: PATCH  /admin/users/profiles/:id/username { username, reason }
  //   deleteProfile: DELETE /admin/users/profiles/:id          { confirm: true, reason }   (child profiles)
  renameProfile: (_profileId, _username, _reason) => notConnected(),
  deleteProfile: (_profileId, _reason) => notConnected(),
};

const notConnected = () => Promise.reject(new ApiError(501, 'NOT_CONNECTED', 'This action is designed but not connected to the server yet. Nothing was changed.'));

// The public delete-account page uses submitPublicRequest in src/api/deletionRequests.js (sample data for now).
// When it is connected, call api(..., { token: '' }) so an admin token in this browser is never sent.

// Age groups (keys + display labels): src/ageGroups.js is the one list.
