// Spot purchase — the post-facto, low-ceremony counterpart to the MR/PO
// chain. Supervisor walked to a nearby shop, paid from his wallet, is now
// recording what already happened. 30-second happy path.
//
// Also: the "+ New entry" launcher (Request / Bought at shop / Record
// delivery) and the group-stock provisional → final allocation flow.

// ─── New entry launcher ───────────────────────────────────────────
function NewEntryMenu({ onClose, dispatch }) {
  const choose = (kind) => {
    onClose();
    setTimeout(() => dispatch({ type:'OPEN_MODAL', modal: { kind } }), 60);
  };
  return (
    <ProtoModal title="New material entry" sub="Three ways material gets into the system."
      onClose={onClose} width={560}>
      <div style={{display:'flex', flexDirection:'column', gap:10}}>
        <EntryChoice
          icon="receipt" tone="primary"
          title="Request material" sub="Planned purchase. Office approves, picks vendor, places PO. Use for truckloads."
          tag="Standard flow · 5 steps"
          onClick={() => choose('create-request')}
        />
        <EntryChoice
          icon="receipt" tone="pink" highlighted
          title="Bought at shop" sub="Already paid for it from your wallet. Walked into a shop, picked off the shelf, returned to site."
          tag="Spot · post-facto · &lt; 30 sec"
          onClick={() => choose('spot-purchase')}
        />
        <EntryChoice
          icon="download" tone="warn"
          title="Record delivery" sub="A PO truck has arrived. Verify quantity + quality and add to inventory."
          tag="Receives an existing PO"
          onClick={() => {
            // No specific thread — show a hint that the action belongs on a
            // thread row. For prototype, just close.
            onClose();
          }}
        />
      </div>
    </ProtoModal>
  );
}

function EntryChoice({ icon, tone, title, sub, tag, onClick, highlighted }) {
  const tones = {
    primary: { bg: T.primarySoft, fg: T.primary },
    pink:    { bg: T.pinkSoft,    fg: T.pink },
    warn:    { bg: T.warnSoft,    fg: T.warn },
  };
  const t = tones[tone];
  return (
    <button onClick={onClick} style={{
      padding:'14px 16px', borderRadius:12, cursor:'pointer', fontFamily:T.font, textAlign:'left',
      background:'#fff',
      border:`1.5px solid ${highlighted ? t.fg : T.border}`,
      display:'flex', alignItems:'flex-start', gap:14, position:'relative',
    }}>
      <span style={{
        width:36, height:36, borderRadius:9, background:t.bg, color:t.fg, flex:'0 0 auto',
        display:'inline-flex', alignItems:'center', justifyContent:'center',
      }}>
        <Icon name={icon} size={16}/>
      </span>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:3}}>
          <span style={{fontSize:14, fontWeight:700, color:T.text}}>{title}</span>
          {highlighted && (
            <span style={{
              padding:'2px 6px', borderRadius:4, background:t.fg, color:'#fff',
              fontSize:9, fontWeight:800, letterSpacing:0.4, textTransform:'uppercase',
            }}>NEW</span>
          )}
        </div>
        <div style={{fontSize:11.5, color:T.muted, lineHeight:1.5, marginBottom:6}}
          dangerouslySetInnerHTML={{__html: sub}}/>
        <div style={{display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:4,
          background:T.bg, color:T.subtle, fontSize:10, fontWeight:700, letterSpacing:0.2,
        }}>{tag}</div>
      </div>
      <Icon name="arrowRt" size={13} color={T.subtle}/>
    </button>
  );
}

