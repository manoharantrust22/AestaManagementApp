// Rental prototype root — state, shell, modal router. Same pattern as the
// materials prototype: useReducer + responsive sidebar/topbar + modal stack.

function RentalApp() {
  const [state, dispatch] = React.useReducer(rentalsReduce, undefined, rentalsInitialState);
  const [width, setWidth] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1440);

  React.useEffect(() => {
    const r = () => setWidth(window.innerWidth);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  const mobile = width < 820;
  const modal = state.modal;
  const modalOrder = modal?.orderId && state.orders.find(o => o.id === modal.orderId);

  return (
    <div style={{
      height:'100vh', display:'flex', flexDirection: mobile ? 'column' : 'row',
      background: T.bg, fontFamily: T.font, position:'relative', overflow:'hidden',
    }}>
      {!mobile && <RentalSidebar state={state} dispatch={dispatch}/>}

      <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>
        <RentalHeader mobile={mobile}/>
        <RentalHub state={state} dispatch={dispatch} mobile={mobile}/>
      </div>

      {/* Modal router */}
      {modal?.kind === 'create-rental' && (
        <CreateRentalModal onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'approve-rental' && modalOrder && (
        <ApproveRentalModal order={modalOrder} onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'verify-delivery' && modalOrder && (
        <VerifyDeliveryModal order={modalOrder} onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'record-return' && modalOrder && (
        <RecordReturnModal order={modalOrder} onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'add-advance' && modalOrder && (
        <AddAdvanceModal order={modalOrder} onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'settle-rental' && modalOrder && (
        <SettleRentalModal order={modalOrder} onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}
      {modal?.kind === 'extend-date' && modalOrder && (
        <ExtendDateModal order={modalOrder} onClose={() => dispatch({type:'CLOSE_MODAL'})} dispatch={dispatch}/>
      )}

      <ProtoToast toast={state.toast} onClear={() => dispatch({type:'CLEAR_TOAST'})}/>
    </div>
  );
}

function RentalSidebar({ state, dispatch }) {
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

      <SbItem  icon="home"     label="Dashboard"/>
      <SbItem  icon="sparkle"  label="AI Assistant"/>
      <SbGroup icon="user"     label="Workforce"/>
      <SbGroup icon="receipt"  label="Expenses"/>
      <SbGroup icon="grid"     label="Site Operations"/>

      <SbGroup icon="list"     label="Materials" open>
        <SbChild label="Hub"        icon="trend"/>
        <SbChild label="Inter-site" icon="link"/>
        <SbChild label="Inventory"  icon="grid"/>
      </SbGroup>

      <SbGroup icon="receipt"  label="Rentals" open>
        <SbChild label="Hub"        icon="trend" active={state.view === 'hub'}/>
        <SbChild label="On site"    icon="home"/>
        <SbChild label="History"    icon="check"/>
      </SbGroup>

      <SbGroup icon="flag"     label="Contracts"/>
      <SbGroup icon="filter"   label="Settings"/>

      <div style={{flex:1}}/>
      <div style={{padding:'10px 14px', borderTop:`1px solid ${T.hairline}`}}>
        <button onClick={() => { if (confirm('Reset to seed data?')) dispatch({type:'RESET'}); }} style={{
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

function SbItem({ icon, label, active }) {
  return (
    <div style={{padding:'2px 12px'}}>
      <button style={{
        display:'flex', alignItems:'center', gap:10, padding:'8px 10px', width:'100%',
        background: active ? T.primarySoft : 'transparent', border:'none', borderRadius:7, cursor:'pointer',
        color: active ? T.primary : T.text, fontSize:13, fontWeight: active ? 700 : 600, fontFamily:T.font, textAlign:'left',
      }}>
        <Icon name={icon} size={15} color={active ? T.primary : T.muted}/> {label}
      </button>
    </div>
  );
}
function SbGroup({ icon, label, open, children }) {
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
        <div style={{paddingLeft:24, marginTop:2, display:'flex', flexDirection:'column', gap:2, borderLeft:`1px solid ${T.hairline}`, marginLeft:18}}>{children}</div>
      )}
    </div>
  );
}
function SbChild({ label, icon, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:8, padding:'6px 10px', width:'100%',
      background: active ? T.primarySoft : 'transparent',
      color: active ? T.primary : T.muted,
      border:'none', borderRadius:6, cursor:'pointer',
      fontSize:12.5, fontWeight: active ? 700 : 600, fontFamily:T.font, textAlign:'left', marginLeft: 6,
    }}>
      <Icon name={icon || 'chevRt'} size={12} color={active ? T.primary : T.subtle}/> {label}
    </button>
  );
}

function RentalHeader({ mobile }) {
  const s = R.site('srinivasan');
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
          <div style={{fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.name}</div>
          <div style={{fontSize:10.5, color:T.subtle, fontWeight:500}}>{s.city} · Rentals</div>
        </div>
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
      <div style={{display:'flex', alignItems:'center', gap:6, marginLeft:14}}>
        <span style={{fontSize:12.5, fontWeight:500, color:T.muted}}>Rentals</span>
        <span style={{color:T.subtle, fontSize:12}}>/</span>
        <span style={{fontSize:12.5, fontWeight:700, color:T.text}}>Hub</span>
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

Object.assign(window, { RentalApp });

const rentalRoot = ReactDOM.createRoot(document.getElementById('root'));
rentalRoot.render(<RentalApp/>);
