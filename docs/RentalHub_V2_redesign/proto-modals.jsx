// Proto modals — every state transition goes through one of these.
// Modals are responsive: bottom sheet on mobile, centered dialog on desktop.
// They share <ProtoModal> chrome and a tight form pattern.

function ProtoModal({ title, sub, onClose, children, primary, secondary, danger, width = 520 }) {
  // Esc to close
  React.useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position:'absolute', inset:0, background:'rgba(15,23,42,.45)', zIndex:100,
      display:'flex', alignItems:'center', justifyContent:'center', padding:'20px',
      backdropFilter:'blur(2px)',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background:'#fff', borderRadius:14, maxWidth: width, width:'100%',
        maxHeight:'calc(100% - 40px)', overflow:'hidden',
        display:'flex', flexDirection:'column', boxShadow:'0 24px 48px rgba(15,23,42,.25)',
        animation:'protoSheetIn .18s cubic-bezier(.2,.7,.3,1)',
      }}>
        <div style={{padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:14}}>
          <div style={{flex:1, minWidth:0}}>
            <h2 style={{margin:0, fontSize:16, fontWeight:700, color:T.text, letterSpacing:-0.2}}>{title}</h2>
            {sub && <div style={{fontSize:12, color:T.muted, marginTop:3}}>{sub}</div>}
          </div>
          <button onClick={onClose} style={{
            width:30, height:30, borderRadius:8, border:`1px solid ${T.border}`,
            background:T.card, cursor:'pointer', flex:'0 0 auto',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <Icon name="x" size={13} color={T.muted}/>
          </button>
        </div>
        <div style={{flex:1, overflow:'auto', padding:'18px 22px'}}>
          {children}
        </div>
        {(primary || secondary || danger) && (
          <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, background:T.bg, display:'flex', gap:8, justifyContent:'flex-end'}}>
            {danger && (
              <button onClick={danger.onClick} style={{
                padding:'9px 14px', borderRadius:8, border:'none', cursor:'pointer',
                background:T.dangerSoft, color:T.danger, fontSize:12.5, fontWeight:700, fontFamily:T.font,
                marginRight:'auto',
              }}>{danger.label}</button>
            )}
            {secondary && (
              <button onClick={secondary.onClick} style={{
                padding:'9px 14px', borderRadius:8, border:`1px solid ${T.border}`, cursor:'pointer',
                background:'#fff', color:T.text, fontSize:12.5, fontWeight:700, fontFamily:T.font,
              }}>{secondary.label}</button>
            )}
            {primary && (
              <button onClick={primary.onClick} disabled={primary.disabled} style={{
                padding:'9px 16px', borderRadius:8, border:'none', cursor: primary.disabled ? 'not-allowed' : 'pointer',
                background: primary.disabled ? T.subtle : T.primary, color:'#fff',
                fontSize:12.5, fontWeight:700, fontFamily:T.font,
                opacity: primary.disabled ? 0.6 : 1,
              }}>{primary.label}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Form primitives ──────────────────────────────────────────────────
function ProtoField({ label, sub, children, optional, full }) {
  return (
    <div style={{marginBottom:14, gridColumn: full ? '1 / -1' : 'auto'}}>
      <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:6}}>
        <label style={{fontSize:11, fontWeight:700, color:T.text, letterSpacing:0.2, textTransform:'uppercase'}}>
          {label}
        </label>
        {optional && <span style={{fontSize:10.5, color:T.subtle, fontWeight:500}}>Optional</span>}
      </div>
      {children}
      {sub && <div style={{fontSize:11, color:T.muted, marginTop:5}}>{sub}</div>}
    </div>
  );
}
function ProtoInput({ value, onChange, placeholder, type='text', leading, suffix, mono }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:8, padding:'9px 12px',
      background:'#fff', border:`1px solid ${T.border}`, borderRadius:8,
    }}>
      {leading}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type}
        style={{
          border:'none', outline:'none', flex:1, fontSize:13, color:T.text, fontFamily: mono ? T.mono : T.font,
          background:'transparent', minWidth:0,
        }}/>
      {suffix && <span style={{fontSize:11.5, color:T.subtle, fontWeight:600}}>{suffix}</span>}
    </div>
  );
}
function ProtoSelect({ value, onChange, options, placeholder }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} style={{
      width:'100%', padding:'9px 12px', background:'#fff', border:`1px solid ${T.border}`,
      borderRadius:8, fontSize:13, color:T.text, fontFamily:T.font, outline:'none', appearance:'none',
      backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748b' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
      backgroundRepeat:'no-repeat', backgroundPosition:'right 12px center',
    }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function ProtoRadioCards({ value, onChange, options }) {
  return (
    <div style={{display:'grid', gridTemplateColumns:`repeat(${options.length}, 1fr)`, gap:8}}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            padding:'12px', borderRadius:10, cursor:'pointer', fontFamily:T.font, textAlign:'left',
            background: active ? T.primarySoft : '#fff',
            border: `1.5px solid ${active ? T.primary : T.border}`,
            display:'flex', flexDirection:'column', gap:4,
          }}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              {o.icon && (
                <span style={{
                  width:22, height:22, borderRadius:6, background: active ? T.primary : T.bg,
                  color: active ? '#fff' : T.muted,
                  display:'inline-flex', alignItems:'center', justifyContent:'center',
                }}>
                  <Icon name={o.icon} size={12}/>
                </span>
              )}
              <span style={{fontSize:13, fontWeight:700, color: active ? T.primary : T.text}}>{o.label}</span>
            </div>
            {o.sub && <div style={{fontSize:11.5, color:T.muted, lineHeight:1.4}}>{o.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────
function ProtoToast({ toast, onClear }) {
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClear, 2600);
    return () => clearTimeout(t);
  }, [toast, onClear]);
  if (!toast) return null;
  const tones = {
    success: { bg: '#10b981', icon: 'check' },
    danger:  { bg: T.danger,  icon: 'x' },
    info:    { bg: T.text,    icon: 'info' },
  };
  const t = tones[toast.tone] || tones.info;
  return (
    <div style={{
      position:'absolute', bottom:24, left:'50%', transform:'translateX(-50%)',
      background:t.bg, color:'#fff', padding:'10px 16px', borderRadius:10,
      display:'flex', alignItems:'center', gap:10,
      boxShadow:'0 8px 24px rgba(15,23,42,.18)',
      zIndex:200, animation:'protoToastIn .2s cubic-bezier(.2,.7,.3,1)',
      fontSize:13, fontWeight:600,
    }}>
      <Icon name={t.icon} size={13} color="#fff" stroke={2.4}/>
      {toast.message}
    </div>
  );
}

