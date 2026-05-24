// Proto screens — Hub + Inter-Site, wired to the live state.

// ─── Material Hub ─────────────────────────────────────────────────────
function ProtoHub({ state, dispatch, mobile }) {
  const [filter, setFilter] = React.useState('all');
  const [layout, setLayout] = React.useState('cards'); // 'cards' | 'table'
  const counts = protoCounts(state.threads);

  const threads = React.useMemo(() => {
    if (filter === 'all')     return state.threads;
    if (filter === 'action')  return state.threads.filter(M.nextAction);
    if (filter === 'own')     return state.threads.filter(t => t.kind === 'own');
    if (filter === 'group')   return state.threads.filter(t => t.kind === 'group');
    if (filter === 'advance') return state.threads.filter(t => t.advance);
    if (filter === 'spot')    return state.threads.filter(t => t.purchaseType === 'spot');
    return state.threads;
  }, [state.threads, filter]);

  // Mobile defaults to cards (table doesn't fit)
  const effectiveLayout = mobile ? 'cards' : layout;

  return (
    <div style={{flex:1, overflow:'auto', padding: mobile ? '14px 14px 80px' : '18px 22px 80px', minHeight:0}}>
      {/* Page head */}
      <div style={{
        display:'flex', alignItems:'flex-end', justifyContent:'space-between',
        marginBottom: 16, gap: 12, flexWrap:'wrap',
      }}>
        <div>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
            <h1 style={{margin:0, fontSize: mobile ? 20 : 22, fontWeight:700, letterSpacing:-0.4}}>Material Hub</h1>
            <Badge tone="primary">{counts.all} threads</Badge>
          </div>
          <div style={{fontSize:12.5, color:T.muted}}>Every material from request to expense, on one surface.</div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          {!mobile && (
            <div style={{display:'flex', background:'#fff', padding:3, borderRadius:9, border:`1px solid ${T.border}`}}>
              <LayoutToggleBtn icon="grid" label="Cards" active={layout === 'cards'} onClick={() => setLayout('cards')}/>
              <LayoutToggleBtn icon="list" label="Table" active={layout === 'table'} onClick={() => setLayout('table')}/>
            </div>
          )}
          <Btn variant="primary" leading={<Icon name="plus" size={13}/>}
            onClick={() => dispatch({ type:'OPEN_MODAL', modal:{ kind:'new-entry' }})}>
            New entry
          </Btn>
        </div>
      </div>

      {/* KPI strip */}
      <ProtoKpiStrip state={state} counts={counts} dispatch={dispatch} mobile={mobile}/>

      {/* Allocations needed (spot purchase group batches) */}
      <div style={{marginTop:16}}>
        <AllocationsQueue state={state} dispatch={dispatch}/>
      </div>

      {/* Filter chips */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        marginTop: 22, marginBottom: 14, gap: 12, flexWrap:'wrap',
      }}>
        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
          <FilterChip active={filter==='all'} onClick={() => setFilter('all')} count={counts.all}>All</FilterChip>
          <FilterChip active={filter==='action'} onClick={() => setFilter('action')} count={counts.needsAction} accent="warn">
            <Icon name="bell" size={11} color="currentColor"/> Needs action
          </FilterChip>
          <FilterChip active={filter==='own'} onClick={() => setFilter('own')} count={counts.own}>
            <Icon name="home" size={11} color="currentColor"/> Own
          </FilterChip>
          <FilterChip active={filter==='group'} onClick={() => setFilter('group')} count={counts.group} accent="pink">
            <Icon name="link" size={11} color="currentColor"/> Group
          </FilterChip>
          <FilterChip active={filter==='advance'} onClick={() => setFilter('advance')} count={counts.advance} accent="warn">
            <Icon name="calendar" size={11} color="currentColor"/> Advance
          </FilterChip>
          <FilterChip active={filter==='spot'} onClick={() => setFilter('spot')} count={counts.spot} accent="warn">
            <Icon name="receipt" size={11} color="currentColor"/> Spot
          </FilterChip>
        </div>
      </div>

      {/* Threads — cards or table */}
      {effectiveLayout === 'cards' ? (
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {threads.length === 0 && (
            <div style={{
              padding:'40px 20px', textAlign:'center', background:'#fff', border:`1px dashed ${T.border}`, borderRadius:12,
            }}>
              <div style={{fontSize:13, color:T.muted}}>No threads match this filter.</div>
            </div>
          )}
          {threads.map(t => (
            <ProtoThreadRow t={t} key={t.id}
              selected={state.expandedId === t.id}
              onSelect={() => dispatch({ type:'SET_EXPANDED', id: t.id })}
              onAction={() => onNextAction(t, dispatch)}
              mobile={mobile}
              dispatch={dispatch}
            />
          ))}
        </div>
      ) : (
        <ProtoHubTable threads={threads} dispatch={dispatch} state={state}/>
      )}
    </div>
  );
}

