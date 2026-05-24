// Mobile · Site Engineer surface — what the engineer sees on-site, daily.
// Reframes "Materials" as actions, not pages: Today's tasks, Record delivery,
// Log usage, Approve, Wallet. Long lists & filters live on desktop; mobile is
// for fast, photo-friendly micro-tasks.

function MatMobile({ tab = 'today' }) {
  const [active, setActive] = React.useState(tab);
  return (
    <div style={{
      height:'100%', background: T.bg, display:'flex', flexDirection:'column',
      fontFamily: T.font,
    }}>
      <MatMobileStatus/>
      <MatMobileHeader/>
      <div style={{flex:1, overflow:'auto', WebkitOverflowScrolling:'touch'}}>
        {active === 'today'    && <MatMobileToday/>}
        {active === 'deliver'  && <MatMobileDeliver/>}
        {active === 'usage'    && <MatMobileUsage/>}
        {active === 'wallet'   && <MatMobileWallet/>}
      </div>
      <MatMobileTabs active={active} onChange={setActive}/>
    </div>
  );
}

// ─── iOS-ish status bar (purely cosmetic for the frame) ───────────────
function MatMobileStatus() {
  return (
    <div style={{
      height:38, display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 18px', background:'#fff', fontFamily:T.font, fontSize:13, fontWeight:600,
    }}>
      <span style={{fontFamily:T.mono}}>9:41</span>
      <span style={{display:'flex', alignItems:'center', gap:6, color:T.text}}>
        <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor"><rect x="0" y="6" width="3" height="4" rx="0.5"/><rect x="4.5" y="4" width="3" height="6" rx="0.5"/><rect x="9" y="2" width="3" height="8" rx="0.5"/><rect x="13.5" y="0" width="3" height="10" rx="0.5"/></svg>
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="0" y="2" width="13" height="7" rx="1.5"/><rect x="14" y="4" width="1.4" height="3" rx="0.4" fill="currentColor"/><rect x="1.4" y="3.4" width="10.2" height="4.2" rx="1" fill="currentColor"/></svg>
      </span>
    </div>
  );
}

// ─── Header: project context ─────────────────────────────────────────
function MatMobileHeader() {
  const site = M.site('srinivasan');
  return (
    <div style={{
      padding:'10px 16px 14px', background:'#fff', borderBottom:`1px solid ${T.border}`,
      display:'flex', alignItems:'center', gap:10,
    }}>
      <div style={{
        width:36, height:36, borderRadius:9, background:site.accent, color:'#fff',
        display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, letterSpacing:0.3,
      }}>{site.short}</div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:700, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{site.name}</div>
        <div style={{fontSize:10.5, color:T.subtle, fontWeight:500}}>Footing · Foundation · {site.city}</div>
      </div>
      <button style={{
        width:36, height:36, borderRadius:10, border:`1px solid ${T.border}`, background:'#fff',
        display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative',
      }}>
        <Icon name="bell" size={15} color={T.muted}/>
        <span style={{position:'absolute', top:6, right:6, width:8, height:8, borderRadius:'50%', background:T.danger, border:'2px solid #fff'}}/>
      </button>
    </div>
  );
}