// ─── Modals ─────────────────────────────────────────────────────────
function CreateRequestModal({ onClose, dispatch }) {
  const [material, setMaterial] = React.useState('');
  const [qty, setQty]           = React.useState('');
  const [section, setSection]   = React.useState('');
  const [floor, setFloor]       = React.useState('');
  const [priority, setPriority] = React.useState('normal');
  const [needBy, setNeedBy]     = React.useState('');
  const [note, setNote]         = React.useState('');

  const mat = material && M.material(material);
  const valid = material && qty && section;

  return (
    <ProtoModal title="New material request" sub="Tell us what you need on site. The admin will approve and place the PO."
      onClose={onClose} width={580}
      primary={{ label:'Submit request', disabled: !valid, onClick: () => {
        dispatch({ type:'CREATE_REQUEST', payload: {
          material, qty: parseFloat(qty), unit: mat.unit, section, floor: floor || '—',
          priority, needBy, note: note || undefined,
        }});
        onClose();
      }}}
      secondary={{ label:'Cancel', onClick: onClose }}
    >
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <ProtoField label="Material" full>
          <ProtoSelect value={material} onChange={setMaterial}
            placeholder="Pick a material…"
            options={M_MATERIALS.map(m => ({ value: m.id, label: `${m.name} · ${m.spec}` }))}/>
        </ProtoField>
        <ProtoField label="Quantity">
          <ProtoInput value={qty} onChange={setQty} type="number" mono
            placeholder="0" suffix={mat ? mat.unit : 'unit'}/>
        </ProtoField>
        <ProtoField label="Priority">
          <ProtoSelect value={priority} onChange={setPriority}
            options={[{value:'normal', label:'Normal'},{value:'high', label:'High'}]}/>
        </ProtoField>
        <ProtoField label="Section">
          <ProtoInput value={section} onChange={setSection} placeholder="e.g. Foundation"/>
        </ProtoField>
        <ProtoField label="Floor" optional>
          <ProtoInput value={floor} onChange={setFloor} placeholder="e.g. Ground Floor"/>
        </ProtoField>
        <ProtoField label="Need by" optional full>
          <ProtoInput value={needBy} onChange={setNeedBy} type="date"/>
        </ProtoField>
        <ProtoField label="Note for admin" optional full>
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Quote from a vendor? Anything special?" rows={2}
            style={{
              width:'100%', padding:'9px 12px', background:'#fff', border:`1px solid ${T.border}`,
              borderRadius:8, fontSize:13, color:T.text, fontFamily:T.font, outline:'none', resize:'vertical',
              boxSizing:'border-box',
            }}/>
        </ProtoField>
      </div>
    </ProtoModal>
  );
}

