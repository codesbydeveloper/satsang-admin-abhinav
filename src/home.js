import { toDate } from './components/ui';

// Home tab admin (M2 chunk 2.3C; backend 2.3A /admin/news, /admin/feedback, /admin/home/*). Limits match the backend.
export const NEWS_LIMITS = { title: 150, body: 10000, imageUrl: 500 };
export const SPIN_LIMITS = { minSegments: 2, maxSegments: 12, maxSparks: 10000, maxWeight: 1000, label: 40 };
export const STREAK_DAYS = 7;           // day 1–7 shown one by one, then "every day after"
export const MAX_STREAK_SPARKS = 10000;
export const DONATE_MAX = 255;
export const CONFIRM_NOTE = 'Values to be confirmed by Loyadham.';

export const FEEDBACK_CATEGORIES = { bug: ['Bug', 'err'], idea: ['Idea', 'info'], other: ['Other', 'muted'] };

// An https address with a host. The backend accepts http for Donate too; the panel asks for https only.
export function isHttpsUrl(s) {
  try { const u = new URL(String(s).trim()); return u.protocol === 'https:' && !!u.hostname; } catch { return false; }
}

// A whole number from min to max, or NaN.
export const wholeNumber = (v, min, max) => {
  const s = String(v ?? '').trim();
  if (!/^\d+$/.test(s)) return NaN;
  const n = Number(s);
  return n >= min && n <= max ? n : NaN;
};

// published (active, date passed) | scheduled (active, future) | inactive. Same rules as the backend's status filter.
export function newsStatus(item, now = Date.now()) {
  if (!item.active) return 'inactive';
  return toDate(item.publishAt).getTime() > now ? 'scheduled' : 'published';
}

// <input type="datetime-local"> works in the admin's local time; the backend wants ISO (UTC).
const pad = (n) => String(n).padStart(2, '0');
export function toLocalInput(d) {
  const x = toDate(d);
  if (!d || Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}
export function fromLocalInput(v) {
  const x = new Date(v);   // "YYYY-MM-DDTHH:mm" without a zone is local time
  return v && !Number.isNaN(x.getTime()) ? x.toISOString() : null;
}

// Daily Spin: each segment's chance (weight / total weight) and the average Sparks one spin pays.
export function spinStats(segments) {
  const total = segments.reduce((n, s) => n + (Number.isFinite(s.weight) ? s.weight : 0), 0);
  if (!total) return { total: 0, chances: segments.map(() => 0), average: 0 };
  return {
    total,
    chances: segments.map((s) => (Number.isFinite(s.weight) ? (s.weight / total) * 100 : 0)),
    average: segments.reduce((n, s) => n + (Number.isFinite(s.weight) && Number.isFinite(s.sparks) ? s.sparks * s.weight : 0), 0) / total,
  };
}
export const pct = (n) => `${(Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
export const avg = (n) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

// Streak: the backend keeps amounts[N-1] for streak day N and repeats the last one. The panel shows day 1–7 and
// "every day after" (= day 8 onwards), so it always saves 8 values.
export function streakForm(amounts) {
  const last = amounts[amounts.length - 1] ?? 0;
  const days = Array.from({ length: STREAK_DAYS }, (_, i) => amounts[i] ?? last);
  return { days, after: amounts[STREAK_DAYS] ?? last };
}
export const streakAmounts = (days, after) => [...days, after];
