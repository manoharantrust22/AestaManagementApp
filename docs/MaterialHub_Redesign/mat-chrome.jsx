// Materials redesign chrome — sidebar matches the production screenshots:
// Site/Company switcher up top, Materials section expanded with sub-items
// for the redesigned IA, plus the project context strip (site + phase + date).
// Uses the shared T tokens from utils.jsx.

function MatSidebar({ activeKey = 'hub' }) {
  return (
    <aside style={{
      width: 232, flex:'0 0 232px', borderRight:`1px solid ${T.border}`,
      background: T.card, display:'flex', flexDirection:'column',
    }}>
      <div style={{padding:'18px 18px 14px', display:'flex', alignItems:'center', gap:8}}>
        <div style={{
          width:28, height:28, borderRadius:7, background:T.primary, color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, letterSpacing:0.5,
        }}>A</div>
        <div style={{fontSize:15, fontWeight:700, letterSpacing:-0.2}}>Aesta</div>
      </div>

      <div style={{padding:'0 12px 10px'}}>
        <div style={{display:'flex', background:T.bg, padding:3, borderRadius:9, border:`1px solid ${T.hairline}`}}>
          <button style={{
            flex:1, padding:'6px 8px', borderRadius:6, border:'none',
            background:T.primary, color:'#fff', fontSize:12.5, fontWeight:700, fontFamily:T.font, cursor:'pointer',
          }}>Site</button>
          <button style={{
            flex:1, padding:'6px 8px', borderRadius:6, border:'none',
            background:'transparent', color:T.muted, fontSize:12.5, fontWeight:600, fontFamily:T.font, cursor:'pointer',
          }}>Company</button>
        </div>
      </div>

      <MatNavItem icon="home"     label="Dashboard"/>
      <MatNavItem icon="sparkle"  label="AI Assistant"/>
      <MatNavGroup icon="user"    label="Workforce"/>
      <MatNavGroup icon="receipt" label="Expenses"/>
      <MatNavGroup icon="grid"    label="Site Operations"/>

      {/* Materials — expanded, with redesigned IA */}
      <MatNavGroup icon="list"    label="Materials" open>
        <MatNavChild label="Hub"            icon="trend"    active={activeKey === 'hub'}/>
        <MatNavChild label="Inter-site"     icon="link"     active={activeKey === 'inter'}/>
        <MatNavChild label="Inventory"      icon="grid"     active={activeKey === 'inv'}/>
      </MatNavGroup>

      <MatNavGroup icon="flag"    label="Contracts"/>
      <MatNavGroup icon="filter"  label="Settings"/>

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

function MatNavItem({ icon, label, active }) {
  return (
    <div style={{padding:'2px 12px'}}>
      <button style={{
        display:'flex', alignItems:'center', gap:10, padding:'8px 10px', width:'100%',
        background: active ? T.primarySoft : 'transparent',
        border:'none', borderRadius:7, cursor:'pointer',
        color: active ? T.primary : T.text,
        fontSize:13, fontWeight: active ? 700 : 600, fontFamily:T.font,
        textAlign:'left',
      }}>
        <Icon name={icon} size={15} color={active ? T.primary : T.muted}/> {label}
      </button>
    </div>
  );
}

function MatNavGroup({ icon, label, open, children }) {
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

function MatNavChild({ label, icon, active }) {
  return (
    <button style={{
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

// Project context strip — site + phase + date controls. Lives just below the
// nav bar (the production app duplicates this across every page, we keep
// the same anchor so users don't get lost).
function MatTopBar({ site = 'srinivasan', phase = 'Footing · Foundation', breadcrumb }) {
  const s = M.site(site);
  return (
    <div style={{
      borderBottom:`1px solid ${T.border}`, background: T.card,
      display:'flex', alignItems:'center', padding:'10px 22px', gap:10,
    }}>
      {/* Site pill */}
      <div style={{
        display:'flex', alignItems:'center', gap:10, padding:'7px 12px',
        background:T.bg, borderRadius:10, border:`1px solid ${T.hairline}`,
        minWidth: 240,
      }}>
        <Icon name="home" size={14} color={s.accent}/>
        <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
          <div style={{fontSize:12.5, fontWeight:700}}>{s.name}</div>
          <div style={{fontSize:10.5, color:T.subtle, fontWeight:500}}>{s.city}</div>
        </div>
        <span style={{
          marginLeft:'auto', padding:'2px 6px', borderRadius:4, background:T.successSoft,
          color:T.success, fontSize:9.5, fontWeight:800, letterSpacing:0.3,
        }}>ACTIVE</span>
        <Icon name="chevDn" size={11} color={T.subtle}/>
      </div>

      {/* Phase pill */}
      <div style={{
        display:'flex', alignItems:'center', gap:8, padding:'7px 12px',
        background:'#fff', borderRadius:10, border:`1px solid ${T.border}`,
      }}>
        <span style={{
          width:18, height:18, borderRadius:5, background:T.primary, color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:10,
        }}>★</span>
        <div style={{display:'flex', flexDirection:'column'}}>
          <div style={{fontSize:12, fontWeight:700}}>{phase.split(' · ')[0]}</div>
          <div style={{fontSize:10, color:T.subtle, fontWeight:500}}>{phase.split(' · ')[1] || ''}</div>
        </div>
        <Icon name="chevDn" size={11} color={T.subtle}/>
      </div>

      {/* Breadcrumb */}
      {breadcrumb && (
        <div style={{display:'flex', alignItems:'center', gap:6, marginLeft:14}}>
          {breadcrumb.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{color:T.subtle, fontSize:12}}>/</span>}
              <span style={{fontSize:12.5, fontWeight: i === breadcrumb.length-1 ? 700 : 500, color: i === breadcrumb.length-1 ? T.text : T.muted}}>{b}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={{flex:1}}/>

      <div style={{display:'flex', alignItems:'center', gap:6, padding:'5px 10px', background:T.card, borderRadius:8, border:`1px solid ${T.border}`}}>
        <Icon name="chevLt" size={11} color={T.muted}/>
        <Icon name="calendar" size={13} color={T.muted}/>
        <span style={{fontSize:12, fontWeight:600, color:T.text}}>All time</span>
        <Icon name="chevDn" size={11} color={T.subtle}/>
        <Icon name="chevRt" size={11} color={T.muted}/>
      </div>
      <div style={{display:'flex', gap:4}}>
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

Object.assign(window, { MatSidebar, MatTopBar });
