// Full desktop "All Site Expenses" page — assembled.
// Wraps a slim Aesta-style chrome so it reads as a real screen, not a fragment.

function DesktopPage({ tradeVariant = 'detailed' }) {
  return (
    <div style={{
      width:'100%', minHeight:'100%', background:T.bg, fontFamily:T.font, color:T.text,
      display:'flex',
    }}>
      <SiteSidebar/>
      <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>
        <TopBar/>
        <main style={{flex:1, padding:'22px 28px 40px', display:'flex', flexDirection:'column', gap:18}}>
          <PageHeader/>
          <HeroKpis site={SITE}/>
          <Card padding={18}>
            <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, gap:14}}>
              <div>
                <div style={{fontSize:11.5, fontWeight:700, letterSpacing:0.5, color:T.subtle, textTransform:'uppercase'}}>
                  Where the money went
                </div>
                <div style={{display:'flex', alignItems:'baseline', gap:10, marginTop:6}}>
                  <div style={{fontSize:24, fontWeight:700, letterSpacing:-0.3, fontVariantNumeric:'tabular-nums'}}>
                    {inr(SITE.spent)}
                  </div>
                  <div style={{fontSize:13, color:T.muted, fontWeight:500}}>
                    {SITE.records} records · {Object.keys(BY_KIND).length} kinds
                  </div>
                </div>
              </div>
              <div style={{display:'flex', gap:6}}>
                <Btn variant="ghost" size="sm" leading={<Icon name="receipt" size={13}/>}>Subcontracts</Btn>
                <Btn variant="ghost" size="sm" leading={<Icon name="download" size={13}/>}>Report</Btn>
              </div>
            </div>
            <BreakdownBar byKind={BY_KIND}/>
          </Card>

          <Section
            label="By trade"
            action={
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <span style={{fontSize:11.5, color:T.subtle, fontWeight:500}}>
                  {TRADES.filter(t => t.amount > 0).length} of {TRADES.length} active
                </span>
              </div>
            }
          >
            <TradeStrip variant={tradeVariant} trades={TRADES}/>
          </Section>

          <Section label="All expenses">
            <ExpensesTable expenses={EXPENSES} trades={TRADES}/>
          </Section>
        </main>
      </div>
    </div>
  );
}

