// Material Hub — the centerpiece of the redesign. One unified surface that
// replaces the 5 disconnected pages (Requests / POs / Delivery / Settlement /
// Expenses) with a single "thread" view per request, plus a left action rail
// and quick stat strip.
//
// Why: a material request isn't five separate things, it's one thing that
// moves through five stages. Showing it that way collapses the IA and lets
// users see (and act on) the full lifecycle at a glance.

function MatHub({ density = 'comfortable' }) {
  const [filter, setFilter] = React.useState('all');
  const [selectedId, setSelectedId] = React.useState(null);
  const threads = React.useMemo(() => {
    if (filter === 'all') return M_THREADS;
    if (filter === 'own') return M_THREADS.filter(t => t.kind === 'own');
    if (filter === 'group') return M_THREADS.filter(t => t.kind === 'group');
    if (filter === 'advance') return M_THREADS.filter(t => t.advance);
    if (filter === 'action') return M_THREADS.filter(t => M.nextAction(t));
    return M_THREADS;
  }, [filter]);

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', background: T.bg}}>
      <MatTopBar breadcrumb={['Materials', 'Hub']}/>

      <div style={{
        flex:1, overflow:'auto', padding:'18px 22px 80px',
      }}>
        {/* Page head */}
        <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom: 16}}>
          <div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
              <h1 style={{margin:0, fontSize:22, fontWeight:700, letterSpacing:-0.4}}>Material Hub</h1>
              <Badge tone="primary">47 threads</Badge>
            </div>
            <div style={{fontSize:13, color:T.muted}}>Every material from request to expense, on one surface.</div>
          </div>
          <div style={{display:'flex', gap:8}}>
            <Btn variant="secondary" leading={<Icon name="filter" size={13}/>}>Filter</Btn>
            <Btn variant="secondary" leading={<Icon name="download" size={13}/>}>Export</Btn>
            <Btn variant="primary"   leading={<Icon name="plus" size={13}/>}>New request</Btn>
          </div>
        </div>

        {/* KPI strip */}
        <MatKpiStrip/>

        {/* Tabs + filters */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          marginTop: 22, marginBottom: 14, gap: 16, flexWrap:'wrap',
        }}>
          <div style={{display:'flex', gap:6}}>
            <FilterChip active={filter==='all'} onClick={() => setFilter('all')} count={M_THREADS.length}>All</FilterChip>
            <FilterChip active={filter==='action'} onClick={() => setFilter('action')} count={M_THREADS.filter(M.nextAction).length} accent="warn">
              <Icon name="bell" size={11} color="currentColor"/> Needs action
            </FilterChip>
            <FilterChip active={filter==='own'} onClick={() => setFilter('own')} count={M_THREADS.filter(t=>t.kind==='own').length}>
              <Icon name="home" size={11} color="currentColor"/> Own site
            </FilterChip>
            <FilterChip active={filter==='group'} onClick={() => setFilter('group')} count={M_THREADS.filter(t=>t.kind==='group').length} accent="pink">
              <Icon name="link" size={11} color="currentColor"/> Group
            </FilterChip>
            <FilterChip active={filter==='advance'} onClick={() => setFilter('advance')} count={M_THREADS.filter(t=>t.advance).length} accent="warn">
              <Icon name="calendar" size={11} color="currentColor"/> Advance
            </FilterChip>
          </div>

          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <div style={{
              display:'flex', alignItems:'center', gap:6, padding:'7px 11px',
              background:T.card, borderRadius:8, border:`1px solid ${T.border}`, minWidth: 220,
            }}>
              <Icon name="search" size={13} color={T.subtle}/>
              <input placeholder="Search material, vendor, request #…" style={{
                border:'none', background:'transparent', outline:'none', flex:1, fontSize:12.5, fontFamily:T.font, color:T.text,
              }}/>
              <kbd style={{
                fontSize:10, color:T.subtle, background:T.bg, padding:'1px 5px', borderRadius:3,
                border:`1px solid ${T.hairline}`, fontFamily:T.mono,
              }}>⌘K</kbd>
            </div>
            <Btn variant="ghost" leading={<Icon name="sort" size={13}/>} size="sm">Most recent</Btn>
          </div>
        </div>

        {/* Threads */}
        <div style={{display:'flex', flexDirection:'column', gap: density === 'compact' ? 6 : 10}}>
          {threads.map(t => (
            <MatThreadRow key={t.id} t={t}
              selected={selectedId === t.id}
              onSelect={() => setSelectedId(selectedId === t.id ? null : t.id)}
              density={density}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────
function MatKpiStrip() {
  const kpis = [
    { label:'Needs your action', value:'6', sub:'2 approvals · 1 PO · 1 delivery · 2 to settle', tone:'warn', icon:'bell' },
    { label:'In flight', value:'14', sub:'orders, deliveries, settlements pending', tone:'primary', icon:'trend' },
    { label:'Settlement due',  value:'₹1.38L', sub:'10 vendor bills · oldest 177 d', tone:'danger', icon:'receipt' },
    { label:'Group cluster',  value:'−₹30,964', sub:'You owe Padmavathy · 33 records', tone:'pink', icon:'link' },
  ];
  return (
    <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12}}>
      {kpis.map((k, i) => {
        const accent = k.tone === 'warn' ? T.warn : k.tone === 'danger' ? T.danger : k.tone === 'pink' ? T.pink : T.primary;
        const soft = k.tone === 'warn' ? T.warnSoft : k.tone === 'danger' ? T.dangerSoft : k.tone === 'pink' ? T.pinkSoft : T.primarySoft;
        return (
          <Card key={i} padding={16} style={{
            background:'#fff', borderColor:T.border,
            display:'flex', flexDirection:'column', gap:6, position:'relative', overflow:'hidden',
          }}>
            <div style={{
              position:'absolute', left:0, top:0, bottom:0, width:3, background:accent,
            }}/>
            <div style={{display:'flex', alignItems:'center', gap:8, color:T.muted, fontSize:11.5, fontWeight:600, letterSpacing:0.2}}>
              <span style={{
                width:22, height:22, borderRadius:6, background:soft, color:accent,
                display:'inline-flex', alignItems:'center', justifyContent:'center',
              }}>
                <Icon name={k.icon} size={12}/>
              </span>
              {k.label}
            </div>
            <div style={{fontSize:24, fontWeight:800, color:T.text, letterSpacing:-0.6, fontFamily:T.mono}}>{k.value}</div>
            <div style={{fontSize:11.5, color:T.muted, lineHeight:1.4}}>{k.sub}</div>
          </Card>
        );
      })}
    </div>
  );
}

function FilterChip({ children, active, onClick, count, accent }) {
  const tone = accent === 'warn' ? { bg: T.warnSoft, fg: T.warn }
            : accent === 'pink' ? { bg: T.pinkSoft, fg: T.pink }
            : null;
  return (
    <button onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap:7,
      padding:'7px 12px', borderRadius:8,
      background: active ? T.text : (tone ? tone.bg : '#fff'),
      color: active ? '#fff' : (tone ? tone.fg : T.text),
      border: active ? `1px solid ${T.text}` : `1px solid ${T.border}`,
      fontSize:12.5, fontWeight:600, fontFamily:T.font, cursor:'pointer',
    }}>
      {children}
      {count != null && (
        <span style={{
          padding:'1px 7px', borderRadius:99, background: active ? 'rgba(255,255,255,.18)' : T.bg,
          color: active ? '#fff' : T.subtle, fontSize:11, fontWeight:700, fontFamily:T.mono,
        }}>{count}</span>
      )}
    </button>
  );
}