function LayoutToggleBtn({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:6,
      border:'none', cursor:'pointer', fontFamily:T.font, fontWeight: active ? 700 : 600, fontSize:12,
      background: active ? T.primary : 'transparent',
      color: active ? '#fff' : T.muted,
    }}>
      <Icon name={icon} size={12} color="currentColor"/> {label}
    </button>
  );
}

function onNextAction(t, dispatch) {
  const next = M.nextAction(t);
  if (!next) return;
  // Spot purchase group needs allocation finalize
  if (t.purchaseType === 'spot' && t.kind === 'group' && t.spotStage === 'provisional') {
    return dispatch({ type:'OPEN_MODAL', modal:{ kind:'finalize-allocation', threadId: t.id }});
  }
  if (t.stage === 'requested')  dispatch({ type:'OPEN_MODAL', modal:{ kind:'approve', threadId: t.id }});
  else if (t.stage === 'approved') dispatch({ type:'OPEN_MODAL', modal:{ kind:'create-po', threadId: t.id }});
  else if (t.stage === 'ordered')  dispatch({ type:'OPEN_MODAL', modal:{ kind:'record-delivery', threadId: t.id }});
  else if (t.stage === 'delivered' && t.settlement?.status === 'pending') dispatch({ type:'OPEN_MODAL', modal:{ kind:'settle-vendor', threadId: t.id }});
  else if (t.stage === 'in-use') dispatch({ type:'OPEN_MODAL', modal:{ kind:'log-usage', threadId: t.id }});
}