function SiteSidebar() {
  const items = [
    { icon:'home',     label:'Dashboard' },
    { icon:'sparkle',  label:'AI Assistant' },
    { icon:'user',     label:'Workforce' },
    { icon:'receipt',  label:'Expenses', active:true },
    { icon:'grid',     label:'Site ops' },
    { icon:'list',     label:'Materials' },
    { icon:'flag',     label:'Contracts' },
  ];
  return (
    <aside style={{
      width: 220, flex:'0 0 220px', borderRight:`1px solid ${T.border}`,
      background: T.card, display:'flex', flexDirection:'column',
    }}>
      <div style={{padding:'18px 18px 12px', display:'flex', alignItems:'center', gap:8}}>
        <div style={{
          width:28, height:28, borderRadius:7, background:T.primary, color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, letterSpacing:0.5,
        }}>A</div>
        <div style={{fontSize:15, fontWeight:700, letterSpacing:-0.2}}>Aesta</div>
      </div>
      <div style={{padding:'8px 12px', display:'flex', flexDirection:'column', gap:2}}>
        <div style={{display:'flex', background:T.bg, padding:3, borderRadius:8, marginBottom:8}}>
          <button style={{
            flex:1, padding:'6px 8px', borderRadius:6, border:'none',
            background:T.primary, color:'#fff', fontSize:12.5, fontWeight:700, fontFamily:T.font, cursor:'pointer',
          }}>Site</button>
          <button style={{
            flex:1, padding:'6px 8px', borderRadius:6, border:'none',
            background:'transparent', color:T.muted, fontSize:12.5, fontWeight:600, fontFamily:T.font, cursor:'pointer',
          }}>Company</button>
        </div>
        {items.map((it, i) => (
          <button key={i} style={{
            display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
            background: it.active ? T.primarySoft : 'transparent',
            border:'none', borderRadius:7, cursor:'pointer',
            color: it.active ? T.primary : T.muted,
            fontSize:13, fontWeight: it.active ? 700 : 600, fontFamily:T.font,
            textAlign:'left',
          }}>
            <Icon name={it.icon} size={15}/> {it.label}
          </button>
        ))}
      </div>
      <div style={{flex:1}}/>
      <div style={{
        padding:'12px 14px', borderTop:`1px solid ${T.hairline}`,
        display:'flex', alignItems:'center', gap:10,
      }}>
        <div style={{
          width:32, height:32, borderRadius:'50%', background:'#0b1220', color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13,
        }}>HA</div>
        <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
          <div style={{fontSize:12.5, fontWeight:700}}>Hari Admin</div>
          <div style={{fontSize:11, color:T.subtle, fontWeight:500}}>Admin</div>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  return (
    <div style={{
      height: 56, borderBottom:`1px solid ${T.border}`, background: T.card,
      display:'flex', alignItems:'center', padding:'0 18px 0 22px', gap:12,
    }}>
      <div style={{display:'flex', alignItems:'center', gap:10, padding:'6px 14px', background:T.bg, border:`1px solid ${T.border}`, borderRadius:99}}>
        <Icon name="home" size={14} color={T.primary}/>
        <div style={{display:'flex', flexDirection:'column'}}>
          <div style={{fontSize:12.5, fontWeight:700, color:T.text, lineHeight:1.1}}>{SITE.name}</div>
          <div style={{fontSize:10.5, color:T.subtle, fontWeight:500, marginTop:1}}>{SITE.location}</div>
        </div>
        <Badge tone="success" dot style={{marginLeft:4}}>active</Badge>
        <Icon name="chevDn" size={12} color={T.subtle}/>
      </div>
      <div style={{flex:1}}/>
      <div style={{display:'flex', alignItems:'center', gap:6, padding:'4px 8px', background:T.bg, borderRadius:8, border:`1px solid ${T.border}`}}>
        <Icon name="calendar" size={13} color={T.muted}/>
        <span style={{fontSize:12.5, fontWeight:600, color:T.text}}>All time</span>
        <Icon name="chevDn" size={11} color={T.muted}/>
      </div>
      <div style={{display:'flex', gap:2}}>
        {['Today', 'Week', 'Month'].map((l, i) => (
          <button key={i} style={{
            padding:'5px 11px', borderRadius:99, border:`1px solid ${T.border}`,
            background:T.card, color:T.muted, fontSize:12, fontWeight:600, fontFamily:T.font, cursor:'pointer',
          }}>{l}</button>
        ))}
      </div>
      <button style={{
        width:32, height:32, borderRadius:8, border:`1px solid ${T.border}`,
        background:T.card, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', position:'relative',
      }}>
        <Icon name="bell" size={14} color={T.muted}/>
        <span style={{position:'absolute', top:-3, right:-3, minWidth:16, height:16, padding:'0 4px', borderRadius:99, background:T.danger, color:'#fff', fontSize:9.5, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center'}}>50</span>
      </button>
    </div>
  );
}

function PageHeader() {
  return (
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:14}}>
      <div style={{display:'flex', alignItems:'center', gap:12}}>
        <button style={{
          width:34, height:34, borderRadius:9, border:`1px solid ${T.border}`,
          background:T.card, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
        }}><Icon name="arrowLt" size={14}/></button>
        <div>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <h1 style={{fontSize:22, fontWeight:700, letterSpacing:-0.4, margin:0}}>All Site Expenses</h1>
            <Badge tone="neutral">All time</Badge>
          </div>
          <div style={{fontSize:13, color:T.muted, marginTop:3, fontWeight:500}}>
            Track everything spent on <b style={{color:T.text}}>{SITE.name}</b>. Linked to{' '}
            <a href="#contracts" style={{color:T.primary, textDecoration:'none', fontWeight:600}}>Contracts &amp; Payments ↗</a>
          </div>
        </div>
      </div>
      <div style={{display:'flex', gap:8, alignItems:'center'}}>
        <Btn variant="secondary" leading={<Icon name="upload" size={13}/>}>Import</Btn>
        <Btn variant="primary" leading={<Icon name="plus" size={13}/>}>Add expense</Btn>
      </div>
    </div>
  );
}

window.DesktopPage = DesktopPage;