// ─── Today tab ────────────────────────────────────────────────────────
function MatMobileToday() {
  return (
    <div style={{padding:'16px 14px 20px', display:'flex', flexDirection:'column', gap:16}}>
      {/* Greeting */}
      <div>
        <div style={{fontSize:11, color:T.subtle, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', marginBottom:3}}>Tuesday · 23 May</div>
        <h1 style={{margin:0, fontSize:22, fontWeight:700, letterSpacing:-0.4}}>Good morning, Ajith</h1>
        <p style={{margin:'4px 0 0', fontSize:13, color:T.muted}}>You have <b style={{color:T.text}}>3 things to do</b> today.</p>
      </div>

      {/* Quick action grid */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
        <QuickTile color={T.primary} bg={T.primarySoft} icon="plus" label="New request" sub="Out of cement?"/>
        <QuickTile color={T.warn}    bg={T.warnSoft}    icon="download" label="Record delivery" sub="1 PO en route"/>
        <QuickTile color={T.success} bg={T.successSoft} icon="receipt" label="Log usage" sub="5 batches active"/>
        <QuickTile color={T.pink}    bg={T.pinkSoft}    icon="link" label="Wallet" sub="₹4,820 left"/>
      </div>

      {/* Inbox: things needing the engineer */}
      <SectionMobile title="Today's tasks" sub="3 pending">
        <TaskCard
          accent={T.warn}
          icon="download"
          title="Cement arriving today"
          sub="PO-MP7YYJGX · 50 bags · Father & Mother Building Materials"
          cta="Record delivery"
        />
        <TaskCard
          accent={T.success}
          icon="receipt"
          title="Log yesterday's slab work"
          sub="Estimated 8 bag cement · 240 kg TMT 12mm"
          cta="Log usage"
        />
        <TaskCard
          accent={T.danger}
          icon="bell"
          title="Vendor wants payment"
          sub="Rahman Timbers · ₹25,375 · 11 days overdue"
          cta="Settle from wallet"
        />
      </SectionMobile>

      {/* My open threads */}
      <SectionMobile title="My active materials" sub="6 in flight">
        {M_THREADS.filter(t => t.site === 'srinivasan' && (t.stage === 'ordered' || t.stage === 'in-use')).slice(0,3).map(t => (
          <MobileThreadCard t={t} key={t.id}/>
        ))}
      </SectionMobile>
    </div>
  );
}

function QuickTile({ color, bg, icon, label, sub }) {
  return (
    <button style={{
      background:'#fff', border:`1px solid ${T.border}`, borderRadius:14, padding:'14px 14px 16px',
      textAlign:'left', cursor:'pointer', display:'flex', flexDirection:'column', gap:10,
      fontFamily:T.font,
    }}>
      <span style={{
        width:34, height:34, borderRadius:10, background:bg, color,
        display:'inline-flex', alignItems:'center', justifyContent:'center',
      }}>
        <Icon name={icon} size={16}/>
      </span>
      <div>
        <div style={{fontSize:14, fontWeight:700, color:T.text, marginBottom:2}}>{label}</div>
        <div style={{fontSize:11, color:T.muted}}>{sub}</div>
      </div>
    </button>
  );
}

function SectionMobile({ title, sub, children }) {
  return (
    <div>
      <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:10, padding:'0 2px'}}>
        <h3 style={{margin:0, fontSize:13, fontWeight:700, letterSpacing:-0.1}}>{title}</h3>
        <span style={{fontSize:11.5, color:T.subtle, fontWeight:600}}>{sub}</span>
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:8}}>{children}</div>
    </div>
  );
}

function TaskCard({ accent, icon, title, sub, cta }) {
  return (
    <div style={{
      background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 14px',
      display:'flex', alignItems:'center', gap:12,
    }}>
      <span style={{
        width:32, height:32, borderRadius:9, background:`${accent}1a`, color:accent, flex:'0 0 auto',
        display:'inline-flex', alignItems:'center', justifyContent:'center',
      }}>
        <Icon name={icon} size={15}/>
      </span>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:700, color:T.text, marginBottom:2}}>{title}</div>
        <div style={{fontSize:11, color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{sub}</div>
      </div>
      <button style={{
        padding:'7px 11px', borderRadius:8, border:'none', background:accent, color:'#fff',
        fontSize:11.5, fontWeight:700, fontFamily:T.font, cursor:'pointer', whiteSpace:'nowrap', flex:'0 0 auto',
      }}>{cta}</button>
    </div>
  );
}

