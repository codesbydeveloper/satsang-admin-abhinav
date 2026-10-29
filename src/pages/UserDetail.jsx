import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, AGE_GROUPS } from '../api';
import { Err, fmt, fmtDate, Modal, TypePill, useAction, YesNo } from '../components/ui';
import { Icon } from '../components/icons';
import { initials } from '../components/Layout';

const LANG = { en: 'English', gu: 'ગુજરાતી (Gujarati)' };
const MODE = { sanatan: 'Sanatan', satsang: 'Satsang' };
const RENAME_REASONS = ['Inappropriate username', 'Contains personal information', 'Impersonates someone', 'Requested by parent'];

function AgeGroupEditor({ profile, onSaved }) {
  const [value, setValue] = useState(profile.ageGroupOverridden ? profile.ageGroup : '');
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const save = (e) => { e.preventDefault(); setSaved(false); run(async () => {
    await adminApi.setAgeGroup(profile.id, value || null, reason.trim());
    setReason(''); setSaved(true); onSaved();
  }); };
  return (
    <form onSubmit={save} className="override">
      <label>Change age group
        <select value={value} onChange={(e) => setValue(e.target.value)} aria-label="Age group override">
          <option value="">Automatic (from date of birth)</option>
          {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
      <div className="override-form">
        <div className="row">
          <input placeholder="Reason (required, saved in audit log)" aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={200} required />
          <button disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
        {saved && !error && <span className="pill ok"><Icon name="check" size={13} />Saved</span>}
        <Err error={error} />
      </div>
    </form>
  );
}

function RenameDialog({ profile, onClose, onDone }) {
  const [name, setName] = useState('');
  const [reason, setReason] = useState(RENAME_REASONS[0]);
  const { busy, error, run, setError } = useAction();
  const trimmed = name.trim();
  const submit = (e) => { e.preventDefault();
    if (trimmed.toLowerCase() === profile.username.toLowerCase()) { setError(new Error('Choose a different username.')); return; }
    run(async () => { await adminApi.renameProfile(profile.id, trimmed, reason.trim()); onDone(); });
  };
  return (
    <Modal title="Rename username" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">The player sees the new name next time they open the app. Their Sparks and progress stay the same.</p>
        <div className="current-name"><span className="muted">Current username</span><b className="gu">{profile.username}</b></div>
        <label>New username
          <input value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={20} required className="gu" placeholder="3 to 20 characters" />
          <span className="hint">{trimmed.length}/20 · It is checked against the blocked-words list.</span>
        </label>
        <label>Reason
          <select value={RENAME_REASONS.includes(reason) ? reason : 'other'} onChange={(e) => setReason(e.target.value === 'other' ? '' : e.target.value)}>
            {RENAME_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value="other">Other…</option>
          </select>
        </label>
        {!RENAME_REASONS.includes(reason) && <label>Other reason<input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={200} required /></label>}
        <Err error={error} />
        <div className="modal-foot">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button disabled={busy || trimmed.length < 3}>{busy ? 'Renaming…' : 'Rename'}</button>
        </div>
      </form>
    </Modal>
  );
}

// Destructive confirmation: lists what goes, and the admin types a word to unlock the button.
function DeleteDialog({ title, confirmWord, children, actionLabel, onConfirm, onClose }) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const ok = typed.trim().toLowerCase() === confirmWord.toLowerCase() && reason.trim().length >= 3;
  return (
    <Modal title={title} tone="danger" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (ok) run(() => onConfirm(reason.trim())); }}>
        {children}
        <p className="notice danger"><Icon name="alert" size={16} /><span><strong>This cannot be undone.</strong> The action is recorded in the audit log.</span></p>
        <label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={200} placeholder="Why is this being deleted?" required /></label>
        <label>Type <code className="gu">{confirmWord}</code> to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="gu" aria-label={`Type ${confirmWord} to confirm`} />
        </label>
        <Err error={error} />
        <div className="modal-foot">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="danger-btn" disabled={busy || !ok}>{busy ? 'Deleting…' : actionLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null);   // { kind: 'rename' | 'deleteProfile' | 'deleteAccount', profile? }
  const { error, run } = useAction();
  const load = () => run(async () => setData(await adminApi.user(id)));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  const close = () => setDialog(null);
  const done = () => { close(); load(); };

  const back = <Link to="/users" className="back"><Icon name="back" size={16} />Back to users</Link>;
  if (error && !data) return <div className="page">{back}<Err error={error} /></div>;
  if (!data) return <div className="page">{back}<div className="card skeleton" style={{ height: 160 }} /><div className="card skeleton" style={{ height: 220 }} /></div>;

  const { account: a, profiles } = data;
  const children = profiles.filter((p) => p.isChild);
  return (
    <div className="page">
      {back}
      <div className="card">
        <div className="profile-top" style={{ marginBottom: 18 }}>
          <span className="avatar lg" aria-hidden="true"><Icon name={a.accountType === 'parent' ? 'users' : 'user'} size={22} /></span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ wordBreak: 'break-all' }}>{a.email}</h2>
            <div className="row" style={{ marginTop: 6, gap: 6 }}>
              <TypePill type={a.accountType} />
              <YesNo value={a.emailVerified} />
              {a.accountType === 'parent' && <span className={`pill ${a.parentPinSet ? 'ok' : 'muted'}`}><Icon name="lock" size={12} />{a.parentPinSet ? 'Parent PIN set' : 'No Parent PIN yet'}</span>}
            </div>
          </div>
        </div>
        <dl className="facts">
          <div><dt>Account ID</dt><dd>#{a.id}</dd></div>
          <div><dt>Language</dt><dd className="gu">{LANG[a.language] || a.language || '—'}</dd></div>
          <div><dt>Phone (contact only)</dt><dd>{a.phone || '—'}</dd></div>
          <div><dt>Joined</dt><dd title={fmt(a.createdAt)}>{fmtDate(a.createdAt)}</dd></div>
          <div><dt>Email verified</dt><dd>{a.emailVerifiedAt ? fmtDate(a.emailVerifiedAt) : 'Not yet'}</dd></div>
          <div><dt>Privacy consent</dt><dd>{a.consentAcceptedAt ? `${fmtDate(a.consentAcceptedAt)}${a.privacyPolicyVersion ? ` · v${a.privacyPolicyVersion}` : ''}` : '—'}</dd></div>
        </dl>
        <div className="danger-zone">
          <div>
            <b>Delete account</b>
            <p className="muted">Removes this account and {profiles.length === 1 ? 'its profile' : `all ${profiles.length} profiles`} permanently.</p>
          </div>
          <button type="button" className="danger-btn" onClick={() => setDialog({ kind: 'deleteAccount' })}><Icon name="trash" size={16} />Delete account</button>
        </div>
      </div>

      <div className="page-head">
        <div><h3>{a.accountType === 'parent' ? 'Child profiles' : 'Profile'} <span className="pill muted">{profiles.length}</span></h3>
          <p className="muted">{a.accountType === 'parent' ? 'Profiles this parent created. Children have no login of their own.' : 'The playable profile of this account.'}</p></div>
      </div>
      {profiles.length === 0 && <div className="card empty"><Icon name="child" size={28} />No profiles yet.</div>}
      <div className="profile-grid">
        {profiles.map((p) => (
          <section className="card profile-card" key={p.id} aria-label={`Profile ${p.username}`}>
            <div className="profile-top">
              <span className="avatar lg gu" aria-hidden="true">{initials(p.username)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 className="gu">{p.username}{p.isChild && <span className="tag">child</span>}</h4>
                <div className="cell-sub">Avatar: {p.avatarKey || `#${p.avatarId}`}</div>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setDialog({ kind: 'rename', profile: p })} aria-label={`Rename ${p.username}`}>
                <Icon name="edit" size={15} />Rename
              </button>
            </div>
            <dl className="facts">
              <div><dt>Age group</dt><dd>{p.ageGroup}{p.ageGroupOverridden && <span className="tag">set by admin</span>}</dd></div>
              <div><dt>Age</dt><dd>{p.age ?? '—'}</dd></div>
              <div><dt>Mode</dt><dd>{MODE[p.mode] || <span className="muted">Not chosen</span>}</dd></div>
              <div><dt>Language</dt><dd className="gu">{LANG[p.language] || p.language}</dd></div>
            </dl>
            <AgeGroupEditor profile={p} onSaved={load} />
            {p.isChild && (
              <div className="card-foot">
                <button type="button" className="link danger" onClick={() => setDialog({ kind: 'deleteProfile', profile: p })} aria-label={`Delete profile ${p.username}`}>
                  <Icon name="trash" size={15} />Delete this child profile
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
      <p className="info-note"><Icon name="shield" size={15} />Opening this page is recorded in the audit log. Passwords and Parent PINs are never shown.</p>

      {dialog?.kind === 'rename' && <RenameDialog profile={dialog.profile} onClose={close} onDone={done} />}
      {dialog?.kind === 'deleteProfile' && (
        <DeleteDialog title="Delete child profile?" confirmWord={dialog.profile.username} actionLabel="Delete profile" onClose={close}
          onConfirm={async (reason) => { await adminApi.deleteProfile(dialog.profile.id, reason); done(); }}>
          <p>You are about to delete <b className="gu">{dialog.profile.username}</b> from {a.email}. This removes:</p>
          <ul className="danger-list">
            <li>the profile and its username</li>
            <li>its Sparks, streak, scores, progress, Dress Up items and saved Shangars</li>
          </ul>
          <p className="muted">The parent account and other child profiles are not affected.</p>
        </DeleteDialog>
      )}
      {dialog?.kind === 'deleteAccount' && (
        <DeleteDialog title="Delete this account?" confirmWord={a.email} actionLabel="Delete account" onClose={close}
          onConfirm={async (reason) => {
            const r = await adminApi.deleteUserAccount(a.id, reason);
            const n = r.profilesDeleted ?? profiles.length;
            navigate('/users', { state: { notice: `${a.email} was deleted, with ${n} profile${n === 1 ? '' : 's'}.` } });
          }}>
          <p>You are about to permanently delete <b>{a.email}</b>. This removes:</p>
          <ul className="danger-list">
            <li>the account, its email and password</li>
            <li>{profiles.length === 0 ? 'no profiles (none were created)' : `${profiles.length} profile${profiles.length > 1 ? 's' : ''}`}{children.length > 0 && <>, including <b>{children.length} child profile{children.length > 1 ? 's' : ''}</b></>}</li>
            <li>all Sparks, streaks, scores, progress, Dress Up items and saved Shangars</li>
          </ul>
        </DeleteDialog>
      )}
    </div>
  );
}