function ApproveModal({ thread, onClose, dispatch }) {
  const mat = M.material(thread.material);
  const eng = M.engineer(thread.requestedBy);
  return (
    <ProtoModal title={`Approve ${thread.id}?`} sub="Once approved, this request is ready for PO creation."
      onClose={onClose} width={460}
      primary={{ label:'Approve', onClick: () => { dispatch({ type:'APPROVE_REQUEST', id: thread.id }); onClose(); }}}
      secondary={{ label:'Cancel', onClick: onClose }}
      danger={{ label:'Reject', onClick: () => { dispatch({ type:'REJECT_REQUEST', id: thread.id, reason:'Rejected by admin' }); onClose(); }}}>
      <div style={{display:'flex', flexDirection:'column', gap:8, padding:14, background:T.bg, borderRadius:10}}>
        <Row k="Material" v={`${mat.name} · ${mat.spec}`}/>
        <Row k="Quantity" v={<span style={{fontFamily:T.mono}}>{thread.qty} {thread.unit}</span>}/>
        <Row k="Section"  v={`${thread.section} · ${thread.floor || '—'}`}/>
        <Row k="Need by"  v={fmtDateLong(thread.needBy)}/>
        <Row k="Requested by" v={eng ? eng.name : '—'}/>
        <Row k="Priority" v={<Badge tone={thread.priority==='high' ? 'danger' : 'neutral'}>{thread.priority}</Badge>}/>
        {thread.note && <Row k="Note" v={<span style={{fontStyle:'italic'}}>"{thread.note}"</span>}/>}
      </div>
    </ProtoModal>
  );
}

