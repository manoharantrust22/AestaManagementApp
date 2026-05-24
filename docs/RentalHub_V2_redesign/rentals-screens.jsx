// Rental Hub — the screen-level surface. Direct port of the materials Hub
// pattern: KPI strip, action queue panel, filter chips, thread-row list with
// inline 5-stage pipeline and context-aware next-action button.

function RentalHub({ state, dispatch, mobile }) {
  const [filter, setFilter] = React.useState('active');
  const [layout, setLayout] = React.useState('cards'); // 'cards' | 'table'
  const counts = rentalsCounts(state.orders);
  const totals = rentalsTotals(state.orders);

  const orders = React.useMemo(() => {
    const list = state.orders;
    if (filter === 'all')      return list;
    if (filter === 'action')   return list.filter(o => R.nextAction(o));
    if (filter === 'overdue')  return list.filter(R.isOverdue);
    if (filter === 'active')   return list.filter(o => ['active','partially_returned','confirmed','pending'].includes(o.status));
    if (filter === 'tosettle') return list.filter(o => o.status === 'completed');
    if (filter === 'history')  return list.filter(o => ['settled','cancelled'].includes(o.status));
    return list;
  }, [state.orders, filter]);

  const effectiveLayout = mobile ? 'cards' : layout;

  return (
    <div style={{flex:1, overflow:'auto', padding: mobile ? '14px 14px 80px' : '18px 22px 80px', minHeight:0}}>
      <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom: 16, gap: 12, flexWrap:'wrap'}}>
        <div>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
            <h1 style={{margin:0, fontSize: mobile ? 20 : 22, fontWeight:700, letterSpacing:-0.4}}>Rental Hub</h1>
            <Badge tone="primary">{counts.all} orders</Badge>
          </div>
          <div style={{fontSize:12.5, color:T.muted}}>Equipment, scaffolding, centring — track from request to settlement.</div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          {!mobile && (
            <div style={{display:'flex', background:'#fff', padding:3, borderRadius:9, border:`1px solid ${T.border}`}}>
              <RLayoutBtn icon="grid" label="Cards" active={layout === 'cards'} onClick={() => setLayout('cards')}/>
              <RLayoutBtn icon="list" label="Table" active={layout === 'table'} onClick={() => setLayout('table')}/>
            </div>
          )}
          <Btn variant="primary" leading={<Icon name="plus" size={13}/>}
            onClick={() => dispatch({type:'OPEN_MODAL', modal:{ kind:'create-rental' }})}>
            New rental
          </Btn>
        </div>
      </div>

      {/* KPI strip — 4 tiles */}
      <RentalKpis state={state} counts={counts} totals={totals} mobile={mobile}/>

      {/* Action queue: overdue alert + ready-to-return + ready-to-settle */}
      <RentalActionQueue state={state} dispatch={dispatch}/>

      {/* Filter chips */}
      <div style={{display:'flex', gap:6, marginTop:18, marginBottom:14, flexWrap:'wrap'}}>
        <FilterChip active={filter==='active'} onClick={() => setFilter('active')} count={counts.active + counts.pending + counts.confirmed} accent="primary">
          <Icon name="trend" size={11} color="currentColor"/> Active
        </FilterChip>
        <FilterChip active={filter==='action'} onClick={() => setFilter('action')} count={counts.needsAction} accent="warn">
          <Icon name="bell" size={11} color="currentColor"/> Needs action
        </FilterChip>
        <FilterChip active={filter==='overdue'} onClick={() => setFilter('overdue')} count={counts.overdue} accent="danger">
          <Icon name="bell" size={11} color="currentColor"/> Overdue
        </FilterChip>
        <FilterChip active={filter==='tosettle'} onClick={() => setFilter('tosettle')} count={counts.toSettle}>
          <Icon name="receipt" size={11} color="currentColor"/> To settle
        </FilterChip>
        <FilterChip active={filter==='history'} onClick={() => setFilter('history')} count={counts.settled + counts.cancelled}>
          <Icon name="check" size={11} color="currentColor"/> History
        </FilterChip>
        <FilterChip active={filter==='all'} onClick={() => setFilter('all')} count={counts.all}>All</FilterChip>
      </div>

      {/* Orders */}
      {effectiveLayout === 'cards' ? (
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {orders.length === 0 && (
            <div style={{padding:'40px 20px', textAlign:'center', background:'#fff', border:`1px dashed ${T.border}`, borderRadius:12}}>
              <div style={{fontSize:13, color:T.muted}}>No orders match this filter.</div>
            </div>
          )}
          {orders.map(o => (
            <RentalRow o={o} key={o.id} dispatch={dispatch} mobile={mobile}/>
          ))}
        </div>
      ) : (
        <RentalTable orders={orders} dispatch={dispatch}/>
      )}
    </div>
  );
}

