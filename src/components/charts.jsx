// Small dependency-free charts for the dashboard (SVG + CSS). Colors come from --series-* in styles.css.
import { useState } from 'react';

const pct = (v, total) => (total ? Math.round((v / total) * 100) : 0);
const n = (v) => v.toLocaleString();

// Horizontal bars: long category names (age groups) stay readable and keep their natural order.
export function BarList({ data, unit = 'profiles' }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ul className="barlist">
      {data.map((d, i) => (
        <li key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={hover === i ? 'hover' : undefined}>
          <span className="bar-label">{d.label}</span>
          <span className="bar-track">
            <span className="bar" style={{ width: `${(d.value / max) * 100}%` }} />
            {hover === i && <span className="tip" role="tooltip" style={{ left: `${(d.value / max) * 100}%` }}><b>{d.label}</b>{n(d.value)} {unit} · {pct(d.value, total)}%</span>}
          </span>
          <span className="bar-value">{n(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

const W = 640, H = 220, PAD = { l: 36, r: 14, t: 14, b: 28 };
const niceMax = (v) => { const step = v <= 10 ? 2 : v <= 40 ? 5 : v <= 100 ? 20 : 50; return Math.max(step, Math.ceil(v / step) * step); };
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// One series over time: 2px line, faint area wash, crosshair + tooltip on hover.
export function LineChart({ data, label = 'new accounts' }) {
  const [hover, setHover] = useState(null);
  const max = niceMax(Math.max(...data.map((d) => d.count), 1));
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const x = (i) => PAD.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => PAD.t + ih - (v / max) * ih;
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.count).toFixed(1)}`);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const every = Math.ceil(data.length / 7);
  const last = data.length - 1;
  const band = iw / Math.max(1, data.length - 1);
  const h = hover ?? null;

  return (
    <div className="linechart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} per day, ${shortDate(data[0].date)} to ${shortDate(data[last].date)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
            <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tick">{t}</text>
          </g>
        ))}
        {data.map((d, i) => (i % every === 0 || i === last) && (i === last || last - i >= every / 2) && (
          <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" className="tick">{shortDate(d.date)}</text>
        ))}
        <polygon points={`${x(0)},${y(0)} ${pts.join(' ')} ${x(last)},${y(0)}`} className="area" />
        <polyline points={pts.join(' ')} className="line" />
        {h !== null && <line x1={x(h)} x2={x(h)} y1={PAD.t} y2={PAD.t + ih} className="crosshair" />}
        <circle cx={x(h ?? last)} cy={y(data[h ?? last].count)} r="4.5" className="dot" />
        {data.map((d, i) => (
          <rect key={d.date} x={x(i) - band / 2} y={PAD.t} width={band} height={ih} fill="transparent"
            onMouseEnter={() => setHover(i)} data-testid="line-hit" />
        ))}
      </svg>
      {h !== null && (
        <div className="tip" role="tooltip" style={{ left: `${(x(h) / W) * 100}%`, top: `${(y(data[h].count) / H) * 100}%` }}>
          <b>{shortDate(data[h].date)}</b>{n(data[h].count)} {label}
        </div>
      )}
    </div>
  );
}

// Two-to-four part share: ring with 2px gaps, total in the middle, legend doubles as direct labels.
// A segment with neutral: true (e.g. 'not chosen yet') is drawn in gray so it doesn't read as a category.
export function Donut({ segments, centerLabel }) {
  const [hover, setHover] = useState(null);
  const total = segments.reduce((s, d) => s + d.value, 0);
  const R = 46, C = 2 * Math.PI * R, GAP = 2;
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={segments.map((s) => `${s.label} ${pct(s.value, total)}%`).join(', ')}>
        {total === 0 && <circle cx="60" cy="60" r={R} fill="none" strokeWidth="14" className="donut-track" />}
        <g transform="rotate(-90 60 60)">
          {segments.map((s, i) => {
            const len = total ? (s.value / total) * C : 0;
            const el = (
              <circle key={s.label} cx="60" cy="60" r={R} fill="none" strokeWidth={hover === i ? 16 : 14}
                stroke={s.neutral ? 'var(--series-none)' : `var(--series-${i + 1})`} strokeDasharray={`${Math.max(0, len - GAP)} ${C}`} strokeDashoffset={-offset}
                opacity={hover === null || hover === i ? 1 : 0.35}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="60" y="56" textAnchor="middle" className="donut-total">{n(total)}</text>
        <text x="60" y="72" textAnchor="middle" className="tick">{centerLabel}</text>
      </svg>
      <ul className="legend">
        {segments.map((s, i) => (
          <li key={s.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={hover === i ? 'hover' : undefined}>
            <span className="swatch" style={{ background: s.neutral ? 'var(--series-none)' : `var(--series-${i + 1})` }} />
            <span className="legend-label">{s.label}</span>
            <span className="legend-value">{n(s.value)} <span className="muted">· {pct(s.value, total)}%</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
