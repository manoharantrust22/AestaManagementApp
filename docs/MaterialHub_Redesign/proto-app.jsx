// Proto root — state, shell, modal router. Responsive: < 820 = mobile chrome.

function ProtoApp() {
  const [state, dispatch] = React.useReducer(protoReduce, undefined, protoInitialState);
  const [width, setWidth] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1440);

  React.useEffect(() => {
    const r = () => setWidth(window.innerWidth);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  const mobile = width < 820;
  const modal = state.modal;
  const modalThread = modal?.threadId && state.threads.find(t => t.id === modal.threadId);

  return (
    <div style={{
      height:'100vh', display:'flex', flexDirection: mobile ? 'column' : 'row',
      background: T.bg, fontFamily: T.font, position:'relative', overflow:'hidden',
    }}>
      {!mobile && <ProtoSidebar state={state} dispatch={dispatch}/>}

      <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>
        <ProtoHeader state={state} dispatch={dispatch} mobile={mobile}/>

        {state.view === 'hub'      && <ProtoHub state={state} dispatch={dispatch} mobile={mobile}/>}
        {state.view === 'intersite' && <ProtoInterSite state={state} dispatch={dispatch} mobile={mobile}/>}
        {state.view === 'inventory' && <ProtoInventory state={state} dispatch={dispatch} mobile={mobile}/>}
      </div>

      {mobile && <ProtoMobileTabs state={state} dispatch={dispatch}/>}

      {/* Modal router */}
      {modal?.kind === 'new-entry' && (
        <NewEntryMenu onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'spot-purchase' && (
        <SpotPurchaseModal onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'finalize-allocation' && modalThread && (
        <SpotAllocationModal thread={modalThread} onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'create-request' && (
        <CreateRequestModal onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'approve' && modalThread && (
        <ApproveModal thread={modalThread} onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'create-po' && modalThread && (
        <CreatePOModal thread={modalThread} onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'record-delivery' && modalThread && (
        <RecordDeliveryModal thread={modalThread} onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'settle-vendor' && modalThread && (
        <SettleVendorModal thread={modalThread} onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'log-usage' && modalThread && (
        <LogUsageModal thread={modalThread} onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'demo-guide' && (
        <DemoGuideModal onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}

      <ProtoToast toast={state.toast} onClear={() => dispatch({type:'CLEAR_TOAST'})}/>
    </div>
  );
}

// ─── Sidebar (desktop) ──────────────────────────────────────────────
function ProtoSidebar({ state, dispatch }) {
  return (
    <aside style={{
      width: 230, flex:'0 0 230px', borderRight:`1px solid ${T.border}`,
      background: T.card, display:'flex', flexDirection:'column',
    }}>
      <div style={{padding:'18px 18px 14px', display:'flex', alignItems:'center', gap:8}}>
        <div style={{
          width:28, height:28, borderRadius:7, background:T.primary, color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, letterSpacing:0.5,
        }}>A</div>
        <div style={{fontSize:15, fontWeight:700, letterSpacing:-0.2}}>Aesta</div>
        <span style={{marginLeft:'auto', fontSize:9, fontWeight:800, color:T.primary, background:T.primarySoft, padding:'2px 6px', borderRadius:4, letterSpacing:0.4}}>PROTO</span>
      </div>

      <div style={{padding:'0 12px 10px'}}>
        <div style={{display:'flex', background:T.bg, padding:3, borderRadius:9, border:`1px solid ${T.hairline}`}}>
          <button style={{flex:1, padding:'6px 8px', borderRadius:6, border:'none', background:T.primary, color:'#fff', fontSize:12.5, fontWeight:700, fontFamily:T.font, cursor:'pointer'}}>Site</button>
          <button style={{flex:1, padding:'6px 8px', borderRadius:6, border:'none', background:'transparent', color:T.muted, fontSize:12.5, fontWeight:600, fontFamily:T.font, cursor:'pointer'}}>Company</button>
        </div>
      </div>

      <SidebarItem icon="home"     label="Dashboard"/>
      <SidebarItem icon="sparkle"  label="AI Assistant"/>
      <SidebarGroup icon="user"    label="Workforce"/>
      <SidebarGroup icon="receipt" label="Expenses"/>
      <SidebarGroup icon="grid"    label="Site Operations"/>

      <SidebarGroup icon="list"    label="Materials" open>
        <SidebarChild label="Hub"        icon="trend" active={state.view === 'hub'}
          onClick={() => dispatch({type:'SET_VIEW', view:'hub'})}/>
        <SidebarChild label="Inter-site" icon="link"  active={state.view === 'intersite'}
          onClick={() => dispatch({type:'SET_VIEW', view:'intersite'})}/>
        <SidebarChild label="Inventory"  icon="grid"  active={state.view === 'inventory'}
          onClick={() => dispatch({type:'SET_VIEW', view:'inventory'})}/>
      </SidebarGroup>

      <SidebarGroup icon="flag"    label="Contracts"/>
      <SidebarGroup icon="filter"  label="Settings"/>

      <div style={{flex:1}}/>

      {/* Demo helpers */}
      <div style={{padding:'10px 14px', borderTop:`1px solid ${T.hairline}`, display:'flex', flexDirection:'column', gap:6}}>
        <button onClick={() => dispatch({type:'OPEN_MODAL', modal:{kind:'demo-guide'}})}
          style={{
            display:'flex', alignItems:'center', gap:7, padding:'7px 10px', borderRadius:7,
            border:`1px solid ${T.border}`, background:'#fff', color:T.text, fontSize:12, fontWeight:600,
            cursor:'pointer', fontFamily:T.font, textAlign:'left',
          }}>
          <Icon name="sparkle" size={12} color={T.primary}/> Demo guide
        </button>
        <button onClick={() => { if (confirm('Reset to seed data?')) dispatch({type:'RESET'}); }}
          style={{
            display:'flex', alignItems:'center', gap:7, padding:'7px 10px', borderRadius:7,
            border:'none', background:'transparent', color:T.muted, fontSize:11, fontWeight:600,
            cursor:'pointer', fontFamily:T.font, textAlign:'left',
          }}>
          <Icon name="x" size={11} color={T.subtle}/> Reset state
        </button>
      </div>

      <div style={{padding:'12px 14px', borderTop:`1px solid ${T.hairline}`, display:'flex', alignItems:'center', gap:10}}>
        <div style={{
          width:30, height:30, borderRadius:'50%', background:'#0b1220', color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12,
        }}>HA</div>
        <div style={{minWidth:0, flex:1}}>
          <div style={{fontSize:12.5, fontWeight:700}}>Hari Admin</div>
          <div style={{fontSize:10.5, color:T.subtle, fontWeight:500}}>Admin</div>
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({ icon, label, active, onClick }) {
  return (
    <div style={{padding:'2px 12px'}}>
      <button onClick={onClick} style={{
        display:'flex', alignItems:'center', gap:10, padding:'8px 10px', width:'100%',
        background: active ? T.primarySoft : 'transparent',
        border:'none', borderRadius:7, cursor:'pointer',
        color: active ? T.primary : T.text,
        fontSize:13, fontWeight: active ? 700 : 600, fontFamily:T.font, textAlign:'left',
      }}>
        <Icon name={icon} size={15} color={active ? T.primary : T.muted}/> {label}
      </button>
    </div>
  );
}

function SidebarGroup({ icon, label, open, children }) {
  return (
    <div style={{padding:'2px 12px'}}>
      <button style={{
        display:'flex', alignItems:'center', gap:10, padding:'8px 10px', width:'100%',
        background:'transparent', border:'none', borderRadius:7, cursor:'pointer',
        color: T.text, fontSize:13, fontWeight:600, fontFamily:T.font, textAlign:'left',
      }}>
        <Icon name={icon} size={15} color={T.muted}/>
        <span style={{flex:1}}>{label}</span>
        <Icon name={open ? 'chevDn' : 'chevRt'} size={11} color={T.subtle}/>
      </button>
      {open && children && (
        <div style={{paddingLeft:24, marginTop:2, display:'flex', flexDirection:'column', gap:2,
          borderLeft:`1px solid ${T.hairline}`, marginLeft:18}}>
          {children}
        </div>
      )}
    </div>
  );
}

function SidebarChild({ label, icon, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:8, padding:'6px 10px', width:'100%',
      background: active ? T.primarySoft : 'transparent',
      color: active ? T.primary : T.muted,
      border:'none', borderRadius:6, cursor:'pointer',
      fontSize:12.5, fontWeight: active ? 700 : 600, fontFamily:T.font, textAlign:'left',
      marginLeft: 6,
    }}>
      <Icon name={icon || 'chevRt'} size={12} color={active ? T.primary : T.subtle}/> {label}
    </button>
  );
}

// ─── Header (top bar — site + phase + date) ─────────────────────────
function ProtoHeader({ state, dispatch, mobile }) {
  const s = M.site('srinivasan');
  if (mobile) {
    return (
      <div style={{
        padding:'12px 14px', background:'#fff', borderBottom:`1px solid ${T.border}`,
        display:'flex', alignItems:'center', gap:10,
      }}>
        <div style={{
          width:32, height:32, borderRadius:8, background:T.primary, color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, letterSpacing:0.5,
        }}>A</div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:13, fontWeight:700, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.name}</div>
          <div style={{fontSize:10.5, color:T.subtle, fontWeight:500}}>{s.city} · Footing · Foundation</div>
        </div>
        <button onClick={() => dispatch({type:'OPEN_MODAL', modal:{kind:'demo-guide'}})}
          style={{width:34, height:34, borderRadius:9, border:`1px solid ${T.border}`, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer'}}>
          <Icon name="sparkle" size={14} color={T.primary}/>
        </button>
        <button style={{width:34, height:34, borderRadius:9, border:`1px solid ${T.border}`, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative'}}>
          <Icon name="bell" size={14} color={T.muted}/>
          <span style={{position:'absolute', top:6, right:6, width:7, height:7, borderRadius:'50%', background:T.danger, border:'2px solid #fff'}}/>
        </button>
      </div>
    );
  }
  return (
    <div style={{
      borderBottom:`1px solid ${T.border}`, background: T.card,
      display:'flex', alignItems:'center', padding:'10px 22px', gap:10,
    }}>
      <div style={{display:'flex', alignItems:'center', gap:10, padding:'7px 12px', background:T.bg, borderRadius:10, border:`1px solid ${T.hairline}`, minWidth:230}}>
        <Icon name="home" size={14} color={s.accent}/>
        <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
          <div style={{fontSize:12.5, fontWeight:700}}>{s.name}</div>
          <div style={{fontSize:10.5, color:T.subtle, fontWeight:500}}>{s.city}</div>
        </div>
        <span style={{marginLeft:'auto', padding:'2px 6px', borderRadius:4, background:T.successSoft, color:T.success, fontSize:9.5, fontWeight:800, letterSpacing:0.3}}>ACTIVE</span>
        <Icon name="chevDn" size={11} color={T.subtle}/>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:8, padding:'7px 12px', background:'#fff', borderRadius:10, border:`1px solid ${T.border}`}}>
        <span style={{width:18, height:18, borderRadius:5, background:T.primary, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10}}>★</span>
        <div>
          <div style={{fontSize:12, fontWeight:700}}>Footing</div>
          <div style={{fontSize:10, color:T.subtle, fontWeight:500}}>Foundation</div>
        </div>
        <Icon name="chevDn" size={11} color={T.subtle}/>
      </div>

      <div style={{display:'flex', alignItems:'center', gap:6, marginLeft:14}}>
        <span style={{fontSize:12.5, fontWeight:500, color:T.muted}}>Materials</span>
        <span style={{color:T.subtle, fontSize:12}}>/</span>
        <span style={{fontSize:12.5, fontWeight:700, color:T.text}}>{
          state.view === 'hub' ? 'Hub' : state.view === 'inventory' ? 'Inventory' : 'Inter-site'
        }</span>
      </div>

      <div style={{flex:1}}/>

      <div style={{display:'flex', alignItems:'center', gap:6, padding:'5px 10px', background:T.card, borderRadius:8, border:`1px solid ${T.border}`}}>
        <Icon name="calendar" size={13} color={T.muted}/>
        <span style={{fontSize:12, fontWeight:600, color:T.text}}>All time</span>
        <Icon name="chevDn" size={11} color={T.subtle}/>
      </div>
      <button style={{width:32, height:32, borderRadius:8, border:`1px solid ${T.border}`, background:T.card, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', position:'relative'}}>
        <Icon name="bell" size={14} color={T.muted}/>
        <span style={{position:'absolute', top:-3, right:-3, minWidth:16, height:16, padding:'0 4px', borderRadius:99, background:T.danger, color:'#fff', fontSize:9.5, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center'}}>50</span>
      </button>
    </div>
  );
}

// ─── Mobile bottom tabs ─────────────────────────────────────────────
function ProtoMobileTabs({ state, dispatch }) {
  const tabs = [
    { id:'hub',       icon:'home',    label:'Hub' },
    { id:'inventory', icon:'grid',    label:'Inventory' },
    { id:'intersite', icon:'link',    label:'Inter-site' },
  ];
  return (
    <div style={{
      borderTop:`1px solid ${T.border}`, background:'#fff', padding:'8px 8px 16px',
      display:'flex', justifyContent:'space-around', flex:'0 0 auto',
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => dispatch({type:'SET_VIEW', view:t.id})} style={{
          display:'flex', flexDirection:'column', alignItems:'center', gap:3,
          padding:'6px 12px', border:'none', background:'transparent',
          color: state.view === t.id ? T.primary : T.muted,
          fontSize:10, fontWeight:700, fontFamily:T.font, cursor:'pointer',
        }}>
          <Icon name={t.icon} size={20} color={state.view === t.id ? T.primary : T.muted}/>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Demo guide ────────────────────────────────────────────────────
function DemoGuideModal({ onClose, dispatch }) {
  const steps = [
    { kind:'approve',        title:'Approve a request',    sub:'Find MR-260424-CITO (Fly Ash Bricks, "HIGH"). Click "Approve" on the row.', icon:'check' },
    { kind:'create-po',      title:'Create the PO',         sub:'Now click "Create PO" on the same thread (or on MR-260408-IRJ8). Try the group toggle and the advance checkbox.', icon:'receipt' },
    { kind:'record-delivery',title:'Record delivery',       sub:'After ordering, the next action becomes "Record delivery". Capture quantity + quality.', icon:'download' },
    { kind:'settle-vendor',  title:'Settle the vendor',      sub:'MR-260512-DBBO (Teak wood) is awaiting settlement. Try paying from office vs site wallet.', icon:'home' },
    { kind:'log-usage',      title:'Log group usage',       sub:'MR-260514-7TII is an advance, group PPC PO. Log usage from either site and watch inter-site debt update.', icon:'trend' },
    { kind:'inter-site',     title:'Reconcile inter-site',  sub:'Open the Inter-site page and click "Net settle".', icon:'link' },
  ];
  return (
    <ProtoModal title="Demo guide" sub="Walk the full Materials lifecycle in 6 clicks."
      onClose={onClose} width={560}
      primary={{ label:"Got it", onClick: onClose }}>
      <div style={{display:'flex', flexDirection:'column', gap:10}}>
        {steps.map((s, i) => (
          <div key={i} style={{
            display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px',
            background:T.bg, borderRadius:10, border:`1px solid ${T.hairline}`,
          }}>
            <span style={{
              width:28, height:28, borderRadius:8, background:T.primary, color:'#fff', flex:'0 0 auto',
              display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, fontFamily:T.mono,
            }}>{i+1}</span>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:13, fontWeight:700, color:T.text, marginBottom:2}}>{s.title}</div>
              <div style={{fontSize:11.5, color:T.muted, lineHeight:1.4}}>{s.sub}</div>
            </div>
          </div>
        ))}
        <div style={{
          marginTop:6, padding:'10px 12px', background:T.primarySoft, borderRadius:8,
          fontSize:11.5, color:T.primary, fontWeight:600, lineHeight:1.5,
        }}>
          Tip: every state transition shows a toast at the bottom. Hit "Reset state" in the sidebar to start over.
        </div>
      </div>
    </ProtoModal>
  );
}

Object.assign(window, {
  ProtoApp, ProtoSidebar, ProtoHeader, ProtoMobileTabs, DemoGuideModal,
});

const protoRoot = ReactDOM.createRoot(document.getElementById('root'));
protoRoot.render(<ProtoApp/>);
