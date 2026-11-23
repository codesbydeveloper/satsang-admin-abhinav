/*
 * Deletion requests — real backend calls (spec: backend /api-docs, src/routes/admin/deletionRequests.js).
 * All admin calls are Full Admin only and go through the shared api() client (admin token; a 401 logs out).
 *
 * GET  /admin/deletion-requests?status=pending|completed|rejected|all&q=&source=all|app|web&page=&pageSize=
 *      200 { status, page, pageSize, total, counts: { pending, completed, rejected, all }, rows: [Row] }
 * GET  /admin/deletion-requests/:id
 *      200 { request: Row, account: { id, email, accountType, emailVerified, createdAt } | null,
 *            profiles: [{ id, username, isChild, ageGroup, avatarKey, createdAt }] }       (account/profiles empty once completed)
 * POST /admin/deletion-requests/:id/approve   { confirm: true, note? }  200 { id, status: 'completed', accountId, profilesDeleted }
 * POST /admin/deletion-requests/:id/reject    { reason }  (3–200 chars) 200 { id, status: 'rejected', accountId }
 *      404 DELETION_REQUEST_NOT_FOUND, 409 DELETION_REQUEST_DECIDED
 * POST /public/delete-account                 { email, password, confirm: true }  (no login)  202 { requested, requestId, status, requestedAt }
 *
 * Row = { id, accountId, accountType: 'adult'|'parent', source: 'app'|'web'|'admin', status: 'pending'|'completed'|'rejected',
 *         target: 'account'|'child_profile', profileId|null, isParentEmail,   (child_profile: ONE child deleted; accountId = parent)
 *         username|null, email|null, emailRetainedUntil|null, emailVerified|null, childProfiles: number, profilesDeleted|null,
 *         requestedAt, decidedAt|null, decidedBy: { id, name }|null, decisionNote|null }
 * Timestamps are ISO UTC strings ending in "Z". username is null for parent accounts (no profile of their own).
 * Once completed, username/emailVerified are null; email is the retained copy (Full Admin only) until emailRetainedUntil,
 * then null. emailRetainedUntil is set on completed rows that kept an email (in the past once it is erased).
 * Completed rows also keep the username (the child's for child_profile) until emailRetainedUntil; after that both are
 * null and the panel shows "Details removed" + the request id. q also matches the retained username or email on
 * completed rows (Full Admin only) until they are erased, and "#123" matches request 123.
 */
import { api } from '../api';

export const PAGE_SIZE = 10;
const BASE = '/admin/deletion-requests';

export const getRequests = ({ status = 'pending', q = '', source = 'all', page = 1, pageSize = PAGE_SIZE } = {}) =>
  api(BASE, { params: { status, q, source, page, pageSize } });

export const getRequestById = (id) => api(`${BASE}/${id}`);

export const approveRequest = (id, { note } = {}) =>
  api(`${BASE}/${id}/approve`, { method: 'POST', body: { confirm: true, ...(note?.trim() ? { note: note.trim() } : {}) } });

export const rejectRequest = (id, reason) => api(`${BASE}/${id}/reject`, { method: 'POST', body: { reason: reason.trim() } });

// Public delete-account page. token: '' makes sure an admin token in this browser is never sent.
export const submitPublicRequest = (email, password) =>
  api('/public/delete-account', { method: 'POST', token: '', body: { email: email.trim(), password, confirm: true } });

export const getPendingCount = () => getRequests({ status: 'pending', pageSize: 1 }).then((r) => r.counts.pending);

// The sidebar badge listens here; the Deletion Requests page publishes counts.pending after every load.
const listeners = new Set();
export function onPendingCount(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function publishPendingCount(n) { listeners.forEach((fn) => fn(n)); }