// ─── Thread row ───────────────────────────────────────────────────────
function MatThreadRow({ t, selected, onSelect, density }) {
  const mat = M.material(t.material);
  const vendor = t.po && M.vendor(t.po.vendor);
  const next = M.nextAction(t);
  const isGroup = t.kind === 'group';
  const isAdvance = t.advance;
  const accent = isGroup ? T.pink : T.primary;
  const accentSoft = isGroup ? T.pinkSoft : T.primarySoft;

  return (
    <div style={{
      background:'#fff', borderRadius:12, border:`1px solid ${selected ? accent : T.border}`,
      transition:'all .12s', overflow:'hidden',
      boxShadow: selected ? `0 1px 0 ${accent}, 0 8px 24px rgba(15,23,42,.06)` : 'none',
    }}>
      <div onClick={onSelect}
        style={{
          display:'grid',
          gridTemplateColumns: '4px 1.4fr 2fr 1.2fr 160px',
          gap:14, alignItems:'center',
          padding: density === 'compact' ? '12px 16px 12px 0' : '16px 18px 16px 0',
          cursor:'pointer',
        }}>
        {/* Left color band for group vs own */}
        <div style={{
          alignSelf:'stretch', background:accent, opacity:isGroup ? 1 : 0.35,
        }}/>

        {/* Material + ID block */}
        <div style={{display:'flex', flexDirection:'column', gap:4, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
            <span style={{
              fontSize:11, fontFamily:T.mono, fontWeight:600, color:T.subtle, letterSpacing:0.2,
            }}>{t.id}</span>
            {isGroup && (
              <Badge tone="pink" dot>Group · cluster</Badge>
            )}
            {isAdvance && (
              <Badge tone="warn" dot>Advance</Badge>
            )}
            {t.priority === 'high' && (
              <Badge tone="danger">HIGH PRIORITY</Badge>
            )}
          </div>
          <div style={{fontSize:14, fontWeight:700, color:T.text, letterSpacing:-0.2}}>
            <span style={{fontFamily:T.mono, color:T.text, fontWeight:700}}>{t.qty}</span>
            <span style={{color:T.muted, fontWeight:500}}> {t.unit} · </span>
            {mat.name}
          </div>
          <div style={{fontSize:11.5, color:T.muted}}>
            {t.section}{t.floor && t.floor !== '—' ? ` · ${t.floor}` : ''}
            {' · '}requested {fmtDate(t.requestedAt)}
          </div>
        </div>

        {/* Lifecycle bar */}
        <div>
          <ThreadPipeline t={t}/>
        </div>

        {/* Money + vendor */}
        <div style={{display:'flex', flexDirection:'column', gap:3, minWidth:0}}>
          {t.po ? (
            <>
              <div style={{fontSize:13.5, fontWeight:700, color:T.text, fontFamily:T.mono}}>{inr(t.po.amount)}</div>
              <div style={{fontSize:11.5, color:T.muted, display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                <Icon name="user" size={10} color={T.subtle}/>
                <span style={{overflow:'hidden', textOverflow:'ellipsis'}}>{vendor.name}</span>
              </div>
              {isAdvance && t.po.advance && (
                <div style={{display:'flex', alignItems:'center', gap:5, marginTop:2}}>
                  <div style={{flex:1, height:4, borderRadius:2, background:T.warnSoft, overflow:'hidden'}}>
                    <div style={{
                      width: `${(t.po.advance.batches.reduce((a,b) => a+b.qty, 0) / t.qty) * 100}%`,
                      height:'100%', background:T.warn,
                    }}/>
                  </div>
                  <span style={{fontSize:10.5, color:T.warn, fontWeight:700, fontFamily:T.mono}}>
                    {t.po.advance.batches.reduce((a,b)=>a+b.qty,0)}/{t.qty}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div style={{fontSize:11.5, color:T.subtle, fontStyle:'italic'}}>No PO yet</div>
          )}
        </div>

        {/* Next action */}
        <div style={{display:'flex', justifyContent:'flex-end'}}>
          {next ? (
            <NextActionBtn next={next} accent={accent}/>
          ) : (
            <span style={{
              fontSize:11.5, color:T.success, fontWeight:600,
              display:'inline-flex', alignItems:'center', gap:5,
              padding:'8px 12px', background:T.successSoft, borderRadius:8,
            }}>
              <Icon name="check" size={12} color={T.success}/> All clear
            </span>
          )}
        </div>
      </div>

      {/* Expanded thread detail */}
      {selected && <ThreadExpanded t={t}/>}
    </div>
  );
}

function NextActionBtn({ next, accent }) {
  const isEng = next.who === 'engineer';
  return (
    <button style={{
      display:'inline-flex', alignItems:'center', gap:6,
      padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer',
      background: accent, color:'#fff', fontSize:12, fontWeight:700, fontFamily:T.font,
      boxShadow:'0 1px 2px rgba(15,23,42,.08)',
    }}>
      {next.label}
      <Icon name="arrowRt" size={11} color="#fff"/>
    </button>
  );
}

Object.assign(window, { MatHub, MatThreadRow, MatKpiStrip, FilterChip });