function RLayoutBtn({ icon, label, active, onClick }) {
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

// Filter chip — same pattern as the materials hub. Inline so the rental
// prototype is self-contained (doesn't pull mat-hub.jsx into its load chain).
function FilterChip({ children, active, onClick, count, accent }) {
  const tone = accent === 'warn' ? { bg: T.warnSoft, fg: T.warn }
            : accent === 'danger' ? { bg: T.dangerSoft, fg: T.danger }
            : accent === 'pink' ? { bg: T.pinkSoft, fg: T.pink }
            : accent === 'primary' ? { bg: T.primarySoft, fg: T.primary }
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

// ─── KPI strip ──────────────────────────────────────────────────────
function RentalKpis({ state, counts, totals, mobile }) {
  const kpis = [
    { label:'Needs action', value: counts.needsAction.toString(),
      sub: `${counts.pending} approval${counts.pending !== 1 ? 's' : ''} · ${counts.toReturn} to return · ${counts.toSettle} to settle`,
      tone:'warn', icon:'bell' },
    { label:'Active orders', value: counts.active.toString(),
      sub: counts.overdue > 0 ? `${counts.overdue} overdue · accruing daily` : `cost meter ticking`,
      tone: counts.overdue > 0 ? 'danger' : 'primary', icon:'trend' },
    { label:'Balance due', value: inrK(totals.balance),
      sub: `Advances ₹${totals.advances.toLocaleString('en-IN')}`,
      tone:'pink', icon:'receipt' },
    { label:'Accrued · live', value: inrK(totals.accrued),
      sub: `on active orders right now`,
      tone:'primary', icon:'calendar' },
  ];
  return (
    <div style={{display:'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap:10}}>
      {kpis.map((k, i) => {
        const accent = k.tone === 'warn' ? T.warn : k.tone === 'danger' ? T.danger : k.tone === 'pink' ? T.pink : T.primary;
        const soft = k.tone === 'warn' ? T.warnSoft : k.tone === 'danger' ? T.dangerSoft : k.tone === 'pink' ? T.pinkSoft : T.primarySoft;
        return (
          <div key={i} style={{
            background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, padding:14,
            display:'flex', flexDirection:'column', gap:5, position:'relative', overflow:'hidden',
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

// ─── Action queue (overdue + ready-to-return + ready-to-settle) ───────
function RentalActionQueue({ state, dispatch }) {
  const overdue = state.orders.filter(R.isOverdue);
  const toSettle = state.orders.filter(o => o.status === 'completed');
  if (overdue.length === 0 && toSettle.length === 0) return null;

  return (
    <div style={{marginTop:16, display:'flex', flexDirection:'column', gap:10}}>
      {overdue.length > 0 && (
        <div style={{background:'#fff', border:`1px solid ${T.danger}55`, borderRadius:12, overflow:'hidden'}}>
          <div style={{padding:'10px 14px', background:T.dangerSoft, borderBottom:`1px solid ${T.danger}33`, display:'flex', alignItems:'center', gap:10}}>
            <Icon name="bell" size={14} color={T.danger}/>
            <div style={{flex:1}}>
              <div style={{fontSize:12.5, fontWeight:700, color:T.danger}}>{overdue.length} order{overdue.length !== 1 ? 's are' : ' is'} overdue</div>
              <div style={{fontSize:11, color:T.muted}}>Each extra day adds to the bill. Either record return or extend the date.</div>
            </div>
          </div>
          {overdue.map((o, i) => (
            <ActionQueueRow o={o} key={o.id} dispatch={dispatch} last={i === overdue.length - 1}/>
          ))}
        </div>
      )}
      {toSettle.length > 0 && (
        <div style={{background:'#fff', border:`1px solid ${T.warn}55`, borderRadius:12, overflow:'hidden'}}>
          <div style={{padding:'10px 14px', background:T.warnSoft, borderBottom:`1px solid ${T.warn}33`, display:'flex', alignItems:'center', gap:10}}>
            <Icon name="receipt" size={14} color={T.warn}/>
            <div style={{flex:1}}>
              <div style={{fontSize:12.5, fontWeight:700, color:T.warn}}>{toSettle.length} return{toSettle.length !== 1 ? 's' : ''} ready to settle</div>
              <div style={{fontSize:11, color:T.muted}}>Equipment back. Settle the vendor (negotiate if you can) + any transport.</div>
            </div>
          </div>
          {toSettle.map((o, i) => (
            <ActionQueueRow o={o} key={o.id} dispatch={dispatch} last={i === toSettle.length - 1} settleMode/>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionQueueRow({ o, dispatch, last, settleMode }) {
  const v = R.vendor(o.vendor);
  const overdue = R.overdueDays(o);
  const days = R.daysElapsed(o);
  return (
    <div style={{
      padding:'10px 14px', borderBottom: !last ? `1px solid ${T.hairline}` : 'none',
      display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:14, alignItems:'center',
    }}>
      <span style={{fontFamily:T.mono, fontSize:10.5, color:T.subtle, fontWeight:600}}>{o.id}</span>
      <div>
        <div style={{fontSize:12.5, fontWeight:700, color:T.text}}>
          {v.name} <span style={{color:T.muted, fontWeight:500}}>· {R.qtyOutstanding(o) > 0 ? `${R.qtyOutstanding(o)} pieces on site` : 'returned'}</span>
        </div>
        <div style={{fontSize:10.5, color:T.muted}}>
          {settleMode
            ? <>Vendor: ₹{Math.round(R.accruedCost(o)).toLocaleString('en-IN')} accrued · advance ₹{R.totalAdvances(o).toLocaleString('en-IN')}</>
            : <>{o.items.map(ln => `${ln.qty} ${R.item(ln.item).name}${ln.variant ? ' '+R.variantLabel(ln.item, ln.variant) : ''}`).join(' · ')}</>}
        </div>
      </div>
      {!settleMode && (
        <span style={{
          padding:'2px 7px', borderRadius:4, background:T.dangerSoft, color:T.danger,
          fontSize:10, fontWeight:800, letterSpacing:0.3, textTransform:'uppercase',
        }}>{overdue}d overdue · {days}d total</span>
      )}
      {settleMode ? (
        <button onClick={() => dispatch({ type:'OPEN_MODAL', modal:{ kind:'settle-rental', orderId: o.id }})} style={{
          padding:'6px 11px', borderRadius:7, border:'none', cursor:'pointer',
          background:T.warn, color:'#fff', fontSize:11, fontWeight:700, fontFamily:T.font,
          display:'inline-flex', alignItems:'center', gap:5,
        }}>Settle <Icon name="arrowRt" size={10} color="#fff"/></button>
      ) : (
        <div style={{display:'flex', gap:6}}>
          <button onClick={() => dispatch({ type:'OPEN_MODAL', modal:{ kind:'record-return', orderId: o.id }})} style={{
            padding:'6px 11px', borderRadius:7, border:'none', cursor:'pointer',
            background:T.danger, color:'#fff', fontSize:11, fontWeight:700, fontFamily:T.font,
            display:'inline-flex', alignItems:'center', gap:5,
          }}>Return</button>
          <button onClick={() => dispatch({ type:'OPEN_MODAL', modal:{ kind:'extend-date', orderId: o.id }})} style={{
            padding:'6px 11px', borderRadius:7, border:`1px solid ${T.border}`, cursor:'pointer',
            background:'#fff', color:T.text, fontSize:11, fontWeight:700, fontFamily:T.font,
          }}>Extend</button>
        </div>
      )}
    </div>
  );
}

// ─── Rental row ─────────────────────────────────────────────────────
function RentalRow({ o, dispatch, mobile }) {
  const v = R.vendor(o.vendor);
  const next = R.nextAction(o);
  const overdue = R.isOverdue(o);
  const overdueDays = R.overdueDays(o);
  const daysElapsed = R.daysElapsed(o);
  const accrued = R.accruedCost(o);
  const advance = R.totalAdvances(o);
  const balance = R.balanceDue(o);
  const isGroup = o.kind === 'group';
  const accent = o.status === 'settled' ? T.success
              : overdue ? T.danger
              : o.status === 'completed' ? T.warn
              : isGroup ? T.pink : T.primary;
  const isActive = ['active','partially_returned'].includes(o.status);

  return (
    <div style={{
      background:'#fff', borderRadius:12, border:`1px solid ${T.border}`, overflow:'hidden',
    }}>
      <div style={{
        display: mobile ? 'flex' : 'grid',
        flexDirection: mobile ? 'column' : undefined,
        gridTemplateColumns: mobile ? undefined : '4px 1.6fr 2fr 1.4fr 170px',
        gap: mobile ? 10 : 14, alignItems: mobile ? 'stretch' : 'center',
        padding: mobile ? '14px' : '16px 18px 16px 0',
        borderLeft: mobile ? `4px solid ${accent}` : undefined,
      }}>
        {!mobile && <div style={{alignSelf:'stretch', background:accent, opacity: isGroup ? 1 : 0.7}}/>}

        {/* Vendor + items */}
        <div style={{display:'flex', flexDirection:'column', gap:4, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
            <span style={{fontSize:10.5, fontFamily:T.mono, fontWeight:600, color:T.subtle, letterSpacing:0.2}}>{o.id}</span>
            {isGroup && <Badge tone="pink" dot>Group</Badge>}
            {overdue && <Badge tone="danger">OVERDUE {overdueDays}d</Badge>}
            {o.items.some(ln => ln.rateType === 'hourly') && <Badge tone="warn" dot>Hourly</Badge>}
          </div>
          <div style={{fontSize:14, fontWeight:700, color:T.text, letterSpacing:-0.1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
            {v.name}
          </div>
          <div style={{fontSize:11.5, color:T.muted}}>
            {o.items.map(ln => {
              const it = R.item(ln.item);
              const v = ln.variant ? ' '+R.variantLabel(ln.item, ln.variant) : '';
              return `${ln.qty} ${it.name}${v}`;
            }).join(' · ')}
          </div>
          <div style={{fontSize:11, color:T.subtle, marginTop:2}}>
            {o.section}
            {o.actualStart && ` · ${daysElapsed}d elapsed`}
            {o.expectedEnd && !overdue && ` · due ${fmtDate(o.expectedEnd)}`}
          </div>
        </div>

        {/* Pipeline */}
        {!mobile && <div><RentalPipeline o={o}/></div>}

        {/* Cost meter / money */}
        {!mobile ? <RentalMoneyBlock o={o} accrued={accrued} advance={advance} balance={balance} isActive={isActive}/> : (
          <>
            <RentalPipelineFlat o={o} accent={accent}/>
            <RentalMoneyBlockMobile o={o} accrued={accrued} advance={advance} balance={balance} isActive={isActive}/>
          </>
        )}

        {/* Next action */}
        {!mobile && (
          <div style={{display:'flex', justifyContent:'flex-end'}}>
            <NextActionBtnRental next={next} order={o} dispatch={dispatch} accent={accent}/>
          </div>
        )}
      </div>

      {/* Mobile: action footer */}
      {mobile && next && (
        <div style={{padding:'0 14px 14px'}}>
          <NextActionBtnRental next={next} order={o} dispatch={dispatch} accent={accent} fullWidth/>
        </div>
      )}
    </div>
  );
}

function NextActionBtnRental({ next, order, dispatch, accent, fullWidth }) {
  if (!next) {
    return (
      <span style={{
        fontSize:11.5, color:T.success, fontWeight:600,
        display:'inline-flex', alignItems:'center', gap:5,
        padding:'8px 12px', background:T.successSoft, borderRadius:8,
        width: fullWidth ? '100%' : 'auto', justifyContent: fullWidth ? 'center' : 'flex-start',
      }}>
        <Icon name="check" size={12} color={T.success}/> All clear
      </span>
    );
  }
  const onClick = () => {
    if (order.status === 'pending')        dispatch({ type:'OPEN_MODAL', modal:{ kind:'approve-rental',   orderId: order.id }});
    else if (order.status === 'confirmed') dispatch({ type:'OPEN_MODAL', modal:{ kind:'verify-delivery', orderId: order.id }});
    else if (['active','partially_returned'].includes(order.status)) dispatch({ type:'OPEN_MODAL', modal:{ kind:'record-return', orderId: order.id }});
    else if (order.status === 'completed') dispatch({ type:'OPEN_MODAL', modal:{ kind:'settle-rental', orderId: order.id }});
  };
  return (
    <button onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap:6, justifyContent:'center',
      padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer',
      background: accent, color:'#fff', fontSize:12, fontWeight:700, fontFamily:T.font,
      boxShadow:'0 1px 2px rgba(15,23,42,.08)', width: fullWidth ? '100%' : 'auto',
    }}>
      {next.label}
      <Icon name="arrowRt" size={11} color="#fff"/>
    </button>
  );
}

// Pipeline — 5 stages collapsed from the 8-state internal taxonomy
function RentalPipeline({ o }) {
  const cur = R.stage(o);
  const isCancelled = o.status === 'cancelled';
  const isOverdue = R.isOverdue(o);
  const stageList = R_STAGES.map((key, i) => {
    const curIdx = R_STAGES.indexOf(cur);
    const done = !isCancelled && i <= curIdx;
    const current = !isCancelled && key === cur;
    return { key, label: R_STAGE_LABELS[key], done, current };
  });
  return (
    <div style={{display:'flex', alignItems:'center', height:30}}>
      {stageList.map((s, i) => {
        const isLast = i === stageList.length - 1;
        const tone = isOverdue && s.current ? T.danger : T.primary;
        const toneSoft = isOverdue && s.current ? T.dangerSoft : T.primarySoft;
        return (
          <React.Fragment key={s.key}>
            <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:3, flexShrink:0}}>
              <div style={{
                width:14, height:14, borderRadius:'50%',
                background: s.done ? (s.current ? tone : T.text) : '#fff',
                border: s.done ? 'none' : `2px solid ${T.border}`,
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow: s.current ? `0 0 0 4px ${toneSoft}` : 'none',
              }}>
                {s.done && (s.current
                  ? <span style={{width:5, height:5, borderRadius:'50%', background:'#fff', animation:'matPulse 1.6s ease-in-out infinite'}}/>
                  : <Icon name="check" size={8} color="#fff" stroke={3}/>
                )}
              </div>
              <span style={{
                fontSize:9, fontWeight: s.current ? 700 : 600,
                color: s.done ? (s.current ? tone : T.muted) : T.subtle,
                letterSpacing:0.2, textTransform:'uppercase', whiteSpace:'nowrap',
              }}>{s.label}</span>
            </div>
            {!isLast && (
              <div style={{
                flex:1, height:2, marginBottom:14, minWidth:14,
                background: i < R_STAGES.indexOf(cur) ? T.text : T.hairline,
              }}/>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function RentalPipelineFlat({ o, accent }) {
  const curIdx = R_STAGES.indexOf(R.stage(o));
  return (
    <div style={{display:'flex', gap:3, marginTop:4}}>
      {R_STAGES.map((s, i) => (
        <div key={s} style={{
          flex:1, height:4, borderRadius:2,
          background: i <= curIdx ? accent : T.hairline,
        }}/>
      ))}
    </div>
  );
}

// Money / cost meter block — for active orders shows live cost-meter; for
// completed shows accrued vs balance; for settled shows the final number.
function RentalMoneyBlock({ o, accrued, advance, balance, isActive }) {
  if (o.status === 'settled') {
    return (
      <div>
        <div style={{fontSize:13.5, fontWeight:700, fontFamily:T.mono}}>{inr(o.settlements.vendor.negotiated)}</div>
        <div style={{fontSize:11, color:T.success, fontWeight:700, marginTop:2}}>
          Settled · saved ₹{(o.settlements.vendor.savings || 0).toLocaleString('en-IN')}
        </div>
      </div>
    );
  }
  if (o.status === 'completed') {
    return (
      <div>
        <div style={{fontSize:13.5, fontWeight:700, fontFamily:T.mono}}>{inr(accrued)}</div>
        <div style={{fontSize:11, color:T.warn, fontWeight:700, marginTop:2}}>
          Accrued · advance {inr(advance)}
        </div>
        <div style={{fontSize:10.5, color:T.muted, marginTop:1}}>
          Balance ~{inr(balance)} after negotiation
        </div>
      </div>
    );
  }
  if (isActive) {
    const dailyAccrual = o.items.reduce((a, ln) => {
      if (ln.rateType === 'daily') return a + ln.dailyRate * ln.qty;
      return a + ln.hourlyRate * 8;
    }, 0);
    return (
      <div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <div style={{fontSize:13.5, fontWeight:700, fontFamily:T.mono}}>{inr(accrued)}</div>
          <span style={{
            padding:'1px 6px', borderRadius:4, background:T.warnSoft, color:T.warn,
            fontSize:9.5, fontWeight:800, letterSpacing:0.4, display:'inline-flex', alignItems:'center', gap:4,
          }}>
            <span style={{
              width:5, height:5, borderRadius:'50%', background:T.warn,
              animation: 'matPulse 1.6s ease-in-out infinite',
            }}/>
            LIVE
          </span>
        </div>
        <div style={{fontSize:11, color:T.muted, marginTop:2}}>
          +{inr(dailyAccrual)}/day · advance {inr(advance)}
        </div>
      </div>
    );
  }
  // pending / confirmed
  return (
    <div>
      <div style={{fontSize:13.5, fontWeight:700, fontFamily:T.mono, color:T.subtle}}>—</div>
      <div style={{fontSize:11, color:T.muted, marginTop:2}}>
        Cost meter starts on delivery
      </div>
    </div>
  );
}

function RentalMoneyBlockMobile({ o, accrued, advance, balance, isActive }) {
  return (
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6}}>
      <div style={{fontSize:11, color:T.muted}}>
        {o.status === 'settled' ? <>Settled · <b style={{color:T.text}}>{inr(o.settlements.vendor.negotiated)}</b></>
        : o.status === 'completed' ? <>Accrued · <b style={{color:T.text}}>{inr(accrued)}</b></>
        : isActive ? <><b style={{color:T.text}}>{inr(accrued)}</b> · live</>
        : <span style={{fontStyle:'italic'}}>Not yet on site</span>}
      </div>
      <div style={{
        padding:'2px 7px', borderRadius:5, background:T.bg, color:T.muted,
        fontSize:10, fontWeight:800, letterSpacing:0.4, textTransform:'uppercase',
      }}>{R.stage(o)}</div>
    </div>
  );
}

// ─── Compact rental table (alternative view) ─────────────────────────
function RentalTable({ orders, dispatch }) {
  const [sortKey, setSortKey] = React.useState('reqDate');
  const [sortDir, setSortDir] = React.useState('desc');
  const onSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };
  const sorted = React.useMemo(() => {
    const cmp = (a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'reqDate': av = a.requestedAt; bv = b.requestedAt; break;
        case 'vendor':  av = R.vendor(a.vendor).name; bv = R.vendor(b.vendor).name; break;
        case 'status':  av = R.stage(a); bv = R.stage(b); break;
        case 'accrued': av = R.accruedCost(a); bv = R.accruedCost(b); break;
        case 'balance': av = R.balanceDue(a); bv = R.balanceDue(b); break;
        case 'endDate': av = a.expectedEnd; bv = b.expectedEnd; break;
        default: return 0;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    };
    return orders.slice().sort(cmp);
  }, [orders, sortKey, sortDir]);

  const cols = [
    { key:'reqDate', label:'Order #',   sort:true, width: 140 },
    { key:'status',  label:'Stage',     sort:true, width: 120 },
    { key:'vendor',  label:'Vendor',    sort:true, width: 200 },
    { key:'items',   label:'Items',     sort:false,width: 220 },
    { key:'endDate', label:'Due',       sort:true, width: 110 },
    { key:'accrued', label:'Accrued',   sort:true, width: 100, align:'right' },
    { key:'balance', label:'Balance',   sort:true, width: 100, align:'right' },
    { key:'action',  label:'',          sort:false,width: 130 },
  ];

  return (
    <div style={{background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{overflow:'auto', maxHeight:680}}>
        <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0, fontFamily:T.font, fontSize:12.5, minWidth: 1080}}>
          <colgroup>{cols.map(c => <col key={c.key} style={{width: c.width}}/>)}</colgroup>
          <thead>
            <tr>{cols.map(c => (
              <th key={c.key} onClick={c.sort ? () => onSort(c.key) : undefined}
                style={{
                  position:'sticky', top:0, background:T.bg, zIndex:2,
                  textAlign: c.align || 'left', padding:'10px 12px', borderBottom:`1px solid ${T.border}`,
                  fontSize:10.5, fontWeight:700, color:T.muted, letterSpacing:0.4, textTransform:'uppercase',
                  whiteSpace:'nowrap', cursor: c.sort ? 'pointer' : 'default', userSelect:'none',
                }}>
                <span style={{display:'inline-flex', alignItems:'center', gap:5}}>
                  {c.label}
                  {c.sort && (
                    <span style={{
                      opacity: sortKey === c.key ? 1 : 0.25,
                      color: sortKey === c.key ? T.primary : T.subtle,
                      fontSize:10, fontFamily:T.mono,
                    }}>
                      {sortKey === c.key ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
                    </span>
                  )}
                </span>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {sorted.map((o, ri) => {
              const v = R.vendor(o.vendor);
              const overdue = R.isOverdue(o);
              const next = R.nextAction(o);
              const accent = o.status === 'settled' ? T.success : overdue ? T.danger : o.status === 'completed' ? T.warn : T.primary;
              const cell = {padding:'9px 12px', borderBottom:`1px solid ${T.hairline}`, verticalAlign:'middle'};
              return (
                <tr key={o.id} style={{background: ri % 2 ? T.bg : '#fff'}}>
                  <td style={cell}>
                    <div style={{fontFamily:T.mono, fontSize:11, fontWeight:700, color:T.primary}}>{o.id}</div>
                    <div style={{fontSize:10.5, color:T.subtle, marginTop:1}}>{fmtDate(o.requestedAt)}</div>
                  </td>
                  <td style={cell}>
                    <span style={{
                      padding:'2px 8px', borderRadius:5, background: overdue ? T.dangerSoft : T.primarySoft,
                      color: overdue ? T.danger : T.primary,
                      fontSize:10.5, fontWeight:700, letterSpacing:0.3, textTransform:'uppercase',
                    }}>
                      {overdue ? `Overdue ${R.overdueDays(o)}d` : R_STAGE_LABELS[R.stage(o)]}
                    </span>
                  </td>
                  <td style={cell}>
                    <div style={{fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:190}}>{v.name}</div>
                    <div style={{fontSize:10.5, color:T.subtle}}>{v.kind}</div>
                  </td>
                  <td style={cell}>
                    <div style={{fontSize:11.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:210}}>
                      {o.items.map(ln => `${ln.qty} ${R.item(ln.item).name}${ln.variant ? ' '+R.variantLabel(ln.item, ln.variant) : ''}`).join(' · ')}
                    </div>
                  </td>
                  <td style={cell}>
                    <span style={{fontSize:11, color: overdue ? T.danger : T.muted, fontWeight: overdue ? 700 : 500}}>
                      {o.expectedEnd ? fmtDate(o.expectedEnd) : '—'}
                    </span>
                  </td>
                  <td style={{...cell, textAlign:'right', fontFamily:T.mono, fontWeight:700}}>
                    {o.actualStart ? inr(R.accruedCost(o)) : <span style={{color:T.subtle, fontFamily:T.font, fontSize:11, fontStyle:'italic', fontWeight:500}}>—</span>}
                  </td>
                  <td style={{...cell, textAlign:'right', fontFamily:T.mono, fontWeight:700}}>
                    {o.status === 'settled' ? <span style={{color:T.success, fontSize:11}}>Cleared</span> : inr(R.balanceDue(o))}
                  </td>
                  <td style={cell}>
                    {next ? (
                      <NextActionBtnRental next={next} order={o} dispatch={dispatch} accent={accent}/>
                    ) : <Icon name="check" size={13} color={T.success}/>}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={cols.length} style={{padding:'30px', textAlign:'center', color:T.muted, fontSize:12.5}}>No orders.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { RentalHub });
