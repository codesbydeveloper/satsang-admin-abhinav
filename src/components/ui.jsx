import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icons';

// Accessible popup: Escape or a click on the backdrop closes it; focus moves into it on open.
export function Modal({ title, tone, onClose, children }) {
  const id = useId();
  const box = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {   // runs once per opening, so typing inside never loses focus
    const prev = document.activeElement;
    (box.current.querySelector('input, select, textarea, button:not(.modal-x)') || box.current).focus();
    const onKey = (e) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${tone ? ` ${tone}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={box} tabIndex={-1}>
        <div className="modal-head">
          {tone === 'danger' && <span className="modal-icon"><Icon name="alert" size={20} /></span>}
          <h3 id={id}>{title}</h3>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Side panel that slides in from the right. Escape closes it unless a popup is open on top.
export function Drawer({ title, onClose, footer, children }) {
  const id = useId();
  const box = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    box.current.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) close.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return (
    <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby={id} ref={box} tabIndex={-1}>
        <div className="drawer-head">
          <h3 id={id}>{title}</h3>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>
  );
}

// Short message in the corner; hides itself after a few seconds. tone 'error' shows it in red.
export function Toast({ message, tone, onDone }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => done.current(), 3500);
    return () => clearTimeout(t);
  }, [message]);
  if (!message) return null;
  return (
    <div className="toast-region" role={tone === 'error' ? 'alert' : 'status'}>
      <div className={`toast${tone === 'error' ? ' error' : ''}`}><Icon name={tone === 'error' ? 'alert' : 'check'} size={18} />{message}</div>
    </div>
  );
}

// Toast state for a page: show(message) or show(message, 'error').
export function useToast() {
  const [toast, setToast] = useState({ message: '' });
  const show = (message, tone) => setToast({ message, tone, at: Date.now() });   // `at` restarts the timer for a repeat message
  return { show, element: <Toast key={toast.at} message={toast.message} tone={toast.tone} onDone={() => setToast({ message: '' })} /> };
}

// Small icon button that reloads a list; the icon spins while loading.
export function RefreshButton({ loading, onClick }) {
  return (
    <button type="button" className="btn-secondary icon-btn" onClick={onClick} disabled={loading} aria-label="Refresh" title="Refresh">
      <Icon name="refresh" size={16} className={loading ? 'spin' : ''} />
    </button>
  );
}

// Calls fn when the admin comes back to this browser tab.
export function useOnTabReturn(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') ref.current(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

export const Err = ({ error }) => (error ? <p className="error" role="alert">{error.message || String(error)}</p> : null);

// Runs an async action, tracking busy/error state for a form or button.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(e); return undefined; } finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}

// The backend sends UTC DATETIMEs as 'YYYY-MM-DD HH:MM:SS' (no zone); browsers would read that as local time.
export const toDate = (d) => new Date(typeof d === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(d) ? d.replace(' ', 'T') + 'Z' : d);

export const fmt = (d) => (d ? toDate(d).toLocaleString() : '—');

// "2 min ago", "3 h ago", "Yesterday", then a date.
export function timeAgo(d, now = Date.now()) {
  if (!d) return '—';
  const s = Math.max(0, Math.round((now - toDate(d).getTime()) / 1000));
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'Yesterday';
  return toDate(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Date only, e.g. "21 Oct 2026".
export const fmtDate = (d) => (d ? toDate(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function EmptyRow({ cols, icon = 'search', children }) {
  return <tr><td colSpan={cols} className="empty"><Icon name={icon} size={28} />{children}</td></tr>;
}

export function Pager({ page, pages, total, noun, onPage }) {
  return (
    <div className="pager">
      <span>{total != null ? `${total.toLocaleString()} ${noun}` : ''}</span>
      <div className="row">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

const TYPES = { adult: ['Adult', 'info'], parent: ['Parent', 'brand'], child: ['Child', 'warn'] };
export function TypePill({ type }) {
  const [label, tone] = TYPES[type] || [type, 'muted'];
  return <span className={`pill ${tone}`}>{label}</span>;
}

export const YesNo = ({ value, yes = 'Verified', no = 'Not verified' }) => (
  <span className={`pill ${value ? 'ok dot-ok' : 'muted dot-off'}`}>{value ? yes : no}</span>
);
