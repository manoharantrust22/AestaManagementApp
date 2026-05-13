// Mobile rendering of the same surface — on-site priority is:
//   (1) glance at money in / spent / left
//   (2) quickly add an expense
//   (3) scan recent expenses
// Trade strip and full table reflow as cards.

function MobilePage({ tradeVariant = 'detailed' }) {
  const [tab, setTab] = React.useState('expenses'); // overview | expenses
  const cashPosition = SITE.contract.collected - SITE.spent;
  const budgetPct = SITE.spent / SITE.budget;

  return (
    <div style={{
      width:'100%', minHeight:'100%', background:T.bg, fontFamily:T.font, color:T.text,
      display:'flex', flexDirection:'column',
    }}>
      <MobileTopBar/>

      <div style={{padding:'12px 16px 6px'}}>
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10}}>
          <button style={{
            width:30, height:30, borderRadius:8, border:`1px solid ${T.border}`,
            background:T.card, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          }}><Icon name="arrowLt" size={13}/></button>
          <div style={{display:'flex', flexDirection:'column'}}>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{fontSize:17, fontWeight:700, letterSpacing:-0.3}}>All Site Expenses</span>
            </div>
            <span style={{fontSize:11.5, color:T.muted, fontWeight:500}}>
              {SITE.name} · All time
            </span>
          </div>
        </div>
      </div>

      {/* Mobile hero: one tall card with the 4 metrics stacked */}
      <div style={{padding:'0 16px'}}>
        <div style={{
          background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:'16px 16px 14px',
          display:'flex', flexDirection:'column', gap:14,
        }}>
          <div>
            <div style={{fontSize:11, fontWeight:700, letterSpacing:0.5, color:T.subtle, textTransform:'uppercase'}}>Total spent</div>
            <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:4}}>
              <div style={{fontSize:30, fontWeight:700, letterSpacing:-0.5, fontVariantNumeric:'tabular-nums'}}>{inr(SITE.spent)}</div>
              <div style={{fontSize:12, color:T.muted, fontWeight:500}}>{SITE.records} records</div>
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <MiniMetric
              label="Cash position"
              value={(cashPosition >= 0 ? '+' : '') + inrK(cashPosition)}
              accent={cashPosition >= 0 ? T.success : T.danger}
              sub={`${inrK(SITE.contract.collected)} collected`}
            />
            <MiniMetric
              label="Burn / week"
              value={inrK(SITE.burnPerWeek)}
              sub={`~${Math.ceil((SITE.budget - SITE.spent)/SITE.burnPerWeek)} wks runway`}
            />
          </div>

          <div style={{
            background:T.bg, borderRadius:10, padding:'10px 12px',
            display:'flex', flexDirection:'column', gap:8,
          }}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
              <span style={{fontSize:12, color:T.muted, fontWeight:500}}>Budget vs progress</span>
              <span style={{fontSize:12, color:T.muted, fontWeight:500}}>
                <b style={{color:budgetPct <= SITE.progress + 0.05 ? T.success : T.warn}}>
                  {Math.round(budgetPct*100)}%
                </b> spent · {Math.round(SITE.progress*100)}% done
              </span>
            </div>
            <BudgetGauge budgetPct={budgetPct} progressPct={SITE.progress}/>
          </div>

          <a href="#contracts" style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'10px 12px', background:T.primarySoft, borderRadius:10,
            color:T.primary, textDecoration:'none', fontSize:12.5, fontWeight:700,
          }}>
            <span style={{display:'flex', alignItems:'center', gap:8}}>
              <Icon name="link" size={14}/> Contracts &amp; payments
            </span>
            <Icon name="arrowRt" size={13}/>
          </a>
        </div>
      </div>

      <div style={{padding:'16px 16px 0', display:'flex', gap:6, borderBottom:`1px solid ${T.border}`, marginTop:16}}>
        <MobileTab label="Overview" active={tab==='overview'} onClick={() => setTab('overview')}/>
        <MobileTab label="Expenses" active={tab==='expenses'} onClick={() => setTab('expenses')} badge="24"/>
      </div>

      <div style={{padding:'14px 16px 100px', display:'flex', flexDirection:'column', gap:16}}>
        {tab === 'overview' ? <MobileOverview/> : <MobileExpenses tradeVariant={tradeVariant}/>}
      </div>

      {/* Floating add button */}
      <button style={{
        position:'absolute', right:18, bottom:18, height:52, padding:'0 20px',
        borderRadius:99, border:'none', background:T.primary, color:'#fff',
        fontFamily:T.font, fontWeight:700, fontSize:14, cursor:'pointer',
        boxShadow:'0 10px 24px rgba(37, 99, 235, .35)',
        display:'flex', alignItems:'center', gap:8,
      }}>
        <Icon name="plus" size={15}/> Add expense
      </button>
    </div>
  );
}

