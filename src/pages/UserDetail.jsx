import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../api';
import { AGE_GROUPS, ageGroupLabel } from '../ageGroups';
import { useAuth } from '../auth';
import { Err, fmt, fmtDate, Modal, TypePill, useAction, useToast, YesNo } from '../components/ui';
import { SPARKS_NOTE, STUDENT_SPARKS, STUDENT_STATUS, StudentChip } from '../studentStatus';
import { Icon } from '../components/icons';
import { initials } from '../components/Layout';
import SparksPanel from '../components/SparksPanel';

const LANG = { en: 'English', gu: 'ગુજરાતી (Gujarati)' };
const MODE = { sanatan: 'Sanatan', satsang: 'Satsang' };
const GENDER = { male: 'Male', female: 'Female', prefer_not_to_say: 'Prefer not to say' };
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
          {AGE_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
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

// Loyadham Online Satsang Classes: the admin actions each status allows (backend: utils/studentStatus.js TRANSITIONS).
const STUDENT_ACTIONS = {
  verify: {
    label: `Verify student (+${STUDENT_SPARKS.verified} Sparks)`, title: 'Verify this student?', confirm: 'Verify student',
    body: (u) => <>Confirm that <b className="gu">{u}</b> is enrolled in Loyadham Online Satsang Classes. {STUDENT_SPARKS.verified} Sparks are added to this profile’s Sparks balance (given once only).</>,
    done: (u, n) => `${u} verified as a student${n ? ` · +${n} Sparks added to the balance` : ' · no new Sparks (already given before)'}`,
  },
  reject: {
    label: 'Reject', title: 'Reject this enrolment?', confirm: 'Reject', secondary: true,
    body: (u) => <>The status of <b className="gu">{u}</b> becomes “Not enrolled”. No Sparks are given; the user can answer again in the app.</>,
    done: (u) => `${u}: enrolment rejected`,
  },
  confirm_interest: {
    label: `Confirm interest (+${STUDENT_SPARKS.interestConfirmed} Sparks)`, title: 'Confirm this interest?', confirm: 'Confirm interest',
    body: (u) => <>Confirm that <b className="gu">{u}</b> is interested in joining Loyadham Online Satsang Classes. {STUDENT_SPARKS.interestConfirmed} Sparks are added to this profile’s Sparks balance (given once only).</>,
    done: (u, n) => `${u}: interest confirmed${n ? ` · +${n} Sparks added to the balance` : ' · no new Sparks (already given before)'}`,
  },
  reset: {
    label: 'Reset', title: 'Reset the student status?', confirm: 'Reset', secondary: true,
    body: (u) => <>The status of <b className="gu">{u}</b> goes back to “Not answered”, and the app asks the question again. <b>Sparks already given are not taken back.</b></>,
    done: (u) => `${u}: student status reset`,
  },
};
const actionsFor = (status) => (
  status === 'pending_verification' ? ['verify', 'reject']
    : status === 'interested' ? ['confirm_interest']
      : status && status !== 'not_asked' && STUDENT_STATUS[status] ? ['reset'] : []);

function StudentConfirm({ profile, action, onClose, onDone }) {
  const a = STUDENT_ACTIONS[action];
  const { busy, error, run } = useAction();
  const go = () => run(async () => { const r = await adminApi.studentStatusAction(profile.id, action); onDone(a.done(profile.username, r.sparksAwarded)); });
  return (
    <Modal title={a.title} onClose={onClose}>
      <p>{a.body(profile.username)}</p>
      <p className="muted">Recorded in the audit log.</p>
      <Err error={error} />
      <div className="modal-foot">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" onClick={go} disabled={busy}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? 'Saving…' : a.confirm}</button>
      </div>
    </Modal>
  );
}

function StudentSection({ profile: p, canAct, onAction }) {
  const actions = canAct ? actionsFor(p.studentStatus) : [];
  const confirmedBy = p.studentStatus === 'interest_confirmed' ? 'Confirmed by' : 'Verified by';
  return (
    <div className="student" role="group" aria-label={`Loyadham Online Satsang Classes for ${p.username}`}>
      <div className="student-head"><h5>Loyadham Online Satsang Classes</h5><StudentChip status={p.studentStatus || 'not_asked'} /></div>
      <dl className="facts">
        {p.studentVerifiedAt && <div><dt>{confirmedBy}</dt><dd>{p.studentVerifiedByName || (p.studentVerifiedBy ? `Admin #${p.studentVerifiedBy}` : '—')}</dd></div>}
        {p.studentVerifiedAt && <div><dt>{confirmedBy === 'Verified by' ? 'Verified on' : 'Confirmed on'}</dt><dd title={fmt(p.studentVerifiedAt)}>{fmtDate(p.studentVerifiedAt)}</dd></div>}
        <div><dt>Class Sparks given</dt><dd>{(p.studentSparksAwarded ?? 0).toLocaleString()}</dd></div>
        {p.studentStatusUpdatedAt && <div><dt>Last change</dt><dd title={fmt(p.studentStatusUpdatedAt)}>{fmtDate(p.studentStatusUpdatedAt)}</dd></div>}
      </dl>
      <p className="sparks-note">{SPARKS_NOTE}</p>
      {actions.length > 0 && (
        <div className="student-actions">
          {actions.map((k) => (
            <button key={k} type="button" className={`btn-sm${STUDENT_ACTIONS[k].secondary ? ' btn-secondary' : ''}`} onClick={() => onAction(p, k)}
              aria-label={`${STUDENT_ACTIONS[k].label} for ${p.username}`}>{STUDENT_ACTIONS[k].label}</button>
          ))}
        </div>
      )}
      {actions.includes('reset') && <span className="hint">Reset: Sparks already given are not taken back.</span>}
    </div>
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
  const [dialog, setDialog] = useState(null);   // { kind: 'rename' | 'deleteProfile' | 'deleteAccount' | 'student', profile?, action? }
  const { isFull } = useAuth();   // student-status actions: Full Admin only (the backend answers 403 otherwise)
  const toast = useToast();
  const { error, run } = useAction();
  const load = () => run(async () => setData(await adminApi.user(id)));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  // Admin names for "Admin / reason" in the Sparks history (Full Admin only; falls back to "Admin #id").
  const [admins, setAdmins] = useState({});
  useEffect(() => {
    if (!isFull) return undefined;
    let live = true;
    adminApi.admins().then((r) => { if (live) setAdmins(Object.fromEntries((r.admins || []).map((x) => [x.id, x.name || x.email]))); }).catch(() => { /* optional */ });
    return () => { live = false; };
  }, [isFull]);
  const close = () => setDialog(null);
  const done = () => { close(); load(); };

  const back = <Link to="/users" className="back"><Icon name="back" size={16} />Back to users</Link>;
  if (error && !data) return <div className="page">{back}<Err error={error} /></div>;
  if (!data) return <div className="page">{back}<div className="card skeleton" style={{ height: 160 }} /><div className="card skeleton" style={{ height: 220 }} /></div>;

  const { account: a, profiles } = data;
  const children = profiles.filter((p) => p.isChild);
  const isParent = a.accountType === 'parent';
  const kidsText = (n) => `${n} child profile${n === 1 ? '' : 's'}`;
  const deleteAccountLabel = isParent ? 'Delete parent account and all child profiles' : 'Delete account';
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
          {/* private Sign Up details; null for accounts created before Sign Up asked for them */}
          <div><dt>First name</dt><dd className="gu">{a.firstName || '—'}</dd></div>
          <div><dt>Last name</dt><dd className="gu">{a.lastName || '—'}</dd></div>
          <div><dt>Gender</dt><dd>{GENDER[a.gender] || a.gender || '—'}</dd></div>
          <div><dt>Language</dt><dd className="gu">{LANG[a.language] || a.language || '—'}</dd></div>
          <div><dt>Phone (contact only)</dt><dd>{a.phone || '—'}</dd></div>
          <div><dt>Joined</dt><dd title={fmt(a.createdAt)}>{fmtDate(a.createdAt)}</dd></div>
          <div><dt>Email verified</dt><dd>{a.emailVerifiedAt ? fmtDate(a.emailVerifiedAt) : 'Not yet'}</dd></div>
          <div><dt>Privacy consent</dt><dd>{a.consentAcceptedAt ? `${fmtDate(a.consentAcceptedAt)}${a.privacyPolicyVersion ? ` · v${a.privacyPolicyVersion}` : ''}` : '—'}</dd></div>
        </dl>
        {/* Deleting is Full Admin only (the backend answers 403 otherwise). */}
        {isFull && (
          <div className="danger-zone">
            <div>
              <b>{deleteAccountLabel}</b>
              <p className="muted">{isParent
                ? <>Removes the parent account and {children.length === 0 ? 'its child profiles (none yet)' : `all ${kidsText(children.length)}`} permanently. To remove one child only, use “Delete this child profile” on that child.</>
                : <>Removes this account and {profiles.length === 1 ? 'its profile' : `all ${profiles.length} profiles`} permanently.</>}</p>
            </div>
            <button type="button" className="danger-btn" onClick={() => setDialog({ kind: 'deleteAccount' })}><Icon name="trash" size={16} />{deleteAccountLabel}</button>
          </div>
        )}
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
              <div><dt>Age group</dt><dd>{ageGroupLabel(p.ageGroup) || '—'}{p.ageGroupOverridden && <span className="tag">set by admin</span>}</dd></div>
              <div><dt>Age</dt><dd>{p.age ?? '—'}</dd></div>
              <div><dt>Mode</dt><dd>{MODE[p.mode] || <span className="muted">Not chosen</span>}</dd></div>
              <div><dt>Language</dt><dd className="gu">{LANG[p.language] || p.language}</dd></div>
            </dl>
            <StudentSection profile={p} canAct={isFull} onAction={(profile, action) => setDialog({ kind: 'student', profile, action })} />
            {/* Sparks belong to the playable profile (own profile or each child). Key: reload after a student action. */}
            {isFull && <SparksPanel key={`${p.id}-${p.studentStatus}-${p.studentSparksAwarded}`} profile={p} canAdjust={isFull} adminName={(aid) => admins[aid]} onToast={toast.show} />}
            <AgeGroupEditor profile={p} onSaved={load} />
            {p.isChild && isFull && (
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

      {dialog?.kind === 'student' && (
        <StudentConfirm profile={dialog.profile} action={dialog.action} onClose={close} onDone={(msg) => { done(); toast.show(msg); }} />
      )}
      {toast.element}
      {dialog?.kind === 'rename' && <RenameDialog profile={dialog.profile} onClose={close} onDone={done} />}
      {dialog?.kind === 'deleteProfile' && (
        <DeleteDialog title="Delete this child profile?" confirmWord={dialog.profile.username} actionLabel="Delete child profile" onClose={close}
          onConfirm={async (reason) => {
            const name = dialog.profile.username;
            await adminApi.deleteProfile(dialog.profile.id, reason);
            done(); toast.show(`${name} was deleted. The parent account and other children were not changed.`);
          }}>
          <p>Child profile: <b className="gu">{dialog.profile.username}</b> <span className="muted">(parent: {a.email})</span></p>
          <p className="notice info"><Icon name="shield" size={16} /><span>Only this child is deleted. The parent and other children keep their accounts, progress and Sparks.</span></p>
          <p>This removes the child’s username and its own data: progress, activity, Loyadham Online Satsang Classes status and its Sparks balance and history.</p>
        </DeleteDialog>
      )}
      {dialog?.kind === 'deleteAccount' && (
        <DeleteDialog title={isParent ? 'Delete parent account and all child profiles?' : 'Delete this account?'} confirmWord={a.email}
          actionLabel={isParent ? 'Delete parent and children' : 'Delete account'} onClose={close}
          onConfirm={async (reason) => {
            const r = await adminApi.deleteUserAccount(a.id, reason);
            const n = r.profilesDeleted ?? profiles.length;
            navigate('/users', { state: { notice: `${a.email} was deleted, with ${n} profile${n === 1 ? '' : 's'}.` } });
          }}>
          {isParent ? <>
            <p>Parent account: <b>{a.email}</b></p>
            <p className="delete-kids">{children.length === 0 ? 'This parent has no child profiles.'
              : <>This will delete {kidsText(children.length)}: <b className="gu">{children.map((c) => c.username).join(', ')}</b></>}</p>
          </> : <p>You are about to permanently delete <b>{a.email}</b>.</p>}
          <p>This removes:</p>
          <ul className="danger-list">
            <li>the account, its email and password{isParent && ' and the Parent PIN'}</li>
            <li>{profiles.length === 0 ? 'no profiles (none were created)' : `${profiles.length} profile${profiles.length > 1 ? 's' : ''}`}{children.length > 0 && <>, including <b>{children.length} child profile{children.length > 1 ? 's' : ''}</b></>}</li>
            <li>all Sparks, streaks, scores, progress, Dress Up items and saved Shangars</li>
          </ul>
          <p className="muted">A deletion confirmation is emailed to {a.email}. The email{isParent ? '' : ' and username'} stay visible to Full Admins in Deletion requests → Completed for 30 days.</p>
        </DeleteDialog>
      )}
    </div>
  );
}
