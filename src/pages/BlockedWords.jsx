import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { Err, PageHead, useAction } from '../components/ui';
import { Icon } from '../components/icons';

export default function BlockedWords() {
  const [words, setWords] = useState(null);
  const [word, setWord] = useState(''); const [kind, setKind] = useState('blocked'); const [filter, setFilter] = useState('');
  const [show, setShow] = useState('all');
  const { busy, error, run } = useAction();
  const load = () => run(async () => setWords((await adminApi.words()).words));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const add = (e) => { e.preventDefault(); run(async () => { await adminApi.addWord(word.trim(), kind); setWord(''); await load(); }); };
  const remove = (w) => { if (window.confirm(`Remove "${w.word}" from the list?`)) run(async () => { await adminApi.removeWord(w.id); await load(); }); };
  const all = words || [];
  const shown = all.filter((w) => w.word.includes(filter.toLowerCase()) && (show === 'all' || w.kind === show));
  const count = (k) => all.filter((w) => w.kind === k).length;

  return (
    <div className="page">
      <PageHead title="Blocked words" subtitle="Usernames containing a blocked or reserved word are refused when someone signs up or renames a profile." />
      <div className="card">
        <div className="card-head"><div><h3>Add a word</h3>
          <p className="muted">Add English words, Gujarati-script words and Gujarati written in English letters. Look-alike spellings (e.g. 1 for i) are matched automatically.</p></div></div>
        <form className="row" onSubmit={add}>
          <input placeholder="Word or phrase" aria-label="Word or phrase" value={word} onChange={(e) => setWord(e.target.value)} minLength={2} maxLength={100} required style={{ flex: 1, minWidth: 200 }} className="gu" />
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
            <option value="blocked">Blocked (offensive)</option><option value="reserved">Reserved (official names)</option>
          </select>
          <button disabled={busy}><Icon name="plus" size={16} />Add</button>
        </form>
        <Err error={error} />
      </div>

      <div className="card flush">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <input placeholder="Filter list" aria-label="Filter list" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="segmented" role="group" aria-label="Show">
            {[['all', `All ${all.length}`], ['blocked', `Blocked ${count('blocked')}`], ['reserved', `Reserved ${count('reserved')}`]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>
            ))}
          </div>
        </div>
        {!words && <p className="empty">Loading…</p>}
        {words && shown.length === 0 && <p className="empty"><Icon name="ban" size={28} />Nothing on the list.</p>}
        {shown.length > 0 && (
          <ul className="chips" aria-label="Words">
            {shown.map((w) => (
              <li key={w.id} className={`chip ${w.kind}`}>
                <span className="gu">{w.word}</span>
                {w.kind === 'reserved' && <span className="sr-only">(reserved)</span>}
                <button type="button" onClick={() => remove(w)} aria-label={`Remove ${w.word}`} title="Remove"><Icon name="close" size={14} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="pager"><span className="legend-inline"><span className="chip" style={{ padding: '2px 10px' }}>word</span>Blocked <span className="chip reserved" style={{ padding: '2px 10px' }}>word</span>Reserved</span><span>{all.length} entries</span></div>
      </div>
    </div>
  );
}