function MiniMetric({ label, value, sub, accent }) {
  return (
    <div>
      <div style={{fontSize:11, fontWeight:700, letterSpacing:0.4, color:T.subtle, textTransform:'uppercase'}}>{label}</div>
      <div style={{fontSize:18, fontWeight:700, color: accent || T.text, marginTop:2, fontVariantNumeric:'tabular-nums', letterSpacing:-0.2}}>{value}</div>
      <div style={{fontSize:11, color:T.muted, fontWeight:500, marginTop:1}}>{sub}</div>
    </div>
  );
}

function MobileTab({ label, active, onClick, badge }) {
  return (
    <button onClick={onClick} style={{
      padding:'10px 4px 12px', border:'none', background:'transparent',
      borderBottom: active ? `2px solid ${T.text}` : '2px solid transparent',
      color: active ? T.text : T.muted,
      fontSize:13, fontWeight:700, fontFamily:T.font, cursor:'pointer',
      marginBottom:-1, display:'inline-flex', alignItems:'center', gap:6,
    }}>
      {label}
      {badge && <span style={{
        fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:99,
        background: active ? T.text : T.chip, color: active ? '#fff' : T.muted,
      }}>{badge}</span>}
    </button>
  );
}

function MobileOverview() {
  return (
    <>
      <Section label="Where the money went">
        <div style={{background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:14}}>
          <BreakdownBar byKind={BY_KIND}/>
        </div>
      </Section>

      <Section
        label="By trade"
        action={<span style={{fontSize:11, color:T.subtle, fontWeight:600}}>
          {TRADES.filter(t => t.amount > 0).length}/{TRADES.length} active
        </span>}
      >
        {/* Mobile uses chip style by default — saves vertical real estate */}
        <TradeChips trades={TRADES}/>
      </Section>
    </>
  );
}

function MobileExpenses({ tradeVariant }) {
  return (
    <>
      {/* Search + filter strip */}
      <div style={{display:'flex', flexDirection:'column', gap:10}}>
        <div style={{
          display:'flex', alignItems:'center', gap:8, padding:'10px 14px',
          background:T.card, border:`1px solid ${T.border}`, borderRadius:10,
        }}>
          <Icon name="search" size={14} color={T.subtle}/>
          <input placeholder="Search ref code, vendor…" style={{
            flex:1, border:'none', outline:'none', fontFamily:T.font, fontSize:13,
            background:'transparent', color:T.text,
          }}/>
          <button style={{background:'none', border:'none', cursor:'pointer', padding:0, display:'flex'}}>
            <Icon name="filter" size={14} color={T.muted}/>
          </button>
        </div>
        <div style={{display:'flex', gap:6, overflowX:'auto', paddingBottom:2}}>
          {[['All','all',true], ['Labor','labor'], ['Building','building'], ['Civil','civil'], ['Pending','pending'], ['Advance','advance']].map(([l, k, on]) => (
            <Pill key={k} active={on}>{l}</Pill>
          ))}
        </div>
      </div>

      {/* Expense cards grouped by date */}
      <div style={{display:'flex', flexDirection:'column', gap:18}}>
        {groupByDate(EXPENSES).slice(0, 4).map(([date, rows]) => (
          <div key={date} style={{display:'flex', flexDirection:'column', gap:8}}>
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'0 2px',
            }}>
              <div style={{fontSize:11, fontWeight:700, letterSpacing:0.4, color:T.subtle, textTransform:'uppercase'}}>
                {fmtDateLong(date)}
              </div>
              <div style={{fontSize:11.5, color:T.text, fontWeight:700, fontVariantNumeric:'tabular-nums'}}>
                {inrK(rows.reduce((s, r) => s + r.amount, 0))}
              </div>
            </div>
            <div style={{background:T.card, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
              {rows.map((r, i) => <MobileRow key={r.id} row={r} top={i > 0}/>)}
            </div>
          </div>
        ))}
        <button style={{
          padding:'12px', borderRadius:10, border:`1px solid ${T.border}`,
          background:T.card, color:T.primary, fontWeight:700, fontFamily:T.font, fontSize:13, cursor:'pointer',
        }}>Load 200 more records</button>
      </div>
    </>
  );
}

