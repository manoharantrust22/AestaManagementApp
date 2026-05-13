// Shared formatters, tokens, and tiny primitive components.

// Tokens tuned to match the existing Aesta theme (blue/pink, soft slate
// neutrals, very light borders). Same names so nothing else needs to change.
const T = {
  font: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  bg: '#f5f7fa',
  card: '#ffffff',
  text: '#0f172a',          // slate-900
  muted: '#64748b',         // slate-500
  subtle: '#94a3b8',         // slate-400
  border: '#e2e8f0',        // slate-200
  hairline: '#f1f5f9',      // slate-100
  chip: '#f1f5f9',
  primary: '#2563eb',
  primarySoft: '#eff6ff',
  primaryHover: '#1d4ed8',
  success: '#10b981',
  successSoft: '#ecfdf5',
  warn: '#f59e0b',
  warnSoft: '#fffbeb',
  danger: '#ef4444',
  dangerSoft: '#fef2f2',
  pink: '#ec4899',           // matches the Building accent in original
  pinkSoft: '#fdf2f8',
};
window.T = T;

// ── Number formatters ────────────────────────────────────────────────
// Indian-comma format: 1,68,675
function inrInt(n) {
  if (n == null || isNaN(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const x = Math.abs(Math.round(n)).toString();
  if (x.length <= 3) return sign + x;
  const last3 = x.slice(-3);
  const rest  = x.slice(0, -3);
  return sign + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}
function inr(n)   { return '₹' + inrInt(n); }
function inrK(n) {
  // Compact: ₹6.41L, ₹86.4k, ₹930.7k
  const a = Math.abs(n);
  if (a >= 1e7) return '₹' + (n/1e7).toFixed(2).replace(/\.?0+$/, '') + 'Cr';
  if (a >= 1e5) return '₹' + (n/1e5).toFixed(2).replace(/\.?0+$/, '') + 'L';
  if (a >= 1e3) return '₹' + (n/1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return '₹' + Math.round(n);
}
function pct(n, total) {
  if (!total) return '0%';
  return Math.round((n / total) * 100) + '%';
}
function fmtDate(d) {
  // "12 May" — short, scannable
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
function fmtDateLong(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
window.inr = inr; window.inrInt = inrInt; window.inrK = inrK; window.pct = pct;
window.fmtDate = fmtDate; window.fmtDateLong = fmtDateLong;

// ── Icons (inline SVG; consistent 16px box) ────────────────────────────
function Icon({ name, size = 16, color = 'currentColor', stroke = 1.6, style }) {
  const paths = {
    search:   'M11 11l3 3M11 6.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0z',
    filter:   'M2 4h12M4 8h8M6 12h4',
    sort:     'M4 4l3 3M4 4v8M4 4l-3 3M12 12l-3-3M12 12V4M12 12l3-3',
    chevDn:   'M4 6l4 4 4-4',
    chevRt:   'M6 4l4 4-4 4',
    chevLt:   'M10 4l-4 4 4 4',
    plus:     'M8 3v10M3 8h10',
    more:     'M3 8h.01M8 8h.01M13 8h.01',
    download: 'M8 2v8M4 7l4 4 4-4M2 13h12',
    upload:   'M8 13V5M4 9l4-4 4 4M2 2h12',
    check:    'M3 8l3 3 7-7',
    x:        'M3 3l10 10M13 3L3 13',
    info:     'M8 7v4M8 5h.01',
    arrowUp:  'M8 13V3M4 7l4-4 4 4',
    arrowDn:  'M8 3v10M4 9l4 4 4-4',
    arrowLt:  'M13 8H3M7 4L3 8l4 4',
    arrowRt:  'M3 8h10M9 4l4 4-4 4',
    calendar: 'M2 6h12M4 3v2M12 3v2M3 4h10v9H3z',
    expand:   'M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3',
    grid:     'M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z',
    list:     'M3 4h10M3 8h10M3 12h10',
    eye:      'M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z M8 9.75A1.75 1.75 0 1 0 8 6.25a1.75 1.75 0 0 0 0 3.5z',
    flag:     'M3 14V2M3 2h8l-1.5 3L11 8H3',
    sparkle:  'M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M4 12l2-2M10 6l2-2',
    bell:     'M4 11h8s-1.5-1.5-1.5-4.5a2.5 2.5 0 0 0-5 0C5.5 9.5 4 11 4 11zM6.5 13a1.5 1.5 0 0 0 3 0',
    user:     'M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 14c0-2.5 2-4 5-4s5 1.5 5 4',
    link:     'M9 7l-2 2m1-4l1-1a2.8 2.8 0 0 1 4 4l-1 1m-6 0l-1 1a2.8 2.8 0 1 0 4 4l1-1',
    trend:    'M2 12l3-4 3 2 6-6M9 4h5v5',
    receipt:  'M4 2h8v12l-2-1-2 1-2-1-2 1V2zM6 5h4M6 8h4M6 11h3',
    home:     'M2 7l6-5 6 5v7H2V7z',
    pencil:   'M3 13l1-3 7-7 2 2-7 7-3 1zM10 4l2 2',
  };
  const d = paths[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{flex:'0 0 auto', display:'block', ...style}}>
      <path d={d} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}
window.Icon = Icon;

// ── Tiny primitives ───────────────────────────────────────────────────
function Badge({ children, tone = 'neutral', dot, style }) {
  const tones = {
    neutral: { bg: T.chip,        fg: T.muted,    dot: T.subtle },
    primary: { bg: T.primarySoft, fg: T.primary,  dot: T.primary },
    pink:    { bg: T.pinkSoft,    fg: T.pink,     dot: T.pink },
    success: { bg: T.successSoft, fg: T.success,  dot: T.success },
    warn:    { bg: T.warnSoft,    fg: T.warn,     dot: T.warn },
    danger:  { bg: T.dangerSoft,  fg: T.danger,   dot: T.danger },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:6, padding:'2px 8px',
      borderRadius:6, background:t.bg, color:t.fg, fontSize:11, fontWeight:600,
      lineHeight:'16px', letterSpacing:0.1, ...style,
    }}>
      {dot && <span style={{ width:6, height:6, borderRadius:'50%', background:t.dot }}/>}
      {children}
    </span>
  );
}
function Pill({ children, active, onClick, style }) {
  return (
    <button onClick={onClick} style={{
      padding:'5px 11px', borderRadius:999, border:'none',
      background: active ? T.text : T.chip,
      color: active ? '#fff' : T.muted,
      fontSize:12.5, fontWeight:600, fontFamily:T.font, cursor:'pointer',
      transition:'all .12s', ...style,
    }}>{children}</button>
  );
}
function Btn({ children, variant='secondary', leading, trailing, onClick, style, size='md' }) {
  const sizes = {
    sm: { pad:'5px 10px', font:12,   gap:6, h: 28 },
    md: { pad:'8px 14px', font:13,   gap:8, h: 36 },
    lg: { pad:'11px 18px', font:14,  gap:8, h: 42 },
  };
  const s = sizes[size];
  const variants = {
    primary:   { bg: T.primary, fg:'#fff',     bd: T.primary },
    secondary: { bg: '#fff',    fg: T.text,    bd: T.border },
    ghost:     { bg: 'transparent', fg: T.muted, bd: 'transparent' },
    soft:      { bg: T.chip,    fg: T.text,    bd: 'transparent' },
  };
  const v = variants[variant];
  return (
    <button onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap: s.gap, padding: s.pad, height: s.h,
      background: v.bg, color: v.fg, border:`1px solid ${v.bd}`, borderRadius: 8,
      fontFamily: T.font, fontSize: s.font, fontWeight: 600, cursor:'pointer',
      transition:'all .12s', whiteSpace:'nowrap', ...style,
    }}>
      {leading}{children}{trailing}
    </button>
  );
}
function Card({ children, style, padding = 18 }) {
  return (
    <div style={{
      background: T.card, border:`1px solid ${T.border}`, borderRadius:12, padding,
      ...style,
    }}>{children}</div>
  );
}
function Hairline({ vertical, style }) {
  return <div style={{
    background: T.hairline,
    width:  vertical ? 1 : '100%',
    height: vertical ? '100%' : 1,
    ...style,
  }}/>;
}
function Section({ label, children, action, style }) {
  return (
    <div style={style}>
      {label && (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          marginBottom: 10,
        }}>
          <div style={{
            fontSize:11, fontWeight:700, letterSpacing:0.6, color: T.subtle,
            textTransform:'uppercase',
          }}>{label}</div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

Object.assign(window, { Badge, Pill, Btn, Card, Hairline, Section });
