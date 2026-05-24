// Thread pipeline + expanded view.
// The pipeline visual replaces the production app's 5-step stage stripe at
// the top of every page. Instead, every thread shows its own pipeline inline
// so users see, per material, exactly where it is — no separate pages to
// click through.
//
// Stages: requested · approved · ordered · delivered · settled · in-use
// (we collapse 'in-transit' and 'exhausted' for the row view — they're
// edge states that show in expanded view only.)

const VISIBLE_STAGES = [
  { key:'requested', label:'Req',     icon:'plus'     },
  { key:'approved',  label:'Approve', icon:'check'    },
  { key:'ordered',   label:'PO',      icon:'receipt'  },
  { key:'delivered', label:'Deliver', icon:'download' },
  { key:'settled',   label:'Settle',  icon:'receipt'  },
  { key:'in-use',    label:'In use',  icon:'trend'    },
];

function ThreadPipeline({ t, big }) {
  const stageIdx = M_STAGES.indexOf(t.stage);
  const reached = (key) => M_STAGES.indexOf(key) <= stageIdx;
  const isCurrent = (key) => {
    // a stage is "current" if it's the one matching t.stage AND there's still work
    if (key !== t.stage) return false;
    if (key === 'delivered' && t.settlement?.status === 'pending') return true;
    if (key === 'in-use') return true;
    return false;
  };

  const dotSize = big ? 22 : 14;
  const lineH = 2;

  return (
    <div style={{display:'flex', alignItems:'center', position:'relative', height: big ? 56 : 30}}>
      {VISIBLE_STAGES.map((s, i) => {
        const done = reached(s.key);
        const current = isCurrent(s.key);
        const isLast = i === VISIBLE_STAGES.length - 1;
        return (
          <React.Fragment key={s.key}>
            <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap: big ? 6 : 3, flexShrink:0}}>
              <div style={{
                width:dotSize, height:dotSize, borderRadius:'50%',
                background: done ? (current ? T.primary : T.text) : '#fff',
                border: done ? 'none' : `2px solid ${T.border}`,
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow: current ? `0 0 0 4px ${T.primarySoft}` : 'none',
                color:'#fff', position:'relative',
                transition:'all .15s',
              }}>
                {done && (current
                  ? <span style={{
                      width: big ? 8 : 5, height: big ? 8 : 5, borderRadius:'50%', background:'#fff',
                      animation: 'matPulse 1.6s ease-in-out infinite',
                    }}/>
                  : <Icon name="check" size={big ? 12 : 8} color="#fff" stroke={3}/>
                )}
              </div>
              <span style={{
                fontSize: big ? 10.5 : 9,
                fontWeight: current ? 700 : 600,
                color: done ? (current ? T.primary : T.muted) : T.subtle,
                letterSpacing:0.2, textTransform:'uppercase', whiteSpace:'nowrap',
              }}>{s.label}</span>
            </div>
            {!isLast && (
              <div style={{
                flex:1, height:lineH,
                background: reached(VISIBLE_STAGES[i+1].key) ? T.text : T.hairline,
                marginBottom: big ? 26 : 14,
                minWidth: big ? 24 : 14,
              }}/>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Expanded thread (inline below row) ───────────────────────────────
function ThreadExpanded({ t }) {
  const mat = M.material(t.material);
  const vendor = t.po && M.vendor(t.po.vendor);
  const eng = M.engineer(t.requestedBy);

  return (
    <div style={{
      background: '#fafbfc', borderTop: `1px solid ${T.border}`,
      padding:'18px 22px 22px',
    }}>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16}}>
        <DetailBlock title="Request" complete>
          <DetailRow k="Material"  v={`${mat.name} · ${mat.spec}`}/>
          <DetailRow k="Quantity"  v={<span style={{fontFamily:T.mono}}>{t.qty} {t.unit}</span>}/>
          <DetailRow k="Section"   v={`${t.section}${t.floor && t.floor !== '—' ? ' · ' + t.floor : ''}`}/>
          <DetailRow k="Requested" v={`${fmtDateLong(t.requestedAt)} by ${eng ? eng.name : '—'}`}/>
          <DetailRow k="Need by"   v={fmtDateLong(t.needBy)} highlight={t.priority === 'high'}/>
          {t.note && <DetailRow k="Note" v={<span style={{color:T.text, fontStyle:'italic'}}>"{t.note}"</span>}/>}
        </DetailBlock>

        <DetailBlock title="Purchase order" complete={!!t.po} cta={!t.po && (t.stage === 'approved' ? 'Create PO' : null)}>
          {t.po ? (
            <>
              <DetailRow k="PO #"    v={<span style={{fontFamily:T.mono, color:T.primary, fontWeight:600}}>{t.po.id}</span>}/>
              <DetailRow k="Vendor"  v={vendor.name}/>
              <DetailRow k="Type"    v={
                <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
                  {t.kind === 'group' ? <Badge tone="pink" dot>Group · 2 sites</Badge> : <Badge tone="primary" dot>Own site</Badge>}
                  {t.advance && <Badge tone="warn" dot>Advance</Badge>}
                </span>
              }/>
              <DetailRow k="Amount"  v={<span style={{fontFamily:T.mono, fontWeight:700}}>{inr(t.po.amount)}</span>}/>
              <DetailRow k="Paid by" v={t.po.payer === 'srinivasan' ? 'Srinivasan House' : 'Padmavathy Apartments'}/>
              {t.advance && t.po.advance && (
                <div style={{marginTop:10, padding:'10px 12px', background:T.warnSoft, borderRadius:8, border:`1px solid ${T.warn}33`}}>
                  <div style={{fontSize:10.5, fontWeight:700, color:T.warn, letterSpacing:0.4, textTransform:'uppercase', marginBottom:6}}>
                    Advance · paid upfront, delivered in batches
                  </div>
                  <div style={{display:'flex', gap:6, alignItems:'center', flexWrap:'wrap'}}>
                    {t.po.advance.batches.map((b, i) => (
                      <div key={i} style={{
                        padding:'3px 8px', background:'#fff', borderRadius:6, border:`1px solid ${T.warn}44`,
                        fontSize:10.5, color:T.text, fontWeight:600,
                      }}>
                        <span style={{fontFamily:T.mono}}>{b.qty}</span> {t.unit} · {fmtDate(b.date)}
                      </div>
                    ))}
                    <span style={{fontSize:10.5, color:T.warn, fontWeight:700}}>
                      Next: {fmtDate(t.po.advance.nextBatch)}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{fontSize:12.5, color:T.muted}}>
              Awaiting {t.stage === 'requested' ? 'approval' : 'PO creation'}.
              {t.stage === 'approved' && ' Compare vendors and place an order.'}
            </div>
          )}
        </DetailBlock>

        <DetailBlock title="Delivery & quality" complete={!!t.delivery}>
          {t.delivery ? (
            <>
              <DetailRow k="Received" v={fmtDateLong(t.delivery.date)}/>
              <DetailRow k="By"       v={M.engineer(t.delivery.recordedBy)?.name || '—'}/>
              <DetailRow k="Quality"  v={
                <Badge tone={t.delivery.quality === 'good' ? 'success' : t.delivery.quality === 'fair' ? 'warn' : 'danger'} dot>
                  {t.delivery.quality}
                </Badge>
              }/>
              {t.delivery.notes && <DetailRow k="Notes" v={<span style={{fontStyle:'italic', color:T.muted}}>"{t.delivery.notes}"</span>}/>}
            </>
          ) : (
            <div style={{fontSize:12.5, color:T.muted}}>Not delivered yet. Site engineer will record on arrival.</div>
          )}
        </DetailBlock>

        <DetailBlock title="Settlement"
          complete={t.settlement && t.settlement.status === 'settled'}
          cta={t.settlement && t.settlement.status === 'pending' ? 'Settle vendor' : null}>
          {t.settlement ? (
            <>
              <DetailRow k="Amount"  v={<span style={{fontFamily:T.mono, fontWeight:700}}>{inr(t.settlement.amount)}</span>}/>
              <DetailRow k="Status"  v={
                <Badge tone={t.settlement.status === 'settled' ? 'success' : 'warn'} dot>
                  {t.settlement.status}
                </Badge>
              }/>
              {t.settlement.paidBy && <DetailRow k="Paid by" v={t.settlement.paidBy === 'office' ? 'Office (bank transfer)' : (t.settlement.paidBy === 'srinivasan' ? 'Srinivasan House' : 'Padmavathy Apartments')}/>}
              {t.settlement.settledAt && <DetailRow k="On" v={fmtDateLong(t.settlement.settledAt)}/>}
              {t.settlement.status === 'pending' && (
                <div style={{marginTop:10, padding:'8px 10px', background:T.warnSoft, borderRadius:6, fontSize:11.5, color:T.warn, fontWeight:600, display:'flex', alignItems:'center', gap:6}}>
                  <Icon name="info" size={12} color={T.warn}/>
                  Site engineer can settle from wallet, or office can pay.
                </div>
              )}
            </>
          ) : (
            <div style={{fontSize:12.5, color:T.muted}}>Settles after delivery is recorded.</div>
          )}
        </DetailBlock>

        <DetailBlock title="Inventory · stock" complete={!!t.inventory}>
          {t.inventory ? (
            <>
              <DetailRow k="Batch"     v={<span style={{fontFamily:T.mono, color:T.text}}>{t.inventory.batch}</span>}/>
              <DetailRow k="Received"  v={<span style={{fontFamily:T.mono}}>{t.inventory.received} {t.unit}</span>}/>
              <DetailRow k="Used"      v={<span style={{fontFamily:T.mono}}>{t.inventory.used} {t.unit}</span>}/>
              <DetailRow k="Remaining" v={<span style={{fontFamily:T.mono, color:T.success, fontWeight:700}}>{t.inventory.remaining} {t.unit}</span>}/>
              <div style={{marginTop:8}}>
                <div style={{height:6, borderRadius:3, background:T.bg, overflow:'hidden'}}>
                  <div style={{
                    width: `${(t.inventory.used / t.inventory.received) * 100}%`,
                    height:'100%', background:T.primary,
                  }}/>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', marginTop:4, fontSize:10, color:T.subtle, fontFamily:T.mono}}>
                  <span>{Math.round((t.inventory.used / t.inventory.received) * 100)}% used</span>
                  <span>{Math.round((t.inventory.remaining / t.inventory.received) * 100)}% left</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{fontSize:12.5, color:T.muted}}>Adds to inventory after delivery is verified.</div>
          )}
        </DetailBlock>

        <DetailBlock title={t.kind === 'group' ? 'Inter-site usage' : 'Expenses'} complete={!!t.interSiteUsage || (!!t.inventory && t.kind === 'own')}>
          {t.kind === 'group' && t.interSiteUsage ? (
            <>
              <div style={{fontSize:11, color:T.subtle, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', marginBottom:8}}>
                Usage by site
              </div>
              {t.interSiteUsage.map((u, i) => {
                const site = M.site(u.site);
                const isPayer = u.site === t.po.payer;
                return (
                  <div key={i} style={{
                    display:'flex', alignItems:'center', gap:8, padding:'6px 0',
                    borderBottom: i < t.interSiteUsage.length-1 ? `1px solid ${T.hairline}` : 'none',
                  }}>
                    <span style={{
                      width:8, height:8, borderRadius:2, background:site.accent,
                    }}/>
                    <span style={{fontSize:12, fontWeight:600, color:T.text, flex:1}}>{site.name}</span>
                    {isPayer && <span style={{fontSize:9.5, fontWeight:800, color:T.muted, letterSpacing:0.4}}>PAYER</span>}
                    <span style={{fontSize:11.5, fontFamily:T.mono, color:T.muted}}>{u.used} {t.unit}</span>
                    <span style={{fontSize:12, fontFamily:T.mono, fontWeight:700, color: isPayer ? T.text : T.pink, minWidth:60, textAlign:'right'}}>
                      {isPayer ? inr(u.value) : '−' + inr(u.value)}
                    </span>
                  </div>
                );
              })}
              <div style={{marginTop:8, padding:'6px 10px', background:T.pinkSoft, borderRadius:6, fontSize:11.5, color:T.pink, fontWeight:600}}>
                Non-payer's portion settles into inter-site reconciliation.
              </div>
            </>
          ) : t.kind === 'own' && (t.stage === 'in-use' || t.stage === 'exhausted') ? (
            <>
              <DetailRow k="Expense" v={<span style={{fontFamily:T.mono, fontWeight:700}}>{inr(t.po.amount)}</span>}/>
              <DetailRow k="Account" v="Material Expenses · Srinivasan"/>
              <div style={{marginTop:8, padding:'6px 10px', background:T.successSoft, borderRadius:6, fontSize:11.5, color:T.success, fontWeight:600}}>
                Posted to expenses on settlement.
              </div>
            </>
          ) : (
            <div style={{fontSize:12.5, color:T.muted}}>
              {t.kind === 'group'
                ? 'Reconciles as the batch is used by each site.'
                : 'Posts to expenses once delivered & settled.'}
            </div>
          )}
        </DetailBlock>
      </div>
    </div>
  );
}

function DetailBlock({ title, children, complete, cta }) {
  return (
    <div style={{
      background:'#fff', border:`1px solid ${T.border}`, borderRadius:10, padding:14,
      display:'flex', flexDirection:'column', gap:6,
    }}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4}}>
        <div style={{display:'flex', alignItems:'center', gap:7}}>
          <span style={{
            width:14, height:14, borderRadius:'50%',
            background: complete ? T.success : T.bg,
            border: complete ? 'none' : `1.5px solid ${T.border}`,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            {complete && <Icon name="check" size={9} color="#fff" stroke={3}/>}
          </span>
          <h4 style={{margin:0, fontSize:12, fontWeight:700, color:T.text, letterSpacing:0.1, textTransform:'uppercase'}}>{title}</h4>
        </div>
        {cta && (
          <button style={{
            padding:'4px 9px', borderRadius:6, border:'none', cursor:'pointer',
            background:T.primary, color:'#fff', fontSize:11, fontWeight:700, fontFamily:T.font,
          }}>{cta}</button>
        )}
      </div>
      {children}
    </div>
  );
}

function DetailRow({ k, v, highlight }) {
  return (
    <div style={{display:'flex', alignItems:'baseline', gap:8, padding:'3px 0'}}>
      <div style={{fontSize:11, color:T.subtle, fontWeight:500, minWidth:78}}>{k}</div>
      <div style={{
        fontSize:12, color: highlight ? T.danger : T.text, fontWeight: highlight ? 700 : 500,
        flex:1, minWidth:0,
      }}>{v}</div>
    </div>
  );
}

Object.assign(window, { ThreadPipeline, ThreadExpanded, DetailBlock, DetailRow });
