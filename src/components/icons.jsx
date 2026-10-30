// Small stroke icon set (24px grid). Decorative: always aria-hidden, the text next to them carries the meaning.
const P = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  back: <><path d="M15 18l-6-6 6-6" /></>,
  check: <><path d="M5 12.5l4.5 4.5L19 7" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5L12 13l8.5-6.5" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l2 2M15 8l2 2" /></>,
  filter: <><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" /></>,
  alert: <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.01" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" /><path d="M4 3.5V8h4.5" /><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" /><path d="M20 20.5V16h-4.5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  'eye-off': <><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-2.7 3.5M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.9 0 3.5-.6 4.9-1.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M4 4l16 16" /></>,
  gift: <><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5V20h14v-7.5M12 8.5V20" /><path d="M12 8.5C10.5 5 7 4.5 7 6.8 7 8.5 12 8.5 12 8.5zM12 8.5C13.5 5 17 4.5 17 6.8 17 8.5 12 8.5 12 8.5z" /></>,
  child:<><circle cx="12" cy="6.5" r="3" /><path d="M7 21v-5l-2-3.5M17 21v-5l2-3.5M8 12.5h8M10 21v-4h4v4" /></>,
};

export function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {P[name]}
    </svg>
  );
}

// Brand mark: a spark in a saffron tile.
export function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false" className="logo">
      <defs>
        <linearGradient id="ss-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f59e0b" /><stop offset="1" stopColor="#c2410c" /></linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#ss-g)" />
      <path d="M20 7l2.6 8.4L31 18l-8.4 2.6L20 29l-2.6-8.4L9 18l8.4-2.6z" fill="#fff" />
      <circle cx="29" cy="29" r="2.2" fill="#fff" opacity=".85" />
    </svg>
  );
}
