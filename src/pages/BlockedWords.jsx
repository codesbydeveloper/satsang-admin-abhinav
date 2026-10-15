import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { Err, useAction } from '../components/ui';

export default function BlockedWords() {
  const [words, setWords] = useState([]);
  const [word, setWord] = useState(''); const [kind, setKind] = useState('blocked'); const [filter, setFilter] = useState('');
  const { busy, error, run } = useAction();
  const load = () => run(async () => setWords((await adminApi.words()).words));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const add = (e) => { e.preventDefault(); run(async () => { await adminApi.addWord(word.trim(), kind); setWord(''); await load(); }); };
  const remove = (w) => { if (window.confirm(`Remove "${w.word}" from the list?`)) run(async () => { await adminApi.removeWord(w.id); await load(); }); };
  const shown = words.filter((w) => w.word.includes(filter.toLowerCase()));

  return (
    <>
      <h2>Blocked words</h2>
      <p className="muted">Usernames containing a <b>blocked</b> or <b>reserved</b> word are refused. Add English words, Gujarati-script words and Gujarati written in English letters. Look-alike spellings (e.g. 1 for i) are matched automatically.</p>
      <form className="row" onSubmit={add}>
        <input placeholder="Word or phrase" value={word} onChange={(e) => setWord(e.target.value)} minLength={2} maxLength={100} required />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
          <option value="blocked">Blocked (offensive)</option><option value="reserved">Reserved (official names)</option>
        </select>
        <button disabled={busy}>Add</button>
      </form>
      <Err error={error} />
      <input className="filter" placeholder="Filter list" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <table>
        <thead><tr><th>Word</th><th>Kind</th><th /></tr></thead>
        <tbody>
          {shown.map((w) => (
            <tr key={w.id}><td>{w.word}</td><td>{w.kind}</td><td><button className="link danger" onClick={() => remove(w)}>Remove</button></td></tr>
          ))}
          {shown.length === 0 && <tr><td colSpan="3" className="muted">Nothing on the list.</td></tr>}
        </tbody>
      </table>
      <p className="muted">{words.length} entries</p>
    </>
  );
}