function CreatePOModal({ thread, onClose, dispatch }) {
  const mat = M.material(thread.material);
  const [vendor, setVendor]     = React.useState('');
  const [kind, setKind]         = React.useState('own');
  const [advance, setAdvance]   = React.useState(false);
  const [unitPrice, setPrice]   = React.useState('');
  const [expected, setExpected] = React.useState('');
  const [payer, setPayer]       = React.useState(thread.site);

  const amount = unitPrice ? parseFloat(unitPrice) * thread.qty : 0;
  const valid = vendor && unitPrice && expected;

  return (
    <ProtoModal title={`Place PO for ${thread.id}`} sub={`${thread.qty} ${thread.unit} · ${mat.name}`}
      onClose={onClose} width={620}
      primary={{ label: `Place order · ${inr(amount)}`, disabled: !valid, onClick: () => {
        dispatch({ type:'CREATE_PO', id: thread.id, payload: {
          vendor, kind, advance, amount, expected, payer,
        }});
        onClose();
      }}}
      secondary={{ label:'Cancel', onClick: onClose }}
    >
      <ProtoField label="Purchase type">
        <ProtoRadioCards value={kind} onChange={setKind}
          options={[
            { value:'own',   label:'Own site',   sub:'For Srinivasan only · expense posts here.', icon:'home' },
            { value:'group', label:'Group · cluster', sub:'Shared with Padmavathy · inter-site reconciles by usage.', icon:'link' },
          ]}/>
      </ProtoField>

      <ProtoField label="Vendor">
        <ProtoSelect value={vendor} onChange={setVendor}
          placeholder="Pick the best vendor…"
          options={M_VENDORS.filter(v =>
            v.kind === mat.cat || (mat.cat === 'Cement' && v.kind === 'Cement') ||
            (mat.cat === 'Aggregates' && v.kind === 'Aggregates') ||
            (mat.cat === 'Steel' && v.kind === 'Steel') ||
            (mat.cat === 'Bricks' && v.kind === 'Bricks') ||
            (mat.cat === 'Timber' && v.kind === 'Timber') ||
            (mat.cat === 'Electrical' && v.kind === 'Electrical')
          ).concat(M_VENDORS.slice(0,3))
            .filter((v,i,a) => a.findIndex(x=>x.id===v.id)===i)
            .map(v => ({ value: v.id, label: `${v.name}  ·  ${v.lastPrice} · lead ${v.leadTime} · ★ ${v.rating}` }))}/>
      </ProtoField>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <ProtoField label="Unit price">
          <ProtoInput value={unitPrice} onChange={setPrice} type="number" mono
            placeholder="0" leading={<span style={{fontFamily:T.mono, color:T.muted, fontSize:13}}>₹</span>}
            suffix={`per ${thread.unit}`}/>
        </ProtoField>
        <ProtoField label="Expected delivery">
          <ProtoInput value={expected} onChange={setExpected} type="date"/>
        </ProtoField>
      </div>

      {kind === 'group' && (
        <ProtoField label="Which site pays?">
          <ProtoRadioCards value={payer} onChange={setPayer}
            options={M_GROUP.members.map(sid => {
              const s = M.site(sid);
              return { value: sid, label: s.name, sub: sid === thread.site ? 'This site' : 'Cluster partner' };
            })}/>
        </ProtoField>
      )}

      <ProtoField label="Advance / bulk purchase" sub="Pay upfront for the full quantity now and get partial deliveries at a discount.">
        <label style={{
          display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
          background: advance ? T.warnSoft : '#fff', border:`1.5px solid ${advance ? T.warn : T.border}`, borderRadius:10, cursor:'pointer',
        }}>
          <input type="checkbox" checked={advance} onChange={(e) => setAdvance(e.target.checked)} style={{cursor:'pointer'}}/>
          <Icon name="calendar" size={14} color={advance ? T.warn : T.subtle}/>
          <span style={{fontSize:12.5, fontWeight:700, color: advance ? T.warn : T.text}}>
            Treat as advance order
          </span>
          {advance && <span style={{marginLeft:'auto', fontSize:11, color:T.warn, fontWeight:600}}>Vendor settles immediately</span>}
        </label>
      </ProtoField>

      {amount > 0 && (
        <div style={{padding:'12px 16px', background:T.bg, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{fontSize:12, color:T.muted}}>Order total</div>
          <div style={{fontSize:18, fontWeight:800, fontFamily:T.mono, color:T.text}}>{inr(amount)}</div>
        </div>
      )}
    </ProtoModal>
  );
}

function RecordDeliveryModal({ thread, onClose, dispatch }) {
  const mat = M.material(thread.material);
  const vendor = M.vendor(thread.po.vendor);
  const [qty, setQty]       = React.useState(thread.qty.toString());
  const [quality, setQuality] = React.useState('good');
  const [notes, setNotes]   = React.useState('');

  return (
    <ProtoModal title="Record delivery" sub={`${thread.po.id} · ${vendor.name}`}
      onClose={onClose} width={520}
      primary={{ label:'Confirm & add to inventory', onClick: () => {
        dispatch({ type:'RECORD_DELIVERY', id: thread.id, payload: {
          qty: parseFloat(qty), quality, notes,
        }});
        onClose();
      }}}
      secondary={{ label:'Cancel', onClick: onClose }}
    >
      <div style={{display:'flex', flexDirection:'column', gap:8, padding:14, background:T.bg, borderRadius:10, marginBottom:14}}>
        <Row k="Expected" v={<span style={{fontFamily:T.mono}}>{thread.qty} {thread.unit}</span>}/>
        <Row k="Material" v={`${mat.name} · ${mat.spec}`}/>
        <Row k="Vendor"   v={vendor.name}/>
      </div>

      <ProtoField label="Quantity received">
        <ProtoInput value={qty} onChange={setQty} type="number" mono suffix={thread.unit}/>
      </ProtoField>

      <ProtoField label="Quality">
        <ProtoRadioCards value={quality} onChange={setQuality}
          options={[
            { value:'good', label:'Good',  sub:'As specified' },
            { value:'fair', label:'Fair',  sub:'Accepted with adjustment' },
            { value:'poor', label:'Poor',  sub:'Rejected — return to vendor' },
          ]}/>
      </ProtoField>

      <ProtoField label="Notes for the record" optional>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything to flag? Photographed?" rows={2}
          style={{
            width:'100%', padding:'9px 12px', background:'#fff', border:`1px solid ${T.border}`,
            borderRadius:8, fontSize:13, color:T.text, fontFamily:T.font, outline:'none', resize:'vertical',
            boxSizing:'border-box',
          }}/>
      </ProtoField>

      <div style={{padding:'10px 12px', background:T.primarySoft, borderRadius:8, display:'flex', alignItems:'center', gap:8}}>
        <Icon name="info" size={13} color={T.primary}/>
        <span style={{fontSize:12, color:T.primary, fontWeight:600}}>
          {thread.kind === 'group'
            ? 'Goes into the group stock — visible to both Srinivasan & Padmavathy.'
            : 'Goes into your site\'s inventory.'}
        </span>
      </div>
    </ProtoModal>
  );
}

function SettleVendorModal({ thread, onClose, dispatch }) {
  const vendor = M.vendor(thread.po.vendor);
  const [by, setBy] = React.useState('office');

  return (
    <ProtoModal title="Settle vendor" sub={`${vendor.name} · ${inr(thread.po.amount)}`}
      onClose={onClose} width={520}
      primary={{ label:`Pay ${inr(thread.po.amount)}`, onClick: () => {
        dispatch({ type:'SETTLE_VENDOR', id: thread.id, by });
        onClose();
      }}}
      secondary={{ label:'Cancel', onClick: onClose }}
    >
      <ProtoField label="Payment source">
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          <PaymentOption value="office" active={by==='office'} onClick={() => setBy('office')}
            icon="home" title="Office (bank transfer)" sub="Pay from company bank · default for vendor settlements"/>
          <PaymentOption value="wallet" active={by==='wallet'} onClick={() => setBy('wallet')}
            icon="user" title="Site engineer wallet" sub="Ajith K. · ₹4,820 available · settle and reimburse later"
            hint="Pick this when the engineer is at the vendor and needs to pay immediately."/>
          <PaymentOption value="site" active={by==='site'} onClick={() => setBy('site')}
            icon="receipt" title="Site funds" sub={`Direct from ${M.site(thread.site).name}`}/>
        </div>
      </ProtoField>

      {thread.kind === 'group' && (
        <div style={{padding:'10px 12px', background:T.pinkSoft, borderRadius:8, display:'flex', alignItems:'flex-start', gap:8, marginTop:6}}>
          <Icon name="link" size={13} color={T.pink}/>
          <span style={{fontSize:11.5, color:T.pink, fontWeight:600, lineHeight:1.5}}>
            Group PO · the cost will reconcile across {M_GROUP.members.length} sites based on usage. Net debt updates automatically.
          </span>
        </div>
      )}
    </ProtoModal>
  );
}

function PaymentOption({ active, icon, title, sub, onClick, hint }) {
  return (
    <button onClick={onClick} style={{
      padding:'12px 14px', borderRadius:10, fontFamily:T.font, textAlign:'left', cursor:'pointer',
      background: active ? T.primarySoft : '#fff',
      border: `1.5px solid ${active ? T.primary : T.border}`,
      display:'flex', alignItems:'flex-start', gap:12,
    }}>
      <span style={{
        width:30, height:30, borderRadius:8, background: active ? T.primary : T.bg,
        color: active ? '#fff' : T.muted, flex:'0 0 auto',
        display:'inline-flex', alignItems:'center', justifyContent:'center',
      }}>
        <Icon name={icon} size={14}/>
      </span>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:700, color: active ? T.primary : T.text}}>{title}</div>
        <div style={{fontSize:11.5, color:T.muted, marginTop:2}}>{sub}</div>
        {hint && active && (
          <div style={{fontSize:11, color:T.primary, marginTop:6, fontStyle:'italic'}}>{hint}</div>
        )}
      </div>
      {active && <Icon name="check" size={14} color={T.primary} stroke={2.4}/>}
    </button>
  );
}