function MobileThreadCard({ t }) {
  const mat = M.material(t.material);
  const vendor = t.po && M.vendor(t.po.vendor);
  const next = M.nextAction(t);
  const isGroup = t.kind === 'group';
  return (
    <div style={{
      background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 14px',
      display:'flex', flexDirection:'column', gap:8,
      borderLeft:`3px solid ${isGroup ? T.pink : T.primary}`,
    }}>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10}}>
        <div style={{minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
            <span style={{fontSize:10, fontFamily:T.mono, color:T.subtle, fontWeight:600}}>{t.id}</span>
            {isGroup && <Badge tone="pink" dot>Group</Badge>}
            {t.advance && <Badge tone="warn" dot>Advance</Badge>}
          </div>
          <div style={{fontSize:13.5, fontWeight:700, color:T.text}}>
            <span style={{fontFamily:T.mono}}>{t.qty}</span> {t.unit} · {mat.name}
          </div>
          {vendor && <div style={{fontSize:11, color:T.muted, marginTop:2}}>{vendor.name}</div>}
        </div>
        <div style={{
          padding:'2px 7px', borderRadius:5, background: t.stage === 'in-use' ? T.primarySoft : T.warnSoft,
          color: t.stage === 'in-use' ? T.primary : T.warn, fontSize:10, fontWeight:800, letterSpacing:0.4, textTransform:'uppercase',
          flex:'0 0 auto',
        }}>{M.stageLabel(t.stage)}</div>
      </div>
      {/* Compact pipeline */}
      <div style={{display:'flex', gap:3}}>
        {VISIBLE_STAGES.map(s => {
          const done = M_STAGES.indexOf(s.key) <= M_STAGES.indexOf(t.stage);
          return (
            <div key={s.key} style={{
              flex:1, height:4, borderRadius:2,
              background: done ? (isGroup ? T.pink : T.primary) : T.hairline,
            }}/>
          );
        })}
      </div>
      {next && (
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:2}}>
          <span style={{fontSize:11, color:T.muted}}>Next: <b style={{color:T.text}}>{next.label}</b></span>
          {next.who === 'engineer' && (
            <button style={{
              padding:'5px 9px', borderRadius:6, border:`1px solid ${T.border}`, background:'#fff',
              fontSize:11, fontWeight:700, color:T.text, cursor:'pointer', fontFamily:T.font,
            }}>{next.label} →</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Record delivery (focused screen — fast capture flow) ─────────────
function MatMobileDeliver() {
  return (
    <div style={{padding:'16px 14px 20px', display:'flex', flexDirection:'column', gap:14}}>
      <div>
        <div style={{fontSize:11, color:T.subtle, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', marginBottom:3}}>Awaiting · 4 deliveries</div>
        <h1 style={{margin:0, fontSize:22, fontWeight:700, letterSpacing:-0.4}}>Record delivery</h1>
      </div>

      {/* Featured: arriving now */}
      <div style={{
        background:'linear-gradient(135deg, #2563eb, #1e40af)', color:'#fff',
        borderRadius:16, padding:'16px 16px 18px', display:'flex', flexDirection:'column', gap:12,
      }}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{padding:'2px 7px', borderRadius:5, background:'rgba(255,255,255,.18)', fontSize:10, fontWeight:800, letterSpacing:0.4, textTransform:'uppercase'}}>Arriving today</span>
          <span style={{fontSize:11, opacity:0.75, fontFamily:T.mono}}>PO-MP7YYJGX</span>
        </div>
        <div>
          <div style={{fontSize:11, opacity:0.7, marginBottom:2}}>50 bag · PPC Cement (50kg bag)</div>
          <div style={{fontSize:22, fontWeight:800, letterSpacing:-0.4}}>Father & Mother Building Materials</div>
          <div style={{fontSize:11, opacity:0.75, marginTop:4, display:'flex', alignItems:'center', gap:6}}>
            <Icon name="link" size={11} color="#fff"/> Group · Pudukkottai Cluster · advance batch 2/4
          </div>
        </div>
        <div style={{display:'flex', gap:8, marginTop:4}}>
          <button style={{
            flex:1, padding:'12px', borderRadius:10, border:'none', background:'#fff', color:T.primary,
            fontSize:13, fontWeight:700, fontFamily:T.font, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:6,
          }}>
            <Icon name="check" size={14} color={T.primary} stroke={2.4}/> Confirm delivery
          </button>
          <button style={{
            width:48, padding:'12px', borderRadius:10, border:'1px solid rgba(255,255,255,.3)', background:'rgba(255,255,255,.12)',
            color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <Icon name="upload" size={15} color="#fff"/>
          </button>
        </div>
      </div>

      {/* Other awaiting */}
      <SectionMobile title="Other awaiting" sub="3 POs">
        <DeliveryWaitCard po="PO-MND6GAKP" mat="50kg bag · Chettinad PPC" vendor="Sathish · Chettinad Cement" qty="40 bag" amt={11600} when="Tomorrow" group/>
        <DeliveryWaitCard po="PO-MMYRH6CM" mat="230×100×75 · Fly Ash Bricks" vendor="Vairam Fly Ash Brick" qty="2000 nos" amt={13900} when="Fri 26 May"/>
        <DeliveryWaitCard po="PO-MMQEZSEA" mat="500D · TMT Rods 12mm" vendor="Karuppaiah Steel" qty="200 kg" amt={14161} when="Mon 29 May" group/>
      </SectionMobile>

      {/* Quality entry preview */}
      <SectionMobile title="Recent · last 24h" sub="">
        <div style={{background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, padding:'14px', display:'flex', gap:12, alignItems:'center'}}>
          <div style={{width:40, height:40, borderRadius:10, background:T.successSoft, color:T.success, display:'flex', alignItems:'center', justifyContent:'center'}}>
            <Icon name="check" size={18} color={T.success} stroke={2.4}/>
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, fontWeight:700}}>33 piece · Teak wood</div>
            <div style={{fontSize:11, color:T.muted}}>Rahman Timbers · marked <b style={{color:T.success}}>good</b> · 12 May</div>
          </div>
          <Icon name="chevRt" size={12} color={T.subtle}/>
        </div>
      </SectionMobile>
    </div>
  );
}

function DeliveryWaitCard({ po, mat, vendor, qty, amt, when, group }) {
  return (
    <div style={{
      background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 14px',
      borderLeft:`3px solid ${group ? T.pink : T.primary}`,
      display:'flex', alignItems:'center', gap:12,
    }}>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
          <span style={{fontSize:10, fontFamily:T.mono, color:T.subtle, fontWeight:600}}>{po}</span>
          {group && <Badge tone="pink" dot>Group</Badge>}
        </div>
        <div style={{fontSize:13, fontWeight:700, color:T.text}}>{vendor}</div>
        <div style={{fontSize:11, color:T.muted, marginTop:2}}>{qty} · {mat}</div>
      </div>
      <div style={{textAlign:'right'}}>
        <div style={{fontSize:11, color:T.muted}}>Due</div>
        <div style={{fontSize:12, fontWeight:700, color:T.warn}}>{when}</div>
      </div>
    </div>
  );
}

// ─── Usage logging (the daily tap-tap-done) ──────────────────────────
function MatMobileUsage() {
  const cementUsed = 8, cementTotal = 167;
  const tmtUsed = 240, tmtTotal = 480;
  return (
    <div style={{padding:'16px 14px 20px', display:'flex', flexDirection:'column', gap:14}}>
      <div>
        <div style={{fontSize:11, color:T.subtle, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', marginBottom:3}}>Logged today · 0 of 5</div>
        <h1 style={{margin:0, fontSize:22, fontWeight:700, letterSpacing:-0.4}}>Log usage</h1>
        <p style={{margin:'4px 0 0', fontSize:13, color:T.muted}}>Tap quantities for what you used today. Done in 60 seconds.</p>
      </div>

      <SectionMobile title="Open batches · ready to log" sub="">
        <UsageStepper mat="PPC Cement" spec="50kg bag · Chettinad" qty={cementUsed} unit="bag" remaining={cementTotal} group/>
        <UsageStepper mat="TMT Rods 12mm" spec="500D" qty={tmtUsed} unit="kg" remaining={tmtTotal} group/>
        <UsageStepper mat="M Sand" spec="Manufactured" qty={3} unit="cft" remaining={28} group/>
        <UsageStepper mat="Chips Jalli" spec="Thool Jalli" qty={0} unit="tonne" remaining={0.83}/>
      </SectionMobile>

      <button style={{
        padding:'14px', borderRadius:12, border:'none', background:T.primary, color:'#fff',
        fontSize:14, fontWeight:700, fontFamily:T.font, cursor:'pointer', marginTop:6,
        boxShadow:'0 4px 14px rgba(37, 99, 235, 0.25)',
      }}>Save day's log · 4 entries</button>
    </div>
  );
}

function UsageStepper({ mat, spec, qty, unit, remaining, group }) {
  const ratio = Math.min(1, (qty / Math.max(remaining, 0.001)));
  return (
    <div style={{
      background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, padding:'14px',
      borderLeft:`3px solid ${group ? T.pink : T.primary}`,
    }}>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
        <div style={{fontSize:13, fontWeight:700, color:T.text}}>{mat}</div>
        {group && <Badge tone="pink" dot>Group</Badge>}
      </div>
      <div style={{fontSize:11, color:T.muted, marginBottom:10}}>{spec} · <span style={{fontFamily:T.mono}}>{remaining}</span> {unit} left</div>

      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <button style={{
          width:42, height:42, borderRadius:11, border:`1px solid ${T.border}`, background:'#fff',
          fontSize:22, fontWeight:700, color:T.text, cursor:'pointer',
        }}>−</button>
        <div style={{
          flex:1, padding:'10px', background:T.bg, borderRadius:11, textAlign:'center',
        }}>
          <div style={{fontSize:24, fontWeight:800, fontFamily:T.mono, letterSpacing:-0.6, color:T.text, lineHeight:1}}>
            {qty}
          </div>
          <div style={{fontSize:10, color:T.subtle, fontWeight:600, marginTop:3, letterSpacing:0.4, textTransform:'uppercase'}}>{unit}</div>
        </div>
        <button style={{
          width:42, height:42, borderRadius:11, border:'none', background:T.primary, color:'#fff',
          fontSize:22, fontWeight:700, cursor:'pointer',
        }}>+</button>
      </div>

      {ratio > 0 && (
        <div style={{marginTop:10, height:4, borderRadius:2, background:T.hairline, overflow:'hidden'}}>
          <div style={{width:`${ratio*100}%`, height:'100%', background:group ? T.pink : T.primary}}/>
        </div>
      )}
    </div>
  );
}

// ─── Wallet tab (links to Engineer Wallet) ───────────────────────────
function MatMobileWallet() {
  return (
    <div style={{padding:'16px 14px 20px', display:'flex', flexDirection:'column', gap:14}}>
      <div>
        <div style={{fontSize:11, color:T.subtle, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', marginBottom:3}}>Ajith · Site wallet</div>
        <h1 style={{margin:0, fontSize:22, fontWeight:700, letterSpacing:-0.4}}>Wallet</h1>
      </div>

      <div style={{
        background:'#0f172a', color:'#fff', borderRadius:16, padding:'18px 18px 20px',
      }}>
        <div style={{fontSize:11, opacity:0.65, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', marginBottom:6}}>Balance</div>
        <div style={{fontSize:28, fontWeight:800, fontFamily:T.mono, letterSpacing:-0.6}}>₹4,820.50</div>
        <div style={{fontSize:11, opacity:0.7, marginTop:6}}>Top-up ₹15,000 on 18 May · Office</div>

        <button style={{
          marginTop:14, width:'100%', padding:'12px', borderRadius:10, border:'none',
          background:'#fff', color:T.text, fontSize:13, fontWeight:700, fontFamily:T.font, cursor:'pointer',
        }}>Settle a vendor</button>
      </div>

      <SectionMobile title="Recent" sub="last 30 days">
        <WalletRow dir="out" label="Sathish · Chettinad Cement" sub="PO-MND6GAKP · ₹8,700 settled" amt={-8700}/>
        <WalletRow dir="in"  label="Office top-up" sub="By Hari Admin · 18 May" amt={15000}/>
        <WalletRow dir="out" label="Pinveedu Manivel" sub="Aggregates · ₹3,600" amt={-3600}/>
      </SectionMobile>
    </div>
  );
}

function WalletRow({ dir, label, sub, amt }) {
  const isIn = dir === 'in';
  return (
    <div style={{background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
      <span style={{
        width:36, height:36, borderRadius:10,
        background: isIn ? T.successSoft : T.bg, color: isIn ? T.success : T.muted,
        display:'inline-flex', alignItems:'center', justifyContent:'center',
      }}>
        <Icon name={isIn ? 'arrowDn' : 'arrowUp'} size={15}/>
      </span>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:700, color:T.text}}>{label}</div>
        <div style={{fontSize:11, color:T.muted}}>{sub}</div>
      </div>
      <div style={{fontSize:13, fontWeight:800, fontFamily:T.mono, color: isIn ? T.success : T.text}}>
        {isIn ? '+' : ''}{inr(amt)}
      </div>
    </div>
  );
}

// ─── Bottom tabs ─────────────────────────────────────────────────────
function MatMobileTabs({ active, onChange }) {
  const tabs = [
    { id:'today',   icon:'home',     label:'Today' },
    { id:'deliver', icon:'download', label:'Deliver' },
    { id:'usage',   icon:'receipt',  label:'Usage' },
    { id:'wallet',  icon:'link',     label:'Wallet' },
  ];
  return (
    <div style={{
      borderTop:`1px solid ${T.border}`, background:'#fff', padding:'8px 8px 18px',
      display:'flex', justifyContent:'space-around',
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          display:'flex', flexDirection:'column', alignItems:'center', gap:3,
          padding:'6px 10px', border:'none', background:'transparent',
          color: active === t.id ? T.primary : T.muted,
          fontSize:10, fontWeight:700, fontFamily:T.font, cursor:'pointer',
          letterSpacing:0.2,
        }}>
          <Icon name={t.icon} size={20} color={active === t.id ? T.primary : T.muted}/>
          {t.label}
        </button>
      ))}
    </div>
  );
}

Object.assign(window, { MatMobile });
