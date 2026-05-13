// Hero KPI strip + breakdown bar.
// Four big numbers anchor the page: Spent, Cash position, Budget vs Progress, Burn.

function KpiCard({ label, value, sub, accent, trailing, foot, style }) {
  return (
    <div style={{
      flex:'1 1 0', minWidth:0, padding:'18px 20px',
      background: T.card, border:`1px solid ${T.border}`, borderRadius:12,
      display:'flex', flexDirection:'column', gap:6,
      ...style,
    }}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
        <div style={{fontSize:11.5, fontWeight:700, letterSpacing:0.5, color:T.subtle, textTransform:'uppercase'}}>{label}</div>
        {trailing}
      </div>
      <div style={{display:'flex', alignItems:'baseline', gap:10, marginTop:2}}>
        <div style={{fontSize:28, fontWeight:700, color: accent || T.text, letterSpacing:-0.4, fontVariantNumeric:'tabular-nums'}}>{value}</div>
        {sub && <div style={{fontSize:13, color:T.muted, fontWeight:500}}>{sub}</div>}
      </div>
      {foot && <div style={{marginTop:8}}>{foot}</div>}
    </div>
  );
}

// Tiny inline sparkline. Pure SVG, no deps.
function Spark({ data, color = T.primary, w = 80, h = 24 }) {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, h - ((v - min) / range) * (h - 4) - 2]);
  const d = 'M' + pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' L');
  const area = d + ` L${w.toFixed(1)},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} style={{display:'block'}}>
      <path d={area} fill={color} opacity="0.12"/>
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.5" fill={color}/>
    </svg>
  );
}

// Mini bar showing "budget spent" vs "progress complete" — at a glance health.
function BudgetGauge({ budgetPct, progressPct }) {
  const healthy = budgetPct <= progressPct + 0.05;
  const tone = healthy ? T.success : (budgetPct - progressPct > 0.15 ? T.danger : T.warn);
  return (
    <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:6}}>
      <div style={{position:'relative', height:6, background:T.hairline, borderRadius:99}}>
        <div style={{position:'absolute', inset:0, width:`${budgetPct*100}%`, background:tone, borderRadius:99}}/>
        {/* Progress marker (where we should be by % complete) */}
        <div title="Project progress" style={{
          position:'absolute', left:`${progressPct*100}%`, top:-3, width:2, height:12,
          background:T.text, borderRadius:1, transform:'translateX(-1px)',
        }}/>
      </div>
      <div style={{display:'flex', justifyContent:'space-between', fontSize:11.5, color:T.muted, fontWeight:500}}>
        <span><b style={{color:tone}}>{Math.round(budgetPct*100)}%</b> of budget spent</span>
        <span>{Math.round(progressPct*100)}% complete</span>
      </div>
    </div>
  );
}

function HeroKpis({ site }) {
  const cashPosition = site.contract.collected - site.spent;
  const budgetPct = site.spent / site.budget;
  const healthy = budgetPct <= site.progress + 0.05;
  const gap = Math.round((site.progress - budgetPct) * 100); // positive = under-spent relative to progress

  return (
    <div style={{display:'flex', gap:14}}>
      <KpiCard
        label="Total spent"
        value={inr(site.spent)}
        sub={`across ${site.records} records`}
        foot={
          <div style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:T.muted}}>
            <Icon name="trend" size={14} color={T.success}/>
            <span><b style={{color:T.text}}>+12%</b> vs last 30 days</span>
          </div>
        }
      />
      <KpiCard
        label="Cash position"
        accent={cashPosition >= 0 ? T.success : T.danger}
        value={(cashPosition >= 0 ? '+' : '') + inr(cashPosition)}
        sub="collected − spent"
        foot={
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
            <div style={{fontSize:12, color:T.muted}}>
              <span style={{color:T.text, fontWeight:600}}>{inrK(site.contract.collected)}</span> in /
              <span style={{color:T.text, fontWeight:600}}> {inrK(site.spent)}</span> out
            </div>
            <a href="#contracts" style={{
              display:'inline-flex', alignItems:'center', gap:4, fontSize:12, fontWeight:600,
              color:T.primary, textDecoration:'none',
            }}>
              Contracts <Icon name="arrowRt" size={12}/>
            </a>
          </div>
        }
      />
      <KpiCard
        label="Budget vs progress"
        value={`${Math.round(budgetPct*100)}%`}
        sub={`of ${inrK(site.budget)} budget`}
        foot={<BudgetGauge budgetPct={budgetPct} progressPct={site.progress}/>}
        trailing={
          <Badge tone={healthy ? 'success' : (gap < -15 ? 'danger' : 'warn')} dot>
            {healthy ? `${gap}% under` : `${Math.abs(gap)}% over`}
          </Badge>
        }
      />
      <KpiCard
        label="Burn rate"
        value={inrK(site.burnPerWeek)}
        sub="per week · 4-wk avg"
        foot={
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div style={{fontSize:12, color:T.muted}}>
              ~{Math.ceil((site.budget - site.spent)/site.burnPerWeek)} wks runway
            </div>
            <Spark data={site.burnTrend} color={T.primary} w={84} h={26}/>
          </div>
        }
      />
    </div>
  );
}

// ── Breakdown bar ─────────────────────────────────────────────────────
// Single stacked bar showing Labor vs Building, segmented by sub-kind.
function BreakdownBar({ byKind }) {
  const segments = [];
  for (const [kindKey, kind] of Object.entries(byKind)) {
    const meta = KIND_META[kindKey];
    kind.children.forEach(c => {
      if (!c.amount) return;
      segments.push({ ...c, kind: kindKey, color: SUB_META[c.id]?.color || meta.color });
    });
  }
  const total = segments.reduce((a,b) => a + b.amount, 0);
  return (
    <div style={{display:'flex', flexDirection:'column', gap:10}}>
      <div style={{
        display:'flex', height:14, borderRadius:99, overflow:'hidden',
        background:T.hairline,
      }}>
        {segments.map((s, i) => (
          <div key={s.id} title={`${s.label}: ${inr(s.amount)}`}
            style={{
              width: `${(s.amount/total)*100}%`,
              background: s.color,
              borderRight: i < segments.length-1 ? '1.5px solid #fff' : 'none',
            }}/>
        ))}
      </div>
      <div style={{display:'flex', flexWrap:'wrap', gap:'6px 18px'}}>
        {segments.map(s => (
          <div key={s.id} style={{display:'flex', alignItems:'center', gap:7, fontSize:12.5}}>
            <span style={{width:9, height:9, background:s.color, borderRadius:2}}/>
            <span style={{color:T.muted, fontWeight:500}}>{s.label}</span>
            <span style={{color:T.text, fontWeight:600, fontVariantNumeric:'tabular-nums'}}>
              {inrK(s.amount)}
            </span>
            <span style={{color:T.subtle, fontWeight:500, fontSize:11.5}}>
              {pct(s.amount, total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { KpiCard, Spark, BudgetGauge, HeroKpis, BreakdownBar });
