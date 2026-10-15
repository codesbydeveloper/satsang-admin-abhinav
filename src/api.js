// Thin client for the Satsang Spark backend (/api/v1). Errors come back as { error: { code, message } }.
const BASE = `${import.meta.env.VITE_API_BASE || ''}/api/v1`;
const KEY = 'ssa_admin_token';

export function getToken() { try { return sessionStorage.getItem(KEY); } catch { return null; } }
export function setToken(t) { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch { /* storage blocked: stay logged in for this page only */ } }

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
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
    if (res.status === 401 && !token && !path.startsWith('/admin/auth/')) onUnauthorized();
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Request failed (${res.status})`);
  }
  return data;
}

export const adminApi = {
  login: (email, password) => api('/admin/auth/login', { method: 'POST', body: { email, password } }),
  totpSetup: (stepToken) => api('/admin/auth/totp/setup', { method: 'POST', token: stepToken }),
  totpEnable: (stepToken, code) => api('/admin/auth/totp/enable', { method: 'POST', token: stepToken, body: { code } }),
  totpVerify: (stepToken, code) => api('/admin/auth/totp/verify', { method: 'POST', token: stepToken, body: { code } }),
  me: () => api('/admin/auth/me'),
  logout: () => api('/admin/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) => api('/admin/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  admins: () => api('/admin/admins'),
  createAdmin: (b) => api('/admin/admins', { method: 'POST', body: b }),
  updateAdmin: (id, b) => api(`/admin/admins/${id}`, { method: 'PATCH', body: b }),
  resetAdmin2fa: (id) => api(`/admin/admins/${id}/reset-2fa`, { method: 'POST' }),
  resetAdminPassword: (id, newPassword) => api(`/admin/admins/${id}/reset-password`, { method: 'POST', body: { newPassword } }),
  users: (params) => api('/admin/users', { params }),
  user: (id) => api(`/admin/users/${id}`),
  setAgeGroup: (profileId, ageGroup, reason) => api(`/admin/users/profiles/${profileId}/age-group`, { method: 'PATCH', body: { ageGroup, reason } }),
  words: () => api('/admin/blocked-words'),
  addWord: (word, kind) => api('/admin/blocked-words', { method: 'POST', body: { word, kind } }),
  removeWord: (id) => api(`/admin/blocked-words/${id}`, { method: 'DELETE' }),
  audit: (params) => api('/admin/audit-log', { params }),
};

export const AGE_GROUPS = ['Shishu', 'Bals/Balikas A', 'Bals/Balikas B', 'Bals/Balikas C', 'Kishors/Kishoris A', 'Kishors/Kishoris B', 'Yuvak/Yuvatis A', 'Yuvaks/Yuvatis B', 'Vadil'];