// ─── Spot purchase form ─────────────────────────────────────────────
function SpotPurchaseModal({ onClose, dispatch }) {
  const [vendor, setVendor]   = React.useState('');
  const [vendorIsNew, setVN]  = React.useState(false);
  const [section, setSection] = React.useState('');
  const [kind, setKind]       = React.useState('own');
  const [allocation, setAlloc] = React.useState({
    split: M_GROUP.members.map(s => ({ site: s, pct: s === 'srinivasan' ? 60 : 40 })),
  });
  const [items, setItems]     = React.useState([
    { id: 1, material:'', name:'', qty:'', unit:'piece', paidRate:'', lastRate: null },
  ]);
  const [paymentMode, setPM]  = React.useState('upi');
  const [billAttached, setBill] = React.useState(false);
  const [screenshotAttached, setSS] = React.useState(false);

  const walletBalance = 4820; // engineer wallet (seed)

  const addItem = () => setItems(its => [...its, {
    id: Math.max(...its.map(x => x.id)) + 1, material:'', name:'', qty:'', unit:'piece', paidRate:'', lastRate: null,
  }]);
  const removeItem = (id) => setItems(its => its.filter(x => x.id !== id));
  const updateItem = (id, patch) => setItems(its => its.map(x => x.id === id ? { ...x, ...patch } : x));

  const lineTotals = items.map(it => (parseFloat(it.qty) || 0) * (parseFloat(it.paidRate) || 0));
  const total = lineTotals.reduce((a,b) => a+b, 0);
  const projected = walletBalance - total;

  const allocPctSum = allocation.split.reduce((a,s) => a + s.pct, 0);
  const allocOk = kind === 'own' || allocPctSum === 100 || allocPctSum === 0;
  const itemsOk = items.every(it => it.material && it.qty && parseFloat(it.qty) > 0 && it.paidRate && parseFloat(it.paidRate) > 0);
  const valid = vendor && itemsOk && total > 0 && allocOk;

  const submit = () => {
    const payload = {
      vendor: vendor.toLowerCase().replace(/\s+/g, '-'),
      vendorName: vendor,
      vendorIsDraft: vendorIsNew,
      section: section || 'On-site',
      kind,
      paymentMode,
      bill: billAttached ? { attached:true, kind:'image' } : { attached:false },
      screenshot: screenshotAttached ? { attached:true, kind:'image' } : { attached:false },
      items: items.map((it, i) => {
        const mat = M.material(it.material) || M.material(it.material) || { name: it.name || 'Custom', unit: it.unit };
        return {
          material: it.material,
          name: mat.name || it.name,
          qty: parseFloat(it.qty),
          unit: mat.unit || it.unit,
          paidRate: parseFloat(it.paidRate),
          lastRate: it.lastRate,
          lineTotal: lineTotals[i],
        };
      }),
      allocation: kind === 'group' && allocPctSum === 100 ? {
        kind: 'provisional',
        split: allocation.split,
        dueBy: new Date(Date.now() + 7*24*60*60*1000).toISOString().slice(0,10),
      } : (kind === 'group' ? { kind: 'provisional', split: M_GROUP.members.map(s => ({ site: s, pct: 0 })), dueBy: new Date(Date.now() + 7*24*60*60*1000).toISOString().slice(0,10) } : undefined),
    };
    dispatch({ type:'RECORD_SPOT_PURCHASE', payload });
    onClose();
  };

  return (
    <ProtoModal title="Bought at shop · spot purchase" sub="Record a small-quantity walk-in purchase you've already paid for from your wallet."
      onClose={onClose} width={680}
      primary={{ label: total > 0 ? `Record · ₹${total.toLocaleString('en-IN')}` : 'Record purchase', disabled: !valid, onClick: submit }}
      secondary={{ label:'Cancel', onClick: onClose }}
    >
      {/* AI peek — placeholder for OCR ingestion */}
      <div style={{
        display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
        background:T.primarySoft, borderRadius:9, marginBottom:14,
      }}>
        <span style={{
          width:26, height:26, borderRadius:7, background:T.primary, color:'#fff',
          display:'inline-flex', alignItems:'center', justifyContent:'center',
        }}><Icon name="sparkle" size={12}/></span>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:12, fontWeight:700, color:T.primary}}>Snap a bill to auto-fill</div>
          <div style={{fontSize:10.5, color:T.muted}}>Optional · AI will read vendor + items + paid rates from a photo.</div>
        </div>
        <button style={{
          padding:'6px 10px', borderRadius:6, border:`1px solid ${T.primary}`, cursor:'pointer',
          background:'#fff', color:T.primary, fontSize:11, fontWeight:700, fontFamily:T.font,
        }}>Snap</button>
      </div>

      {/* Vendor */}
      <ProtoField label="Where did you buy?">
        <VendorAutocomplete value={vendor} onChange={setVendor} onNewFlag={setVN}/>
      </ProtoField>

      {/* Section + buying for */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <ProtoField label="Section · what for?" optional>
          <ProtoInput value={section} onChange={setSection} placeholder="e.g. Masonry, Slab…"/>
        </ProtoField>
        <ProtoField label="Buying for">
          <ProtoRadioCards value={kind} onChange={setKind}
            options={[
              { value:'own',   label:'This site',    icon:'home' },
              { value:'group', label:'Group cluster', icon:'link' },
            ]}/>
        </ProtoField>
      </div>

      {kind === 'group' && (
        <ProtoField label="Provisional split · % each site" sub="Edit later before finalizing. Defaults to 60/40; type 0/0 to skip and finalize after consumption.">
          <div style={{background:T.bg, borderRadius:10, padding:'12px 14px', border:`1px solid ${T.hairline}`}}>
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {allocation.split.map((s, i) => {
                const site = M.site(s.site);
                return (
                  <div key={i} style={{display:'flex', alignItems:'center', gap:10}}>
                    <span style={{
                      padding:'4px 9px', borderRadius:5, background:`${site.accent}1a`, color:site.accent,
                      fontSize:11, fontWeight:800, minWidth:42, textAlign:'center',
                    }}>{site.short}</span>
                    <span style={{fontSize:12, color:T.muted, flex:1}}>{site.name}</span>
                    <input type="number" value={s.pct}
                      onChange={(e) => setAlloc(a => ({ ...a, split: a.split.map((x,j) => j===i ? { ...x, pct: parseFloat(e.target.value)||0 } : x) }))}
                      style={{
                        width:64, padding:'5px 8px', background:'#fff', border:`1px solid ${T.border}`, borderRadius:6,
                        fontSize:12, fontFamily:T.mono, fontWeight:700, color:T.text, outline:'none', textAlign:'right',
                      }}/>
                    <span style={{fontSize:11, color:T.muted, fontWeight:600}}>%</span>
                  </div>
                );
              })}
              <div style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                paddingTop:8, borderTop:`1px dashed ${T.border}`, marginTop:2,
              }}>
                <span style={{fontSize:11, color: allocOk ? T.success : T.warn, fontWeight:700}}>
                  Total {allocPctSum}%
                </span>
                <span style={{fontSize:10.5, color:T.muted}}>
                  {allocPctSum === 100 ? 'Splits cleanly.' : allocPctSum === 0 ? 'Will finalize later.' : 'Must total 100% (or 0% to defer).'}
                </span>
              </div>
            </div>
          </div>
        </ProtoField>
      )}

      {/* Items repeater */}
      <ProtoField label="Items · what did you buy?">
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {items.map((it, i) => (
            <SpotItemRow key={it.id}
              item={it}
              total={lineTotals[i]}
              onChange={(patch) => updateItem(it.id, patch)}
              onRemove={items.length > 1 ? () => removeItem(it.id) : null}
            />
          ))}
          <button onClick={addItem} style={{
            display:'inline-flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:8,
            border:`1px dashed ${T.border}`, background:'transparent', color:T.muted,
            fontSize:12, fontWeight:600, fontFamily:T.font, cursor:'pointer', alignSelf:'flex-start',
          }}>
            <Icon name="plus" size={11} color={T.muted}/> Add another item
          </button>
        </div>
      </ProtoField>

      {/* Receipts */}
      <ProtoField label="Receipts · attach if you have them" optional>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
          <ReceiptSlot label="Bill image" attached={billAttached} onToggle={() => setBill(b => !b)}/>
          <ReceiptSlot label="Payment screenshot" attached={screenshotAttached} onToggle={() => setSS(s => !s)} note="UPI / cash receipt"/>
        </div>
      </ProtoField>

      {/* Totals + payment */}
      <div style={{
        padding:'14px 16px', background:'#0f172a', borderRadius:12, color:'#fff',
        display:'flex', flexDirection:'column', gap:10,
      }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div>
            <div style={{fontSize:11, opacity:0.65, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase'}}>Total to record</div>
            <div style={{fontSize:24, fontWeight:800, fontFamily:T.mono, letterSpacing:-0.4, marginTop:2}}>
              ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{display:'flex', gap:6}}>
            <PMRadio active={paymentMode==='cash'} onClick={() => setPM('cash')} label="Cash"/>
            <PMRadio active={paymentMode==='upi'}  onClick={() => setPM('upi')} label="UPI"/>
          </div>
        </div>
        <div style={{
          display:'flex', justifyContent:'space-between', padding:'9px 12px',
          background:'rgba(255,255,255,.07)', borderRadius:8,
          fontSize:11.5,
        }}>
          <span style={{opacity:0.75}}>Ajith's wallet now</span>
          <span style={{fontFamily:T.mono, fontWeight:700}}>₹{walletBalance.toLocaleString('en-IN')}</span>
        </div>
        <div style={{
          display:'flex', justifyContent:'space-between', padding:'9px 12px',
          background: projected < 0 ? 'rgba(239,68,68,.18)' : 'rgba(255,255,255,.07)',
          borderRadius:8, fontSize:11.5,
        }}>
          <span style={{opacity:0.75}}>After this spend</span>
          <span style={{fontFamily:T.mono, fontWeight:700, color: projected < 0 ? '#fca5a5' : '#fff'}}>
            ₹{projected.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            {projected < 0 && ' (overdraft)'}
          </span>
        </div>
      </div>
    </ProtoModal>
  );
}

function VendorAutocomplete({ value, onChange, onNewFlag }) {
  const [open, setOpen] = React.useState(false);
  const matches = M_VENDORS.filter(v => v.name.toLowerCase().includes(value.toLowerCase()));
  const isNew = value && !matches.some(m => m.name.toLowerCase() === value.toLowerCase());
  React.useEffect(() => { onNewFlag(isNew); }, [isNew]);
  return (
    <div style={{position:'relative'}}>
      <ProtoInput value={value} onChange={(v) => { onChange(v); setOpen(true); }}
        placeholder="ARM Build Mart, Sri Tools…"
        leading={<Icon name="search" size={13} color={T.subtle}/>}/>
      {open && value && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:10,
          background:'#fff', border:`1px solid ${T.border}`, borderRadius:8,
          boxShadow:'0 8px 24px rgba(15,23,42,.12)', maxHeight:200, overflow:'auto',
        }}>
          {matches.slice(0,4).map(m => (
            <button key={m.id} onClick={() => { onChange(m.name); setOpen(false); }}
              style={{
                display:'flex', width:'100%', padding:'8px 12px', border:'none', background:'transparent',
                cursor:'pointer', fontFamily:T.font, alignItems:'center', gap:10, textAlign:'left',
              }}>
              <div style={{flex:1}}>
                <div style={{fontSize:12.5, fontWeight:600, color:T.text}}>{m.name}</div>
                <div style={{fontSize:10.5, color:T.muted}}>{m.kind} · last paid {m.lastPrice} · ★ {m.rating}</div>
              </div>
            </button>
          ))}
          {isNew && (
            <button onClick={() => setOpen(false)} style={{
              display:'flex', width:'100%', padding:'8px 12px', border:'none', background:T.warnSoft,
              cursor:'pointer', fontFamily:T.font, alignItems:'center', gap:10, textAlign:'left',
              borderTop:`1px solid ${T.warn}33`,
            }}>
              <Icon name="plus" size={12} color={T.warn}/>
              <div style={{flex:1}}>
                <div style={{fontSize:12, fontWeight:700, color:T.warn}}>Will create new shop "{value}"</div>
                <div style={{fontSize:10.5, color:T.muted}}>Saved as draft · office reviews later</div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SpotItemRow({ item, total, onChange, onRemove }) {
  const [open, setOpen] = React.useState(false);
  const mat = item.material && M.material(item.material);
  const lastRate = mat?.id === 'binding-wire' ? 95 : mat?.id === 'nails' ? 88 : null;
  const rateDiff = item.paidRate && lastRate && Math.abs(parseFloat(item.paidRate) - lastRate) > 0.01;

  const pickMaterial = (id, name) => {
    const m = M.material(id);
    onChange({ material: id, name, unit: m?.unit || 'piece', lastRate: lastRate });
    setOpen(false);
  };

  return (
    <div style={{
      background:'#fff', border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 12px',
      display:'flex', flexDirection:'column', gap:8,
    }}>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <div style={{flex:1, minWidth:0, position:'relative'}}>
          <ProtoInput
            value={item.material ? (M.material(item.material)?.name || item.name) : item.name}
            onChange={(v) => { onChange({ name: v, material: '' }); setOpen(true); }}
            placeholder="Binding wire, bolts, nails…"
            leading={<Icon name="search" size={11} color={T.subtle}/>}
          />
          {open && item.name && !item.material && (
            <div style={{
              position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:5,
              background:'#fff', border:`1px solid ${T.border}`, borderRadius:8,
              boxShadow:'0 8px 24px rgba(15,23,42,.12)', maxHeight:180, overflow:'auto',
            }}>
              {M_MATERIALS.filter(m => m.name.toLowerCase().includes(item.name.toLowerCase())).slice(0,5).map(m => (
                <button key={m.id} onClick={() => pickMaterial(m.id, m.name)} style={{
                  display:'flex', width:'100%', padding:'7px 10px', border:'none', background:'transparent',
                  cursor:'pointer', fontFamily:T.font, alignItems:'center', textAlign:'left', flexDirection:'column',
                  gap:1,
                }}>
                  <span style={{fontSize:12, fontWeight:600, color:T.text}}>{m.name}</span>
                  <span style={{fontSize:10, color:T.muted}}>{m.spec} · {m.unit}</span>
                </button>
              ))}
              <button onClick={() => { pickMaterial('', item.name); }} style={{
                display:'flex', width:'100%', padding:'7px 10px', border:'none', background:T.warnSoft,
                cursor:'pointer', fontFamily:T.font, alignItems:'center', gap:6, textAlign:'left',
                borderTop:`1px solid ${T.warn}33`,
              }}>
                <Icon name="plus" size={10} color={T.warn}/>
                <span style={{fontSize:11, fontWeight:700, color:T.warn}}>Add "{item.name}" as a new material (draft)</span>
              </button>
            </div>
          )}
        </div>
        {onRemove && (
          <button onClick={onRemove} style={{
            width:30, height:30, borderRadius:7, border:`1px solid ${T.border}`, background:'#fff',
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <Icon name="x" size={11} color={T.muted}/>
          </button>
        )}
      </div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 100px', gap:8, alignItems:'flex-end'}}>
        <div>
          <label style={{fontSize:10, color:T.subtle, fontWeight:700, letterSpacing:0.3, textTransform:'uppercase'}}>Quantity</label>
          <div style={{marginTop:3}}>
            <ProtoInput value={item.qty} onChange={(v) => onChange({ qty: v })} type="number" mono
              suffix={item.unit}/>
          </div>
        </div>
        <div>
          <label style={{fontSize:10, color:T.subtle, fontWeight:700, letterSpacing:0.3, textTransform:'uppercase'}}>Paid rate</label>
          <div style={{marginTop:3}}>
            <ProtoInput value={item.paidRate} onChange={(v) => onChange({ paidRate: v })} type="number" mono
              leading={<span style={{fontSize:12, color:T.muted, fontFamily:T.mono}}>₹</span>}
              suffix={`per ${item.unit}`}/>
          </div>
          {rateDiff && (
            <div style={{fontSize:10, color: parseFloat(item.paidRate) > lastRate ? T.warn : T.success, fontWeight:600, marginTop:3}}>
              last paid ₹{lastRate} · {parseFloat(item.paidRate) > lastRate ? '↑' : '↓'} ₹{Math.abs(parseFloat(item.paidRate) - lastRate).toFixed(0)}
            </div>
          )}
        </div>
        <div style={{textAlign:'right'}}>
          <label style={{fontSize:10, color:T.subtle, fontWeight:700, letterSpacing:0.3, textTransform:'uppercase'}}>Line total</label>
          <div style={{fontSize:18, fontWeight:800, fontFamily:T.mono, color: total > 0 ? T.text : T.subtle, marginTop:3}}>
            ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptSlot({ label, attached, onToggle, note }) {
  return (
    <button onClick={onToggle} style={{
      padding:'14px 12px', borderRadius:10, cursor:'pointer', fontFamily:T.font,
      background: attached ? T.successSoft : '#fff',
      border:`1.5px ${attached ? 'solid' : 'dashed'} ${attached ? T.success : T.border}`,
      display:'flex', flexDirection:'column', alignItems:'center', gap:6,
    }}>
      <span style={{
        width:32, height:32, borderRadius:9,
        background: attached ? T.success : T.bg, color: attached ? '#fff' : T.muted,
        display:'inline-flex', alignItems:'center', justifyContent:'center',
      }}>
        <Icon name={attached ? 'check' : 'upload'} size={14} stroke={attached ? 2.4 : 2}/>
      </span>
      <div style={{fontSize:12, fontWeight:700, color: attached ? T.success : T.text}}>
        {attached ? 'Attached' : label}
      </div>
      {note && !attached && <div style={{fontSize:10, color:T.subtle}}>{note}</div>}
      {!attached && (
        <div style={{fontSize:9.5, color:T.subtle, fontWeight:600, letterSpacing:0.3}}>
          TAP · PASTE · CAMERA
        </div>
      )}
    </button>
  );
}

function PMRadio({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      padding:'7px 13px', borderRadius:7, border:`1px solid ${active ? '#fff' : 'rgba(255,255,255,.15)'}`,
      background: active ? '#fff' : 'transparent',
      color: active ? '#0f172a' : 'rgba(255,255,255,.7)',
      fontSize:11.5, fontWeight:700, fontFamily:T.font, cursor:'pointer',
    }}>{label}</button>
  );
}

// ─── Allocation finalization modal ───────────────────────────────────
function SpotAllocationModal({ thread, onClose, dispatch }) {
  const [split, setSplit] = React.useState(thread.spot.allocation.split);
  const total = split.reduce((a,s) => a + s.pct, 0);
  const ok = total === 100;

  const update = (idx, pct) => setSplit(s => s.map((x,i) => i===idx ? { ...x, pct: Math.max(0, Math.min(100, parseFloat(pct) || 0)) } : x));

  return (
    <ProtoModal title="Finalize allocation" sub={`${thread.id} · ${thread.spot.vendorName} · ₹${thread.spot.amount}`}
      onClose={onClose} width={520}
      primary={{ label:'Finalize', disabled: !ok, onClick: () => { dispatch({ type:'FINALIZE_SPOT_ALLOCATION', id: thread.id, split }); onClose(); }}}
      secondary={{ label:'Cancel', onClick: onClose }}
    >
      <div style={{padding:'12px 14px', background:T.warnSoft, borderRadius:10, marginBottom:14, display:'flex', alignItems:'flex-start', gap:8}}>
        <Icon name="info" size={13} color={T.warn}/>
        <div style={{flex:1, fontSize:11.5, color:T.warn, fontWeight:600, lineHeight:1.5}}>
          Provisional split was {thread.spot.allocation.split.map(s => `${s.pct}% ${M.site(s.site).short}`).join(' · ')}.
          Adjust to reflect actual consumption before locking. After finalize this becomes authoritative for inter-site reconciliation.
        </div>
      </div>

      <ProtoField label="Final % split">
        <div style={{background:T.bg, borderRadius:10, padding:'14px 16px', border:`1px solid ${T.hairline}`, display:'flex', flexDirection:'column', gap:10}}>
          {split.map((s, i) => {
            const site = M.site(s.site);
            const value = thread.spot.amount * s.pct / 100;
            return (
              <div key={i} style={{display:'flex', alignItems:'center', gap:10}}>
                <span style={{
                  padding:'4px 9px', borderRadius:5, background:`${site.accent}1a`, color:site.accent,
                  fontSize:11, fontWeight:800, minWidth:42, textAlign:'center',
                }}>{site.short}</span>
                <span style={{fontSize:12, color:T.muted, flex:1}}>{site.name}</span>
                <input type="number" value={s.pct} onChange={(e) => update(i, e.target.value)} style={{
                  width:64, padding:'5px 8px', background:'#fff', border:`1px solid ${T.border}`, borderRadius:6,
                  fontSize:12, fontFamily:T.mono, fontWeight:700, color:T.text, outline:'none', textAlign:'right',
                }}/>
                <span style={{fontSize:11, color:T.muted, fontWeight:600, minWidth:14}}>%</span>
                <span style={{fontSize:11, fontFamily:T.mono, fontWeight:700, color:T.text, minWidth:74, textAlign:'right'}}>
                  ₹{value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })}
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:8, borderTop:`1px dashed ${T.border}`}}>
            <span style={{fontSize:11, fontWeight:700, color: ok ? T.success : T.danger}}>Total {total}%</span>
            <span style={{fontSize:10.5, color:T.muted}}>{ok ? 'Locks in on finalize.' : 'Must total exactly 100%.'}</span>
          </div>
        </div>
      </ProtoField>

      <div style={{padding:'10px 12px', background:T.primarySoft, borderRadius:8, fontSize:11.5, color:T.primary, fontWeight:600, marginTop:4, display:'flex', alignItems:'center', gap:8}}>
        <Icon name="link" size={13} color={T.primary}/>
        Inter-site debt updates instantly. Each site's material-expense ledger picks up its share.
      </div>
    </ProtoModal>
  );
}

// ─── Allocations needed queue (lives on Hub) ─────────────────────────
function AllocationsQueue({ state, dispatch }) {
  const queue = state.threads.filter(t => t.purchaseType === 'spot' && t.kind === 'group' && t.spotStage === 'provisional');
  if (queue.length === 0) return null;
  return (
    <div style={{
      background:'#fff', border:`1px solid ${T.warn}55`, borderRadius:12, overflow:'hidden', marginBottom:14,
    }}>
      <div style={{
        padding:'10px 14px', background:T.warnSoft, borderBottom:`1px solid ${T.warn}33`,
        display:'flex', alignItems:'center', gap:10,
      }}>
        <Icon name="bell" size={14} color={T.warn}/>
        <div style={{flex:1}}>
          <div style={{fontSize:12.5, fontWeight:700, color:T.warn}}>{queue.length} batch{queue.length !== 1 ? 'es' : ''} need{queue.length === 1 ? 's' : ''} allocation</div>
          <div style={{fontSize:11, color:T.muted}}>Group spot purchases with a provisional split — finalize to lock the inter-site share.</div>
        </div>
      </div>
      <div>
        {queue.map((t, i) => {
          const mat = M.material(t.material);
          const age = Math.max(0, Math.floor((Date.now() - new Date(t.boughtAt).getTime()) / (24*60*60*1000)));
          const overdue = age >= 7 || t.inventory.remaining <= 0;
          return (
            <div key={t.id} style={{
              padding:'10px 14px', borderBottom: i < queue.length-1 ? `1px solid ${T.hairline}` : 'none',
              display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:14, alignItems:'center',
            }}>
              <span style={{fontFamily:T.mono, fontSize:10.5, color:T.subtle, fontWeight:600}}>{t.id}</span>
              <div>
                <div style={{fontSize:12.5, fontWeight:700, color:T.text}}>{mat.name} <span style={{color:T.muted, fontWeight:500}}>· {t.qty} {t.unit}</span></div>
                <div style={{fontSize:10.5, color:T.muted}}>
                  {t.spot.vendorName} · ₹{t.spot.amount} · provisional {t.spot.allocation.split.map(s => `${s.pct}% ${M.site(s.site).short}`).join(' · ')}
                </div>
              </div>
              <span style={{
                padding:'2px 7px', borderRadius:4,
                background: overdue ? T.warnSoft : T.bg,
                color: overdue ? T.warn : T.subtle,
                fontSize:10, fontWeight:800, letterSpacing:0.3, textTransform:'uppercase',
              }}>
                {t.inventory.remaining <= 0 ? 'Consumed' : `${age}d old`}
              </span>
              <button onClick={() => dispatch({ type:'OPEN_MODAL', modal:{ kind:'finalize-allocation', threadId: t.id }})} style={{
                padding:'6px 11px', borderRadius:7, border:'none', cursor:'pointer',
                background: T.warn, color:'#fff', fontSize:11, fontWeight:700, fontFamily:T.font,
                display:'inline-flex', alignItems:'center', gap:5,
              }}>Finalize <Icon name="arrowRt" size={10} color="#fff"/></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, {
  NewEntryMenu, SpotPurchaseModal, SpotAllocationModal, AllocationsQueue,
});