function groupByDate(rows) {
  const map = new Map();
  rows.forEach(r => {
    if (!map.has(r.date)) map.set(r.date, []);
    map.get(r.date).push(r);
  });
  return [...map.entries()];
}

function MobileRow({ row, top }) {
  const trade = TRADES.find(t => t.id === row.trade);
  const subMeta = SUB_META[row.sub];
  return (
    <div style={{
      padding:'12px 14px', display:'flex', flexDirection:'column', gap:6,
      borderTop: top ? `1px solid ${T.hairline}` : 'none',
    }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10}}>
        <div style={{minWidth:0, flex:1}}>
          <div style={{fontSize:13.5, fontWeight:700, color:T.text, lineHeight:1.25}}>{row.vendor}</div>
          <div style={{fontSize:12, color:T.muted, marginTop:2, lineHeight:1.3}}>{row.desc}</div>
        </div>
        <div style={{textAlign:'right', whiteSpace:'nowrap'}}>
          <div style={{fontSize:14, fontWeight:700, color:T.text, fontVariantNumeric:'tabular-nums', letterSpacing:-0.2}}>{inr(row.amount)}</div>
          <div style={{fontSize:10.5, color:T.subtle, fontFamily:T.mono, marginTop:1}}>{row.id}</div>
        </div>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
        <span style={{display:'inline-flex', alignItems:'center', gap:5, fontSize:11.5, color:T.muted, fontWeight:600}}>
          <span style={{width:6, height:6, borderRadius:2, background:trade?.color}}/>{trade?.label}
        </span>
        <span style={{color:T.hairline}}>·</span>
        <Badge tone={row.kind === 'labor' ? 'primary' : 'pink'} dot style={{padding:'1px 6px', fontSize:10.5}}>
          {subMeta?.label}
        </Badge>
        {row.status !== 'paid' && (
          <Badge tone={row.status === 'pending' ? 'warn' : 'primary'} dot style={{padding:'1px 6px', fontSize:10.5}}>
            {row.flag || row.status}
          </Badge>
        )}
      </div>
    </div>
  );
}

function MobileTopBar() {
  return (
    <div style={{
      height:54, borderBottom:`1px solid ${T.border}`, background:T.card,
      display:'flex', alignItems:'center', padding:'0 14px', gap:10,
    }}>
      <button style={{
        width:30, height:30, border:'none', background:'transparent', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}><Icon name="list" size={16} color={T.text}/></button>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <div style={{
          width:24, height:24, borderRadius:6, background:T.primary, color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:12,
        }}>A</div>
        <span style={{fontWeight:700, fontSize:14}}>Aesta</span>
      </div>
      <div style={{flex:1}}/>
      <button style={{position:'relative', width:32, height:32, border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>
        <Icon name="bell" size={15} color={T.muted}/>
        <span style={{position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:T.danger, border:'1.5px solid #fff'}}/>
      </button>
    </div>
  );
}

window.MobilePage = MobilePage;