// ─── KPI strip ──────────────────────────────────────────────────────
function ProtoKpiStrip({ state, counts, dispatch, mobile }) {
  const debt = protoInterSiteDebt(state.threads);
  const settleAmount = state.threads
    .filter(t => t.stage === 'delivered' && t.settlement?.status === 'pending')
    .reduce((a,t) => a + (t.po?.amount || 0), 0);

  const kpis = [
    { label:'Needs your action', value: counts.needsAction.toString(), sub:`${counts.pendingApproval} approvals · ${counts.awaitingPO} POs · ${counts.awaitingDelivery} deliveries`, tone:'warn', icon:'bell' },
    { label:'In flight', value: (counts.awaitingPO + counts.awaitingDelivery).toString(), sub:'orders, deliveries pending', tone:'primary', icon:'trend' },
    { label:'Settlement due', value: inrK(settleAmount), sub:`${counts.pendingSettlement} vendor bill${counts.pendingSettlement !== 1 ? 's' : ''}`, tone:'danger', icon:'receipt' },
    { label:'Inter-site net', value: (debt.net < 0 ? '−' : '+') + inrK(Math.abs(debt.net)), sub: debt.net < 0 ? `You owe Padmavathy` : `Padmavathy owes you`, tone:'pink', icon:'link', onClick: () => dispatch({ type:'SET_VIEW', view:'intersite' }) },
  ];
  return (
    <div style={{
      display:'grid',
      gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)',
      gap:10,
    }}>
      {kpis.map((k, i) => {
        const accent = k.tone === 'warn' ? T.warn : k.tone === 'danger' ? T.danger : k.tone === 'pink' ? T.pink : T.primary;
        const soft = k.tone === 'warn' ? T.warnSoft : k.tone === 'danger' ? T.dangerSoft : k.tone === 'pink' ? T.pinkSoft : T.primarySoft;
        return (
          <div key={i} onClick={k.onClick} style={{
            background:'#fff', border:`1px solid ${T.border}`, borderRadius:12,
            padding:14, display:'flex', flexDirection:'column', gap:5,
            position:'relative', overflow:'hidden', cursor: k.onClick ? 'pointer' : 'default',
          }}>
            <div style={{position:'absolute', left:0, top:0, bottom:0, width:3, background:accent}}/>
            <div style={{display:'flex', alignItems:'center', gap:7, color:T.muted, fontSize:11, fontWeight:600}}>
              <span style={{
                width:22, height:22, borderRadius:6, background:soft, color:accent,
                display:'inline-flex', alignItems:'center', justifyContent:'center',
              }}>
                <Icon name={k.icon} size={12}/>
              </span>
              {k.label}
            </div>
            <div style={{fontSize:22, fontWeight:800, color:T.text, letterSpacing:-0.6, fontFamily:T.mono}}>{k.value}</div>
            <div style={{fontSize:11, color:T.muted, lineHeight:1.4}}>{k.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Thread row (live) ──────────────────────────────────────────────
function ProtoThreadRow({ t, selected, onSelect, onAction, mobile, dispatch }) {
  const mat = M.material(t.material);
  const vendor = t.po && M.vendor(t.po.vendor);
  const next = M.nextAction(t);
  const isGroup = t.kind === 'group';
  const isAdvance = t.advance;
  const accent = isGroup ? T.pink : T.primary;
  const stageIdx = M_STAGES.indexOf(t.stage);

  return (
    <div style={{
      background:'#fff', borderRadius:12,
      border:`1px solid ${selected ? accent : T.border}`,
      transition:'all .12s', overflow:'hidden',
      boxShadow: selected ? `0 1px 0 ${accent}, 0 8px 24px rgba(15,23,42,.06)` : 'none',
    }}>
      <div onClick={onSelect}
        style={{
          display: mobile ? 'flex' : 'grid',
          flexDirection: mobile ? 'column' : undefined,
          gridTemplateColumns: mobile ? undefined : '4px 1.4fr 2fr 1.2fr 160px',
          gap: mobile ? 10 : 14, alignItems: mobile ? 'stretch' : 'center',
          padding: mobile ? '14px 14px 14px 14px' : '16px 18px 16px 0',
          cursor:'pointer',
          borderLeft: mobile ? `4px solid ${accent}` : undefined,
        }}>
        {!mobile && (
          <div style={{alignSelf:'stretch', background:accent, opacity: isGroup ? 1 : 0.35}}/>
        )}

        {/* Material block */}
        <div style={{display:'flex', flexDirection:'column', gap:4, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
            <span style={{fontSize:10.5, fontFamily:T.mono, fontWeight:600, color:T.subtle, letterSpacing:0.2}}>{t.id}</span>
            {t.purchaseType === 'spot' && <Badge tone="warn" dot>Spot · wallet</Badge>}
            {isGroup && <Badge tone="pink" dot>Group · cluster</Badge>}
            {isAdvance && <Badge tone="warn" dot>Advance</Badge>}
            {t.priority === 'high' && <Badge tone="danger">HIGH</Badge>}
          </div>
          <div style={{fontSize:14, fontWeight:700, color:T.text, letterSpacing:-0.1}}>
            <span style={{fontFamily:T.mono}}>{t.qty}</span>
            <span style={{color:T.muted, fontWeight:500}}> {t.unit} · </span>
            {mat.name}
          </div>
          <div style={{fontSize:11.5, color:T.muted}}>
            {t.section}{t.floor && t.floor !== '—' ? ` · ${t.floor}` : ''}
            {' · '}requested {fmtDate(t.requestedAt)}
          </div>
        </div>

        {/* Pipeline */}
        {!mobile && (
          <div><ProtoThreadPipeline t={t}/></div>
        )}

        {/* Money block */}
        {!mobile ? (
          <div style={{display:'flex', flexDirection:'column', gap:3, minWidth:0}}>
            {t.purchaseType === 'spot' ? (
              <>
                <div style={{fontSize:13.5, fontWeight:700, fontFamily:T.mono}}>{inr(t.spot.amount)}</div>
                <div style={{fontSize:11.5, color:T.muted, display:'flex', alignItems:'center', gap:5}}>
                  <Icon name="user" size={10} color={T.subtle}/>
                  <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{t.spot.vendorName}</span>
                </div>
                <div style={{fontSize:10.5, color:T.warn, fontWeight:700}}>
                  Wallet · {t.spot.paymentMode.toUpperCase()}
                </div>
              </>
            ) : t.po ? (
              <>
                <div style={{fontSize:13.5, fontWeight:700, fontFamily:T.mono}}>{inr(t.po.amount)}</div>
                <div style={{fontSize:11.5, color:T.muted, display:'flex', alignItems:'center', gap:5}}>
                  <Icon name="user" size={10} color={T.subtle}/>
                  <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{vendor.name}</span>
                </div>
                {isAdvance && t.po.advance && t.po.advance.batches.length > 0 && (
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
            ) : <div style={{fontSize:11.5, color:T.subtle, fontStyle:'italic'}}>No PO yet</div>}
          </div>
        ) : (
          // Mobile compact: pipeline as flat bar + price inline
          <>
            <div style={{display:'flex', gap:3, marginTop:4}}>
              {VISIBLE_STAGES.map((s, i) => {
                const done = M_STAGES.indexOf(s.key) <= stageIdx;
                return <div key={s.key} style={{
                  flex:1, height:4, borderRadius:2,
                  background: done ? accent : T.hairline,
                }}/>;
              })}
            </div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6}}>
              <div style={{fontSize:11, color:T.muted}}>
                {t.purchaseType === 'spot'
                  ? <>{t.spot.vendorName} · <b style={{color:T.text}}>{inr(t.spot.amount)}</b></>
                  : t.po
                    ? <>{vendor.name} · <b style={{color:T.text}}>{inr(t.po.amount)}</b></>
                    : <span style={{fontStyle:'italic'}}>No PO yet</span>}
              </div>
              <div style={{
                padding:'2px 7px', borderRadius:5, background: T.bg,
                color: T.muted, fontSize:10, fontWeight:800, letterSpacing:0.4, textTransform:'uppercase',
              }}>{M.stageLabel(t.stage)}</div>
            </div>
          </>
        )}

        {/* Next action */}
        {!mobile && (
          <div style={{display:'flex', justifyContent:'flex-end'}}>
            {next ? (
              <button onClick={(e) => { e.stopPropagation(); onAction(); }}
                style={{
                  display:'inline-flex', alignItems:'center', gap:6,
                  padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer',
                  background: accent, color:'#fff', fontSize:12, fontWeight:700, fontFamily:T.font,
                  boxShadow:'0 1px 2px rgba(15,23,42,.08)',
                }}>
                {next.label}
                <Icon name="arrowRt" size={11} color="#fff"/>
              </button>
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
        )}
      </div>

      {/* Mobile action button — full width */}
      {mobile && next && (
        <div style={{padding:'0 14px 14px'}}>
          <button onClick={onAction} style={{
            width:'100%', padding:'10px', borderRadius:9, border:'none', cursor:'pointer',
            background: accent, color:'#fff', fontSize:12.5, fontWeight:700, fontFamily:T.font,
            display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
          }}>
            {next.label} <Icon name="arrowRt" size={11} color="#fff"/>
          </button>
        </div>
      )}

      {/* Expanded thread detail */}
      {selected && !mobile && <ThreadExpanded t={t}/>}
    </div>
  );
}

// Pipeline — minimal, since the full one is in mat-thread.jsx
function ProtoThreadPipeline({ t }) {
  // Spot purchases run a different (shorter) pipeline.
  if (t.purchaseType === 'spot') {
    const stages = [
      { key:'bought',   label:'Bought',   done: true },
      { key:'inuse',    label:'In use',   done: true, current: t.kind === 'own' || t.spotStage === 'finalized' },
    ];
    if (t.kind === 'group') {
      stages.push({
        key:'finalize',
        label:'Finalize',
        done: t.spotStage === 'finalized',
        current: t.spotStage === 'provisional',
      });
    }
    return (
      <div style={{display:'flex', alignItems:'center', height:30}}>
        {stages.map((s, i) => {
          const isLast = i === stages.length - 1;
          return (
            <React.Fragment key={s.key}>
              <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:3, flexShrink:0}}>
                <div style={{
                  width:14, height:14, borderRadius:'50%',
                  background: s.done ? (s.current ? T.warn : T.text) : '#fff',
                  border: s.done ? 'none' : `2px solid ${T.warn}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  boxShadow: s.current ? `0 0 0 4px ${T.warnSoft}` : 'none',
                }}>
                  {s.done && (s.current
                    ? <span style={{width:5, height:5, borderRadius:'50%', background:'#fff', animation:'matPulse 1.6s ease-in-out infinite'}}/>
                    : <Icon name="check" size={8} color="#fff" stroke={3}/>
                  )}
                </div>
                <span style={{
                  fontSize:9, fontWeight: s.current ? 700 : 600,
                  color: s.done ? (s.current ? T.warn : T.muted) : T.warn,
                  letterSpacing:0.2, textTransform:'uppercase', whiteSpace:'nowrap',
                }}>{s.label}</span>
              </div>
              {!isLast && (
                <div style={{
                  flex:1, height:2, marginBottom:14, minWidth:14,
                  background: stages[i+1].done ? T.text : T.hairline,
                }}/>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  const stageIdx = M_STAGES.indexOf(t.stage);
  return (
    <div style={{display:'flex', alignItems:'center', height:30}}>
      {VISIBLE_STAGES.map((s, i) => {
        const done = M_STAGES.indexOf(s.key) <= stageIdx;
        const current = s.key === t.stage;
        const isLast = i === VISIBLE_STAGES.length - 1;
        return (
          <React.Fragment key={s.key}>
            <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:3, flexShrink:0}}>
              <div style={{
                width:14, height:14, borderRadius:'50%',
                background: done ? (current ? T.primary : T.text) : '#fff',
                border: done ? 'none' : `2px solid ${T.border}`,
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow: current ? `0 0 0 4px ${T.primarySoft}` : 'none',
              }}>
                {done && (current
                  ? <span style={{width:5, height:5, borderRadius:'50%', background:'#fff', animation:'matPulse 1.6s ease-in-out infinite'}}/>
                  : <Icon name="check" size={8} color="#fff" stroke={3}/>
                )}
              </div>
              <span style={{
                fontSize:9, fontWeight: current ? 700 : 600,
                color: done ? (current ? T.primary : T.muted) : T.subtle,
                letterSpacing:0.2, textTransform:'uppercase', whiteSpace:'nowrap',
              }}>{s.label}</span>
            </div>
            {!isLast && (
              <div style={{
                flex:1, height:2, marginBottom:14, minWidth:14,
                background: M_STAGES.indexOf(VISIBLE_STAGES[i+1].key) <= stageIdx ? T.text : T.hairline,
              }}/>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Inter-Site Settlement (live debt) ───────────────────────────────
function ProtoInterSite({ state, dispatch, mobile }) {
  const debt = protoInterSiteDebt(state.threads);
  const me = M.site('srinivasan');
  const other = M.site('padmavathy');
  const owesNet = debt.net < 0;

  // Group debt detail by direction for the netting math panel.
  const owedToMe = debt.detail.filter(d => d.to === 'srinivasan');     // Padma → Srinivasan
  const owedByMe = debt.detail.filter(d => d.from === 'srinivasan');   // Srinivasan → Padma
  const totalOwedToMe = owedToMe.reduce((a,d) => a + d.value, 0);
  const totalOwedByMe = owedByMe.reduce((a,d) => a + d.value, 0);
  const offset = Math.min(totalOwedToMe, totalOwedByMe);
  const netPayer = totalOwedByMe > totalOwedToMe ? me : other;
  const netReceiver = totalOwedByMe > totalOwedToMe ? other : me;
  const netAmount = Math.abs(totalOwedByMe - totalOwedToMe);

  return (
    <div style={{flex:1, overflow:'auto', padding: mobile ? '14px 14px 80px' : '18px 22px 80px'}}>
      {/* Back */}
      <button onClick={() => dispatch({ type:'SET_VIEW', view:'hub' })} style={{
        display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px 5px 5px', borderRadius:7,
        border:'none', background:'transparent', color:T.muted, fontSize:12.5, fontWeight:600,
        cursor:'pointer', marginBottom:10, fontFamily:T.font,
      }}>
        <Icon name="arrowLt" size={13} color={T.muted}/> Back to Hub
      </button>

      <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom: 16, gap:12, flexWrap:'wrap'}}>
        <div>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
            <h1 style={{margin:0, fontSize:22, fontWeight:700, letterSpacing:-0.4}}>Inter-Site Settlement</h1>
            <Badge tone="pink" dot>Pudukkottai Cluster</Badge>
          </div>
          <div style={{fontSize:12.5, color:T.muted}}>How material costs reconcile between sites that share group purchases.</div>
        </div>
        {netAmount > 0 && (
          <Btn variant="primary" leading={<Icon name="check" size={13}/>}
            onClick={() => dispatch({ type:'NET_SETTLE_INTERSITE', fromSite: netPayer.id, toSite: netReceiver.id, amount: netAmount })}>
            Net settle {inr(netAmount)}
          </Btn>
        )}
      </div>

      {/* Balance card */}
      <div style={{
        background:'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color:'#fff', padding: mobile ? '20px' : '24px 28px',
        display:'grid',
        gridTemplateColumns: mobile ? '1fr' : '1fr auto 1fr',
        alignItems:'center', gap: mobile ? 16 : 24,
        borderRadius:12, marginBottom:16, overflow:'hidden',
      }}>
        <div style={{textAlign: mobile ? 'left' : 'right'}}>
          <div style={{fontSize:11, opacity:0.6, letterSpacing:0.5, fontWeight:600, textTransform:'uppercase', marginBottom:4}}>
            You owe
          </div>
          <div style={{fontSize: mobile ? 26 : 30, fontWeight:800, fontFamily:T.mono, letterSpacing:-0.6, color:'#f87171'}}>
            {inr(debt.iOwe)}
          </div>
          <div style={{fontSize:11, opacity:0.7, marginTop:3}}>{owedByMe.length} record{owedByMe.length !== 1 ? 's' : ''} · for using their batches</div>
        </div>
        <div style={{display:'flex', flexDirection: mobile ? 'row' : 'column', alignItems:'center', gap: mobile ? 12 : 6, justifyContent: mobile ? 'center' : undefined}}>
          <div style={{
            width:36, height:36, borderRadius:'50%',
            background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <Icon name="link" size={16} color="#fff"/>
          </div>
          {!mobile && <div style={{fontSize:9.5, opacity:0.5, letterSpacing:0.6, fontWeight:700, textTransform:'uppercase'}}>net</div>}
          <div style={{fontSize: mobile ? 18 : 16, fontWeight:800, fontFamily:T.mono, color: owesNet ? '#f87171' : '#34d399'}}>
            {owesNet ? '−' : '+'}{inrK(Math.abs(debt.net))}
          </div>
        </div>
        <div>
          <div style={{fontSize:11, opacity:0.6, letterSpacing:0.5, fontWeight:600, textTransform:'uppercase', marginBottom:4}}>
            Others owe you
          </div>
          <div style={{fontSize: mobile ? 26 : 30, fontWeight:800, fontFamily:T.mono, letterSpacing:-0.6, color:'#34d399'}}>
            {inr(debt.othersOwe)}
          </div>
          <div style={{fontSize:11, opacity:0.7, marginTop:3}}>{owedToMe.length} record{owedToMe.length !== 1 ? 's' : ''} · for using your batches</div>
        </div>
      </div>

      {/* NETTING MATH — the worked example */}
      <NettingMath
        me={me} other={other}
        owedToMe={owedToMe} totalOwedToMe={totalOwedToMe}
        owedByMe={owedByMe} totalOwedByMe={totalOwedByMe}
        offset={offset} netPayer={netPayer} netReceiver={netReceiver} netAmount={netAmount}
        dispatch={dispatch} mobile={mobile}
      />

      {/* Shared batches */}
      <div style={{background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginTop:16}}>
        <div style={{padding:'14px 18px', borderBottom:`1px solid ${T.border}`}}>
          <h3 style={{margin:0, fontSize:14, fontWeight:700}}>Shared batches · in use</h3>
          <div style={{fontSize:11.5, color:T.muted, marginTop:2}}>
            Each batch tracks who paid for it and which sites consumed it. Debt accrues automatically as usage is logged.
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(2, 1fr)'}}>
          {state.threads.filter(t => t.kind === 'group' && t.inventory && t.inventory.remaining > 0 && t.interSiteUsage && t.interSiteUsage.length > 0).map((t, i, arr) => (
            <SharedBatchCard t={t} key={t.id} last={i >= arr.length - (mobile ? 1 : 2)}/>
          ))}
          {state.threads.filter(t => t.kind === 'group' && t.inventory && t.inventory.remaining > 0 && t.interSiteUsage && t.interSiteUsage.length > 0).length === 0 && (
            <div style={{padding:'30px 20px', textAlign:'center', fontSize:12.5, color:T.muted}}>
              No active group batches with logged usage. Spot batches show up here once their split is finalized.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Netting math — explains how iOwe + othersOwe offset into a single net ───
function NettingMath({ me, other, owedToMe, totalOwedToMe, owedByMe, totalOwedByMe, offset, netPayer, netReceiver, netAmount, dispatch, mobile }) {
  if (totalOwedToMe === 0 && totalOwedByMe === 0) return null;
  return (
    <div style={{background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{padding:'14px 18px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div>
          <h3 style={{margin:0, fontSize:14, fontWeight:700}}>How this nets · worked example</h3>
          <div style={{fontSize:11.5, color:T.muted, marginTop:2}}>Smaller debt cancels into the larger. Settle once for the difference instead of two separate transfers.</div>
        </div>
        <Badge tone="primary">Auto-computed</Badge>
      </div>

      <div style={{padding: mobile ? '16px' : '20px 22px'}}>
        {/* Two directions, side-by-side */}
        <div style={{
          display:'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
          gap:12, marginBottom:14,
        }}>
          {/* Direction A: others owe me */}
          <DirectionPanel
            from={other} to={me} amount={totalOwedToMe} records={owedToMe}
            color={T.success} reasonShort="used your batches" emptyReason="No batches you paid for that others used yet."
          />
          {/* Direction B: I owe others */}
          <DirectionPanel
            from={me} to={other} amount={totalOwedByMe} records={owedByMe}
            color={T.danger} reasonShort="used their batches" emptyReason="No batches they paid for that you used yet."
          />
        </div>

        {/* Equation */}
        <div style={{
          background:T.bg, border:`1px dashed ${T.border}`, borderRadius:10,
          padding: mobile ? '12px 14px' : '14px 18px',
        }}>
          <div style={{fontSize:10.5, fontWeight:700, color:T.subtle, letterSpacing:0.5, textTransform:'uppercase', marginBottom:8}}>
            The math
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:6, fontFamily:T.mono, fontSize:13.5, color:T.text}}>
            <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
              <span style={{color: totalOwedToMe > 0 ? T.success : T.subtle}}>+ {inr(totalOwedToMe)}</span>
              <span style={{color:T.subtle, fontFamily:T.font, fontWeight:500, fontSize:11.5}}>
                ({other.short} owes {me.short})
              </span>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
              <span style={{color: totalOwedByMe > 0 ? T.danger : T.subtle}}>− {inr(totalOwedByMe)}</span>
              <span style={{color:T.subtle, fontFamily:T.font, fontWeight:500, fontSize:11.5}}>
                ({me.short} owes {other.short})
              </span>
            </div>
            <div style={{height:1, background:T.border, margin:'4px 0'}}/>
            <div style={{display:'flex', alignItems:'center', gap:10, fontWeight:800, fontSize:16}}>
              = <span style={{color: netAmount === 0 ? T.success : T.text}}>{netAmount === 0 ? '₹0' : inr(netAmount)}</span>
              {netAmount > 0 && (
                <span style={{fontFamily:T.font, fontWeight:600, fontSize:12.5, color:T.muted}}>
                  → <span style={{color: netPayer.accent, fontWeight:800}}>{netPayer.short}</span> pays <span style={{color: netReceiver.accent, fontWeight:800}}>{netReceiver.short}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action */}
        {netAmount > 0 && (
          <div style={{
            marginTop:12,
            padding:'12px 14px',
            background: T.primarySoft, borderRadius:10,
            display:'flex', alignItems:'center', gap:12,
          }}>
            <Icon name="info" size={14} color={T.primary}/>
            <div style={{flex:1, fontSize:12, color:T.primary, fontWeight:600, lineHeight:1.5}}>
              <span style={{fontWeight:700}}>{netPayer.name}</span> will transfer <span style={{fontFamily:T.mono, fontWeight:800}}>{inr(netAmount)}</span> to <span style={{fontWeight:700}}>{netReceiver.name}</span>.
              Both sites' material-expense ledgers update automatically.
            </div>
            <button onClick={() => dispatch({ type:'NET_SETTLE_INTERSITE', fromSite: netPayer.id, toSite: netReceiver.id, amount: netAmount })}
              style={{
                padding:'8px 12px', borderRadius:7, border:'none', cursor:'pointer',
                background:T.primary, color:'#fff', fontSize:11.5, fontWeight:700, fontFamily:T.font, whiteSpace:'nowrap',
              }}>
              Settle now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DirectionPanel({ from, to, amount, records, color, reasonShort, emptyReason }) {
  return (
    <div style={{
      background:'#fff', border:`1px solid ${T.border}`, borderRadius:10, padding:'12px 14px',
    }}>
      {/* From → To */}
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10}}>
        <span style={{
          padding:'3px 8px', borderRadius:5, background:`${from.accent}1a`, color:from.accent,
          fontSize:11, fontWeight:800, letterSpacing:0.3,
        }}>{from.short}</span>
        <Icon name="arrowRt" size={11} color={T.subtle}/>
        <span style={{
          padding:'3px 8px', borderRadius:5, background:`${to.accent}1a`, color:to.accent,
          fontSize:11, fontWeight:800, letterSpacing:0.3,
        }}>{to.short}</span>
        <span style={{fontSize:10.5, color:T.muted, fontWeight:600}}>{reasonShort}</span>
      </div>
      <div style={{fontSize:22, fontWeight:800, fontFamily:T.mono, letterSpacing:-0.5, color: amount > 0 ? color : T.subtle}}>
        {inr(amount)}
      </div>
      <div style={{fontSize:11, color:T.muted, marginTop:4, marginBottom: records.length > 0 ? 10 : 0}}>
        {records.length} {records.length === 1 ? 'record' : 'records'}
      </div>
      {/* Top contributing records */}
      {records.length > 0 ? (
        <div style={{display:'flex', flexDirection:'column', gap:5, marginTop:4}}>
          {records.slice(0, 4).map((r, i) => {
            const mat = M.material(r.thread.material);
            return (
              <div key={i} style={{
                display:'flex', alignItems:'center', gap:8, fontSize:11,
                padding:'5px 8px', background:T.bg, borderRadius:6,
              }}>
                <span style={{fontFamily:T.mono, color:T.subtle, fontSize:10}}>{r.thread.inventory.batch}</span>
                <span style={{flex:1, color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{mat.name}</span>
                <span style={{fontFamily:T.mono, fontWeight:700, color:T.text}}>{inr(r.value)}</span>
              </div>
            );
          })}
          {records.length > 4 && (
            <div style={{fontSize:10.5, color:T.subtle, fontWeight:600, padding:'2px 8px'}}>
              +{records.length - 4} more
            </div>
          )}
        </div>
      ) : (
        <div style={{fontSize:11, color:T.subtle, fontStyle:'italic', marginTop:8}}>{emptyReason}</div>
      )}
    </div>
  );
}

Object.assign(window, {
  ProtoHub, ProtoInterSite, ProtoThreadRow, ProtoKpiStrip, onNextAction,
});
