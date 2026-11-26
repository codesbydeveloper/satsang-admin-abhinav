import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { Drawer, EmptyRow, Err, fmt, fmtDate, Modal, PageHead, Pager, RefreshButton, useAction, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { fromLocalInput, isHttpsUrl, NEWS_LIMITS, newsStatus, toLocalInput } from '../home';

// News & Updates for the app's Home tab (Full Admin + Content Editor; backend /admin/news, audited news.created /
// news.updated / news.deleted). English is required, Gujarati optional (the app shows English where it is empty).
const STATUS = { published: ['Published', 'ok'], scheduled: ['Scheduled', 'info'], inactive: ['Inactive', 'muted'] };
const TABS = [['all', 'All'], ['published', 'Published'], ['scheduled', 'Scheduled'], ['inactive', 'Inactive']];

const EMPTY = () => ({ titleEn: '', titleGu: '', bodyEn: '', bodyGu: '', imageUrl: '', publishAt: toLocalInput(new Date()), pinned: false, active: true });
const fromItem = (n) => ({
  titleEn: n.title.en, titleGu: n.title.gu || '', bodyEn: n.body.en, bodyGu: n.body.gu || '',
  imageUrl: n.imageUrl || '', publishAt: toLocalInput(n.publishAt), pinned: !!n.pinned, active: !!n.active,
});
const toBody = (f) => ({
  titleEn: f.titleEn.trim(), titleGu: f.titleGu.trim() || null, bodyEn: f.bodyEn.trim(), bodyGu: f.bodyGu.trim() || null,
  imageUrl: f.imageUrl.trim() || null, publishAt: fromLocalInput(f.publishAt), pinned: f.pinned, active: f.active,
});

export function newsErrors(f) {
  const e = {};
  if (!f.titleEn.trim()) e.titleEn = 'English title is required.';
  else if (f.titleEn.trim().length > NEWS_LIMITS.title) e.titleEn = `At most ${NEWS_LIMITS.title} characters.`;
  if (!f.bodyEn.trim()) e.bodyEn = 'English text is required.';
  else if (f.bodyEn.trim().length > NEWS_LIMITS.body) e.bodyEn = `At most ${NEWS_LIMITS.body.toLocaleString()} characters.`;
  if (f.titleGu.trim().length > NEWS_LIMITS.title) e.titleGu = `At most ${NEWS_LIMITS.title} characters.`;
  if (f.bodyGu.trim().length > NEWS_LIMITS.body) e.bodyGu = `At most ${NEWS_LIMITS.body.toLocaleString()} characters.`;
  const img = f.imageUrl.trim();
  if (img && (!isHttpsUrl(img) || img.length > NEWS_LIMITS.imageUrl)) e.imageUrl = 'Use an https:// image address (at most 500 characters).';
  if (!fromLocalInput(f.publishAt)) e.publishAt = 'Choose a publish date and time.';
  return e;
}

export function StatusPill({ item }) {
  const [label, tone] = STATUS[newsStatus(item)];
  return <span className={`pill ${tone}`}>{label}</span>;
}

export default function News() {
  const [q, setQ] = useState(''); const [applied, setApplied] = useState('');
  const [status, setStatus] = useState('all'); const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);    // null | 'new' | news item
  const [deleting, setDeleting] = useState(null);
  const { busy, error, run } = useAction();
  const toast = useToast();
  const pageSize = 25;
  const load = () => run(async () => setData(await adminApi.news({ q: applied, status, page, pageSize })));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [applied, status, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  const done = (msg) => { setEditing(null); setDeleting(null); toast.show(msg); load(); };

  return (
    <div className="page">
      <PageHead title="News & Updates" subtitle="Posts on the app’s Home tab, in English and Gujarati. Pinned posts come first, then the newest. A future publish date keeps a post scheduled until then.">
        <button type="button" onClick={() => setEditing('new')}><Icon name="plus" size={16} />New post</button>
      </PageHead>
      <div className="card flush">
        <div className="toolbar">
          <form className="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q.trim()); }}>
            <Icon name="search" size={16} />
            <input placeholder="Search titles and text" aria-label="Search news" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="segmented" role="group" aria-label="Status">
            {TABS.map(([k, l]) => <button key={k} type="button" aria-pressed={status === k} onClick={() => { setStatus(k); setPage(1); }}>{l}</button>)}
          </div>
          <RefreshButton loading={busy} onClick={load} />
        </div>
        {error && <div style={{ padding: '12px 20px 0' }}><Err error={error} /></div>}
        <div className="table-scroll">
          <table aria-label="News & Updates">
            <thead><tr><th>Title</th><th>Status</th><th>Pinned</th><th>Publish date</th><th>Gujarati</th><th className="num">Actions</th></tr></thead>
            <tbody>
              {!data && !error && <EmptyRow cols={6} icon="news">Loading…</EmptyRow>}
              {data && data.items.length === 0 && <EmptyRow cols={6} icon="news">No posts{applied || status !== 'all' ? ' match these filters' : ' yet'}.</EmptyRow>}
              {data && data.items.map((n) => (
                <tr key={n.id}>
                  <td><div className="cell-main">{n.title.en}</div>{n.title.gu && <div className="cell-sub" lang="gu">{n.title.gu}</div>}</td>
                  <td><StatusPill item={n} /></td>
                  <td>{n.pinned ? <span className="pill brand">Pinned</span> : <span className="muted">—</span>}</td>
                  <td title={fmt(n.publishAt)}><div className="cell-main">{fmtDate(n.publishAt)}</div>
                    <div className="cell-sub">{new Date(n.publishAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div></td>
                  <td>{n.title.gu && n.body.gu ? 'Yes' : <span className="muted">{n.title.gu || n.body.gu ? 'Partly' : 'No (English shown)'}</span>}</td>
                  <td className="num"><div className="row-actions">
                    <button type="button" className="link" onClick={() => setEditing(n)} aria-label={`Edit ${n.title.en}`}><Icon name="edit" size={16} />Edit</button>
                    <button type="button" className="link danger" onClick={() => setDeleting(n)} aria-label={`Delete ${n.title.en}`}><Icon name="trash" size={16} />Delete</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} total={data?.total} noun="posts" onPage={setPage} />
      </div>

      {editing && <NewsEditor item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={done} />}
      {deleting && <DeleteNews item={deleting} onClose={() => setDeleting(null)} onDeleted={done} />}
      {toast.element}
    </div>
  );
}

function NewsEditor({ item, onClose, onSaved }) {
  const [initial] = useState(() => (item ? fromItem(item) : EMPTY()));
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState(false);
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const errors = newsErrors(form);
  const valid = Object.keys(errors).length === 0;
  const body = toBody(form);
  // Edit: only the fields that changed (the publish time only when the admin changed it, so seconds are kept).
  const before = toBody(initial);
  const patch = Object.fromEntries(Object.entries(body).filter(([k, v]) => (k === 'publishAt' ? form.publishAt !== initial.publishAt : v !== before[k])));
  const changed = !item || Object.keys(patch).length > 0;
  const show = (k) => (touched || form[k] !== initial[k]) && errors[k];

  const save = (e) => {
    e?.preventDefault();
    setTouched(true);
    if (!valid || !changed) return;
    run(async () => {
      if (item) await adminApi.updateNews(item.id, patch); else await adminApi.createNews(body);
      onSaved(item ? 'Post saved' : 'Post created');
    });
  };
  const field = (k, label, input, hint) => (
    <label>{label}{input}
      {show(k) ? <span className="field-error" role="alert">{errors[k]}</span> : hint && <span className="hint">{hint}</span>}
    </label>
  );
  const scheduled = body.publishAt && new Date(body.publishAt).getTime() > Date.now();

  return (
    <Drawer title={item ? 'Edit post' : 'New post'} onClose={() => { if (!busy) onClose(); }} footer={<>
      <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" onClick={save} disabled={busy || !changed || (touched && !valid)}>
        {busy && <span className="spinner" aria-hidden="true" />}{busy ? 'Saving…' : item ? 'Save changes' : 'Create post'}</button>
    </>}>
      <form onSubmit={save} noValidate>
        <h4 className="form-section">English (required)</h4>
        {field('titleEn', 'Title', <input value={form.titleEn} onChange={set('titleEn')} maxLength={NEWS_LIMITS.title} aria-invalid={!!show('titleEn') || undefined} />)}
        {field('bodyEn', 'Text', <textarea rows={5} value={form.bodyEn} onChange={set('bodyEn')} aria-invalid={!!show('bodyEn') || undefined} />)}
        <h4 className="form-section">Gujarati (optional)</h4>
        {field('titleGu', 'Gujarati title', <input lang="gu" value={form.titleGu} onChange={set('titleGu')} maxLength={NEWS_LIMITS.title} />, 'Empty: the app shows the English title.')}
        {field('bodyGu', 'Gujarati text', <textarea lang="gu" rows={5} value={form.bodyGu} onChange={set('bodyGu')} />, 'Empty: the app shows the English text.')}
        <h4 className="form-section">Details</h4>
        {field('imageUrl', 'Image URL', <input type="url" inputMode="url" placeholder="https://…" value={form.imageUrl} onChange={set('imageUrl')} aria-invalid={!!show('imageUrl') || undefined} />, 'Optional. An https:// address of the picture.')}
        {field('publishAt', 'Publish date', <input type="datetime-local" value={form.publishAt} onChange={set('publishAt')} aria-invalid={!!show('publishAt') || undefined} />,
          scheduled ? 'In the future: the post stays scheduled until then (your local time).' : 'Your local time. Now or earlier: shown at once.')}
        <label className="inline check"><input type="checkbox" checked={form.pinned} onChange={set('pinned')} />Pinned (shown first)</label>
        <label className="inline check"><input type="checkbox" checked={form.active} onChange={set('active')} />Active (untick to hide it from the app)</label>
        <Err error={error} />
      </form>
      <h4 className="form-section">Preview</h4>
      <div className="news-previews">
        <NewsPreview lang="en" form={form} />
        <NewsPreview lang="gu" form={form} />
      </div>
    </Drawer>
  );
}

// How the post reads in the app, per language. Gujarati falls back to English field by field, like the app.
export function NewsPreview({ lang, form }) {
  const gu = lang === 'gu';
  const title = (gu && form.titleGu.trim()) || form.titleEn.trim();
  const text = (gu && form.bodyGu.trim()) || form.bodyEn.trim();
  const fallback = gu && (!form.titleGu.trim() || !form.bodyGu.trim());
  const img = form.imageUrl.trim();
  return (
    <section className="news-preview" aria-label={gu ? 'Gujarati preview' : 'English preview'}>
      <div className="news-preview-head"><b>{gu ? 'Gujarati' : 'English'}</b>{form.pinned && <span className="pill brand">Pinned</span>}</div>
      {img && isHttpsUrl(img) && <img src={img} alt="" referrerPolicy="no-referrer" />}
      <div lang={gu && form.titleGu.trim() ? 'gu' : 'en'} className="news-preview-title">{title || <span className="muted">Title</span>}</div>
      <div className="cell-sub">{fromLocalInput(form.publishAt) ? fmtDate(fromLocalInput(form.publishAt)) : '—'}</div>
      <p lang={gu && form.bodyGu.trim() ? 'gu' : 'en'} className="news-preview-body">{text || <span className="muted">Text</span>}</p>
      {fallback && <p className="hint">No Gujarati {!form.titleGu.trim() && !form.bodyGu.trim() ? 'text' : !form.titleGu.trim() ? 'title' : 'text'}: the app shows the English one.</p>}
    </section>
  );
}

function DeleteNews({ item, onClose, onDeleted }) {
  const { busy, error, run } = useAction();
  return (
    <Modal title="Delete this post?" tone="danger" onClose={() => { if (!busy) onClose(); }}>
      <p><b>{item.title.en}</b> is removed from the app’s Home tab for everyone. This cannot be undone; untick “Active” instead to hide it for now.</p>
      <p className="muted">Recorded in the audit log.</p>
      <Err error={error} />
      <div className="modal-foot">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="danger-btn" disabled={busy} onClick={() => run(async () => { await adminApi.deleteNews(item.id); onDeleted('Post deleted'); })}>
          {busy && <span className="spinner" aria-hidden="true" />}{busy ? 'Deleting…' : 'Delete post'}</button>
      </div>
    </Modal>
  );
}