function LogUsageModal({ thread, onClose, dispatch }) {
  const mat = M.material(thread.material);
  const [qty, setQty] = React.useState(0);
  const [bySite, setBySite] = React.useState(thread.kind === 'group' ? 'srinivasan' : thread.site);
  const remaining = thread.inventory.remaining;

  return (
    <ProtoModal title="Log usage" sub={`${thread.inventory.batch} · ${mat.name}`}
      onClose={onClose} width={520}
      primary={{ label:`Log ${qty} ${thread.unit}`, disabled: qty <= 0, onClick: () => {
        dispatch({ type:'LOG_USAGE', id: thread.id, payload: { qty, bySite }});
        onClose();
      }}}
      secondary={{ label:'Cancel', onClick: onClose }}
    >
      {thread.kind === 'group' && (
        <ProtoField label="Used for which site?" sub="Group stock is shared — pick whose work consumed this.">
          <ProtoRadioCards value={bySite} onChange={setBySite}
            options={M_GROUP.members.map(sid => ({
              value: sid, label: M.site(sid).name,
              sub: sid === thread.po.payer ? 'Payer · no inter-site debt' : 'Will accrue to inter-site',
            }))}/>
        </ProtoField>
      )}

      <ProtoField label={`How much? (${remaining} ${thread.unit} remaining)`}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <button onClick={() => setQty(Math.max(0, qty - 1))} style={{
            width:42, height:42, borderRadius:11, border:`1px solid ${T.border}`, background:'#fff',
            fontSize:22, fontWeight:700, color:T.text, cursor:'pointer',
          }}>−</button>
          <div style={{flex:1, padding:'12px', background:T.bg, borderRadius:11, textAlign:'center'}}>
            <div style={{fontSize:28, fontWeight:800, fontFamily:T.mono, letterSpacing:-0.6, color:T.text, lineHeight:1}}>{qty}</div>
            <div style={{fontSize:10, color:T.subtle, fontWeight:600, marginTop:3, letterSpacing:0.4, textTransform:'uppercase'}}>{thread.unit}</div>
          </div>
          <button onClick={() => setQty(Math.min(remaining, qty + 1))} style={{
            width:42, height:42, borderRadius:11, border:'none', background:T.primary, color:'#fff',
            fontSize:22, fontWeight:700, cursor:'pointer',
          }}>+</button>
        </div>
        <div style={{display:'flex', gap:6, marginTop:10}}>
          {[1,5,10,25].filter(n => n <= remaining).map(n => (
            <button key={n} onClick={() => setQty(qty + n)} style={{
              flex:1, padding:'8px', borderRadius:8, border:`1px solid ${T.border}`, background:'#fff',
              fontSize:12, fontWeight:600, fontFamily:T.mono, cursor:'pointer', color:T.text,
            }}>+{n}</button>
          ))}
        </div>
      </ProtoField>

      {thread.kind === 'group' && bySite !== thread.po.payer && qty > 0 && (
        <div style={{padding:'10px 12px', background:T.pinkSoft, borderRadius:8, display:'flex', alignItems:'center', gap:8, marginTop:4}}>
          <Icon name="link" size={13} color={T.pink}/>
          <span style={{fontSize:11.5, color:T.pink, fontWeight:600}}>
            {M.site(bySite).short} will owe {M.site(thread.po.payer).short} ≈ {inr(qty * thread.po.amount / thread.inventory.received)} for this usage.
          </span>
        </div>
      )}
    </ProtoModal>
  );
}

function Row({ k, v }) {
  return (
    <div style={{display:'flex', alignItems:'baseline', gap:10}}>
      <div style={{fontSize:11, color:T.subtle, fontWeight:600, minWidth:90, letterSpacing:0.2, textTransform:'uppercase'}}>{k}</div>
      <div style={{fontSize:13, color:T.text, fontWeight:500, flex:1}}>{v}</div>
    </div>
  );
}

Object.assign(window, {
  ProtoModal, ProtoField, ProtoInput, ProtoSelect, ProtoRadioCards,
  ProtoToast, Row,
  CreateRequestModal, ApproveModal, CreatePOModal, RecordDeliveryModal,
  SettleVendorModal, LogUsageModal,
});
