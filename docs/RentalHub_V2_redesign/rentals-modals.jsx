// Rental modals — every state transition routes through one of these.
// Reuses the ProtoModal / ProtoField / ProtoInput / ProtoSelect / ProtoRadioCards
// primitives from proto-modals.jsx (loaded globally), so look-and-feel matches
// the materials prototype 1:1.

function CreateRentalModal({ onClose, dispatch }) {
  // Historical mode = the work already happened; we're backfilling. In
  // production this is a separate "Historical Record" CTA — folded into
  // one form here with a toggle so the IA stays clean.
  const [historical, setHistorical] = React.useState(false);
  const [histStatus, setHistStatus] = React.useState('completed');

  const [vendor, setVendor]   = React.useState('');
  const [section, setSection] = React.useState('');
  const [start, setStart]     = React.useState('');
  const [actualEnd, setActualEnd] = React.useState('');
  const [end, setEnd]         = React.useState('');
  const [excludeStart, setExcludeStart] = React.useState(false);
  const [lines, setLines]     = React.useState([
    { id:1, item:'', variant:'', qty:'', rateType:'daily', rate:'' },
  ]);

  // Transport (full bookkeeping, not just "who handles it")
  const [transportInBy, setTIB]   = React.useState('vendor');
  const [transportCost, setTCost] = React.useState('');
  const [loadingCost, setLCost]   = React.useState('');
  const [unloadingCost, setUCost] = React.useState('');

  const [discount, setDiscount]   = React.useState('');
  const [notes, setNotes]         = React.useState('');

  const addLine = () => setLines(l => [...l, {
    id: Math.max(...l.map(x => x.id)) + 1, item:'', variant:'', qty:'', rateType:'daily', rate:'',
  }]);
  const removeLine = (id) => setLines(l => l.filter(x => x.id !== id));
  const updateLine = (id, patch) => setLines(l => l.map(x => x.id === id ? { ...x, ...patch } : x));
  const setLineItem = (id, itemId) => {
    const it = R.item(itemId);
    if (!it) return;
    const variant = (it.variants || [])[0]?.id || '';
    const rate = variant ? it.variants[0].rate : it.defaultRate;
    updateLine(id, { item: itemId, variant, rateType: it.rateType, rate });
  };

  // For historical, days come from actualEnd − start; for forward orders,
  // estimate from start → end.
  const endRef = historical ? actualEnd : end;
  const startBillable = excludeStart && start ? new Date(new Date(start).getTime() + 24*60*60*1000) : (start ? new Date(start) : null);
  const days = startBillable && endRef ? Math.max(1, Math.ceil((new Date(endRef) - startBillable)/(24*60*60*1000)) + 1) : 0;
  const lineSubtotal = lines.reduce((a, ln) => {
    const r = parseFloat(ln.rate) || 0;
    const q = parseFloat(ln.qty) || 0;
    return a + (ln.rateType === 'daily' ? r * q * days : r * q * 8 * days);
  }, 0);
  const transportTotal = (parseFloat(transportCost)||0) + (parseFloat(loadingCost)||0) + (parseFloat(unloadingCost)||0);
  const discountAmt = lineSubtotal * (parseFloat(discount)||0) / 100;
  const grossTotal = Math.max(0, lineSubtotal + transportTotal - discountAmt);

  const linesOk = lines.every(ln => ln.item && ln.qty && parseFloat(ln.qty) > 0 && ln.rate);
  const valid = vendor && start && (historical ? actualEnd : true) && linesOk;

  return (
    <ProtoModal title={historical ? 'Record historical rental' : 'New rental order'}
      sub={historical
        ? 'Backfill an order that already happened — work was done, items were on site, you\'re recording it now.'
        : 'Send a PO to a rental vendor. Cost meter starts on delivery verification.'}
      onClose={onClose} width={720}
      primary={{ label: grossTotal > 0 ? `${historical ? 'Record' : 'Submit'} · ₹${Math.round(grossTotal).toLocaleString('en-IN')}` : (historical ? 'Record' : 'Submit'), disabled: !valid, onClick: () => {
        dispatch({ type:'CREATE_ORDER', payload: {
          vendor, section: section || 'On-site',
          expectedStart: start, expectedEnd: end || actualEnd,
          ...(historical ? {
            isHistorical: true,
            actualStart: start,
            actualEnd: actualEnd,
            status: histStatus,
            // For historical, mark items as fully returned if completed/settled
            ...((histStatus === 'completed' || histStatus === 'settled') ? {} : {}),
          } : {}),
          excludeStartDate: excludeStart,
          transportIn: { by: transportInBy, cost: parseFloat(transportCost) || 0 },
          loadingCost: parseFloat(loadingCost) || 0,
          unloadingCost: parseFloat(unloadingCost) || 0,
          discountPct: parseFloat(discount) || 0,
          notes,
          items: lines.map(ln => {
            const it = R.item(ln.item);
            const qty = parseFloat(ln.qty);
            const base = {
              item: ln.item, variant: ln.variant || null,
              qty,
              rateType: ln.rateType,
              qtyReturned: (historical && (histStatus === 'completed' || histStatus === 'settled')) ? qty : 0,
            };
            if (ln.rateType === 'hourly') base.hourlyRate = parseFloat(ln.rate);
            else base.dailyRate = parseFloat(ln.rate);
            if (ln.variant) base.sizeLabelSnapshot = `${it.name} · ${R.variantLabel(ln.item, ln.variant)}`;
            return base;
          }),
        }});
        onClose();
      }}}
      secondary={{ label:'Cancel', onClick: onClose }}>

      {/* HISTORICAL MODE TOGGLE — sits at top so it's the first decision */}
      <label style={{
        display:'flex', alignItems:'center', gap:10, padding:'11px 14px',
        background: historical ? T.warnSoft : T.bg,
        border: `1.5px solid ${historical ? T.warn : T.hairline}`,
        borderRadius:10, cursor:'pointer', marginBottom:14,
      }}>
        <input type="checkbox" checked={historical} onChange={(e) => setHistorical(e.target.checked)} style={{cursor:'pointer'}}/>
        <Icon name="calendar" size={14} color={historical ? T.warn : T.subtle}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:12.5, fontWeight:700, color: historical ? T.warn : T.text}}>
            Already happened? Record as historical
          </div>
          <div style={{fontSize:10.5, color:T.muted, marginTop:1}}>
            Work was done on site before opening the app. You're backfilling now.
          </div>
        </div>
        {historical && (
          <span style={{
            padding:'2px 8px', borderRadius:5, background:T.warn, color:'#fff',
            fontSize:9.5, fontWeight:800, letterSpacing:0.4, textTransform:'uppercase',
          }}>BACKFILL</span>
        )}
      </label>

      {historical && (
        <ProtoField label="Status when recorded">
          <ProtoRadioCards value={histStatus} onChange={setHistStatus}
            options={[
              { value:'active',    label:'Still on site',  sub:'Started, not yet returned' },
              { value:'completed', label:'All returned',   sub:'Items back, vendor not settled yet' },
              { value:'settled',   label:'Fully settled',  sub:'Returned and paid in full' },
            ]}/>
        </ProtoField>
      )}

      <ProtoField label="Vendor">
        <ProtoSelect value={vendor} onChange={setVendor} placeholder="Pick a rental vendor…"
          options={R_VENDORS.map(v => ({ value: v.id, label: `${v.name}  ·  ${v.kind} · ★ ${v.rating}` }))}/>
      </ProtoField>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14}}>
        <ProtoField label="Section">
          <ProtoInput value={section} onChange={setSection} placeholder="Slab, plaster…"/>
        </ProtoField>
        <ProtoField label={historical ? 'Actual pickup' : 'Pickup date'}>
          <ProtoInput value={start} onChange={setStart} type="date"/>
        </ProtoField>
        {historical ? (
          <ProtoField label="Actual return">
            <ProtoInput value={actualEnd} onChange={setActualEnd} type="date"/>
          </ProtoField>
        ) : (
          <ProtoField label="Expected return" sub="Leave empty if unknown — extend later.">
            <ProtoInput value={end} onChange={setEnd} type="date"/>
          </ProtoField>
        )}
      </div>

      {/* Exclude start date from billing — Indian rental convention */}
      <label style={{
        display:'flex', alignItems:'center', gap:8, padding:'9px 12px',
        background:T.bg, border:`1px solid ${T.hairline}`, borderRadius:8, cursor:'pointer', marginBottom:14,
        marginTop:-4,
      }}>
        <input type="checkbox" checked={excludeStart} onChange={(e) => setExcludeStart(e.target.checked)} style={{cursor:'pointer'}}/>
        <span style={{fontSize:12, fontWeight:600, color:T.text}}>Exclude start date from billing</span>
        <span style={{fontSize:11, color:T.subtle}}>e.g. centring materials — pickup day not counted</span>
      </label>

      <ProtoField label="Items · what are you renting?">
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {lines.map(ln => (
            <RentalLineRow key={ln.id} line={ln}
              onItem={(id) => setLineItem(ln.id, id)}
              onChange={(patch) => updateLine(ln.id, patch)}
              onRemove={lines.length > 1 ? () => removeLine(ln.id) : null}
            />
          ))}
          <button onClick={addLine} style={{
            display:'inline-flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:8,
            border:`1px dashed ${T.border}`, background:'transparent', color:T.muted,
            fontSize:12, fontWeight:600, fontFamily:T.font, cursor:'pointer', alignSelf:'flex-start',
          }}>
            <Icon name="plus" size={11} color={T.muted}/> Add another item
          </button>
        </div>
      </ProtoField>

      {/* Transport bookkeeping — separate from "who handles it" */}
      <ProtoField label="Transport · who handles it">
        <ProtoRadioCards value={transportInBy} onChange={setTIB}
          options={[
            { value:'vendor',  label:'Vendor',  sub:'Bundled in vendor bill.' },
            { value:'company', label:'Company', sub:'Office books a truck.' },
            { value:'laborer', label:'On-site', sub:'Engineer arranges via wallet.' },
          ]}/>
      </ProtoField>

      {transportInBy !== 'vendor' && (
        <div style={{
          padding:'12px 14px', background:T.bg, borderRadius:10, border:`1px solid ${T.hairline}`,
          marginBottom:14,
        }}>
          <div style={{fontSize:10.5, fontWeight:700, color:T.subtle, letterSpacing:0.4, textTransform:'uppercase', marginBottom:8}}>
            Transport (outward) costs
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10}}>
            <ProtoMiniField label="Transport">
              <ProtoInput value={transportCost} onChange={setTCost} type="number" mono
                leading={<span style={{fontSize:12, color:T.muted, fontFamily:T.mono}}>₹</span>}/>
            </ProtoMiniField>
            <ProtoMiniField label="Loading">
              <ProtoInput value={loadingCost} onChange={setLCost} type="number" mono
                leading={<span style={{fontSize:12, color:T.muted, fontFamily:T.mono}}>₹</span>}/>
            </ProtoMiniField>
            <ProtoMiniField label="Unloading">
              <ProtoInput value={unloadingCost} onChange={setUCost} type="number" mono
                leading={<span style={{fontSize:12, color:T.muted, fontFamily:T.mono}}>₹</span>}/>
            </ProtoMiniField>
          </div>
        </div>
      )}

      <div style={{display:'grid', gridTemplateColumns:'120px 1fr', gap:14}}>
        <ProtoField label="Discount %" optional>
          <ProtoInput value={discount} onChange={setDiscount} type="number" mono suffix="%"/>
        </ProtoField>
        <ProtoField label="Notes" optional>
          <ProtoInput value={notes} onChange={setNotes} placeholder="Quote, agreement, anything to remember…"/>
        </ProtoField>
      </div>

      {grossTotal > 0 && (
        <div style={{
          padding:'12px 14px', background: historical ? T.warnSoft : T.bg, borderRadius:10,
          border: historical ? `1px solid ${T.warn}33` : 'none',
        }}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4}}>
            <div>
              <div style={{fontSize:11, color:T.muted, fontWeight:600}}>
                {historical ? 'Recorded total · ' : 'Estimated total · '}{days} day{days !== 1 ? 's' : ''}{excludeStart && ' (excl. start)'}
              </div>
              <div style={{fontSize:10.5, color:T.subtle, fontWeight:500, marginTop:1}}>
                {historical ? 'Actual amount based on dates entered' : 'Actual cost accrues per day on site'}
              </div>
            </div>
            <div style={{fontSize:20, fontWeight:800, fontFamily:T.mono, color:T.text}}>
              ₹{Math.round(grossTotal).toLocaleString('en-IN')}
            </div>
          </div>
          {(transportTotal > 0 || discountAmt > 0) && (
            <div style={{
              display:'flex', justifyContent:'space-between', paddingTop:6,
              borderTop:`1px dashed ${T.border}`, fontSize:11, color:T.muted, fontFamily:T.mono,
            }}>
              <span>Items ₹{Math.round(lineSubtotal).toLocaleString('en-IN')}{transportTotal > 0 ? ` · transport ₹${transportTotal}` : ''}{discountAmt > 0 ? ` · −${discount}% discount ₹${Math.round(discountAmt)}` : ''}</span>
            </div>
          )}
        </div>
      )}
    </ProtoModal>
  );
}

function ProtoMiniField({ label, children }) {
  return (
    <div>
      <label style={{fontSize:10, color:T.subtle, fontWeight:700, letterSpacing:0.3, textTransform:'uppercase'}}>{label}</label>
      <div style={{marginTop:3}}>{children}</div>
    </div>
  );
}

function RentalLineRow({ line, onItem, onChange, onRemove }) {
  const it = R.item(line.item);
  return (
    <div style={{
      background:'#fff', border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 12px',
      display:'flex', flexDirection:'column', gap:8,
    }}>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <div style={{flex:1, minWidth:0}}>
          <ProtoSelect value={line.item} onChange={onItem} placeholder="Pick equipment…"
            options={R_ITEMS.map(i => ({
              value: i.id, label: `${i.name}  ·  ${i.cat} · ${i.rateType}`,
            }))}/>
        </div>
        {it && it.variants && (
          <div style={{width:130, flex:'0 0 130px'}}>
            <ProtoSelect value={line.variant} onChange={(v) => {
              const r = it.variants.find(x => x.id === v)?.rate;
              onChange({ variant: v, rate: r });
            }}
              options={it.variants.map(v => ({ value: v.id, label: v.label }))}/>
          </div>
        )}
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
            <ProtoInput value={line.qty} onChange={(v) => onChange({ qty: v })} type="number" mono
              suffix={it ? it.unit : 'unit'}/>
          </div>
        </div>
        <div>
          <label style={{fontSize:10, color:T.subtle, fontWeight:700, letterSpacing:0.3, textTransform:'uppercase'}}>
            Rate ({line.rateType})
          </label>
          <div style={{marginTop:3}}>
            <ProtoInput value={line.rate} onChange={(v) => onChange({ rate: v })} type="number" mono
              leading={<span style={{fontSize:12, color:T.muted, fontFamily:T.mono}}>₹</span>}
              suffix={`per ${line.rateType === 'hourly' ? 'hr' : 'day'}`}/>
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <label style={{fontSize:10, color:T.subtle, fontWeight:700, letterSpacing:0.3, textTransform:'uppercase'}}>Type</label>
          <div style={{
            marginTop:3, padding:'8px 10px',
            background: line.rateType === 'hourly' ? T.warnSoft : T.primarySoft,
            color: line.rateType === 'hourly' ? T.warn : T.primary,
            borderRadius:7, fontSize:11, fontWeight:800, letterSpacing:0.3, textTransform:'uppercase',
          }}>
            {line.rateType}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Approve / Reject ───────────────────────────────────────────────
function ApproveRentalModal({ order, onClose, dispatch }) {
  const v = R.vendor(order.vendor);
  return (
    <ProtoModal title={`Approve ${order.id}?`} sub="Once approved this becomes a confirmed PO with the vendor."
      onClose={onClose} width={520}
      primary={{ label:'Approve · Confirm PO', onClick: () => { dispatch({ type:'APPROVE_ORDER', id: order.id }); onClose(); }}}
      secondary={{ label:'Cancel', onClick: onClose }}
      danger={{ label:'Reject', onClick: () => { dispatch({ type:'REJECT_ORDER', id: order.id, reason:'Rejected by admin' }); onClose(); }}}>
      <div style={{display:'flex', flexDirection:'column', gap:8, padding:14, background:T.bg, borderRadius:10}}>
        <Row k="Vendor"   v={`${v.name}${v.phone ? ' · ' + v.phone : ''}`}/>
        <Row k="Section"  v={order.section}/>
        <Row k="Items"    v={
          <div style={{display:'flex', flexDirection:'column', gap:3}}>
            {order.items.map((ln, i) => {
              const it = R.item(ln.item);
              return (
                <div key={i} style={{display:'flex', gap:6, alignItems:'baseline'}}>
                  <span style={{fontFamily:T.mono, fontWeight:700, fontSize:12}}>{ln.qty} {it.unit}</span>
                  <span style={{fontSize:12}}>{it.name}{ln.variant ? ` · ${R.variantLabel(ln.item, ln.variant)}` : ''}</span>
                  <span style={{fontSize:10.5, color:T.subtle, fontFamily:T.mono}}>
                    @ ₹{(ln.dailyRate ?? ln.hourlyRate)}/{ln.rateType === 'hourly' ? 'hr' : 'day'}
                  </span>
                </div>
              );
            })}
          </div>
        }/>
        <Row k="Window"   v={`${fmtDateLong(order.expectedStart)} → ${fmtDateLong(order.expectedEnd)}`}/>
        {order.notes && <Row k="Note" v={<span style={{fontStyle:'italic'}}>"{order.notes}"</span>}/>}
      </div>
    </ProtoModal>
  );
}

// ─── Verify delivery (Confirmed → Active) ─────────────────────────────
function VerifyDeliveryModal({ order, onClose, dispatch }) {
  return (
    <ProtoModal title="Verify delivery" sub={`${order.id} · ${R.vendor(order.vendor).name}`}
      onClose={onClose} width={460}
      primary={{ label:'Mark active · start cost meter', onClick: () => { dispatch({ type:'VERIFY_DELIVERY', id: order.id }); onClose(); }}}
      secondary={{ label:'Cancel', onClick: onClose }}>
      <div style={{padding:14, background:T.warnSoft, borderRadius:10, display:'flex', alignItems:'center', gap:10, marginBottom:14}}>
        <Icon name="info" size={14} color={T.warn}/>
        <div style={{fontSize:12, color:T.warn, fontWeight:600, lineHeight:1.5}}>
          Cost meter starts ticking from today. Make sure the equipment is on site and counted before confirming.
        </div>
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:8, padding:14, background:T.bg, borderRadius:10}}>
        {order.items.map((ln, i) => {
          const it = R.item(ln.item);
          return (
            <Row key={i} k={`${it.name}${ln.variant ? ' · ' + R.variantLabel(ln.item, ln.variant) : ''}`}
              v={<span style={{fontFamily:T.mono}}>{ln.qty} {it.unit}</span>}/>
          );
        })}
      </div>
    </ProtoModal>
  );
}

// ─── Record return ──────────────────────────────────────────────────
function RecordReturnModal({ order, onClose, dispatch }) {
  const outstandingLines = order.items.filter(ln => (ln.qty - (ln.qtyReturned || 0)) > 0);
  const [picks, setPicks] = React.useState(() => outstandingLines.map(ln => ({
    item: ln.item, variant: ln.variant, max: ln.qty - (ln.qtyReturned || 0),
    qty: ln.qty - (ln.qtyReturned || 0), condition: 'good',
  })));

  const set = (i, patch) => setPicks(p => p.map((x, j) => j === i ? { ...x, ...patch } : x));
  const totalReturning = picks.reduce((a,p) => a + (parseFloat(p.qty) || 0), 0);
  const valid = totalReturning > 0;

  return (
    <ProtoModal title="Record return" sub={`${order.id} · ${R.vendor(order.vendor).name}`}
      onClose={onClose} width={580}
      primary={{ label: `Record return · ${totalReturning} pieces`, disabled: !valid, onClick: () => {
        dispatch({ type:'RECORD_RETURN', id: order.id, payload: {
          items: picks.filter(p => parseFloat(p.qty) > 0).map(p => ({
            item: p.item, variant: p.variant, qty: parseFloat(p.qty), condition: p.condition,
          })),
        }});
        onClose();
      }}}
      secondary={{ label:'Cancel', onClick: onClose }}>
      <div style={{display:'flex', flexDirection:'column', gap:10}}>
        {picks.map((p, i) => {
          const it = R.item(p.item);
          return (
            <div key={i} style={{
              background:'#fff', border:`1px solid ${T.border}`, borderRadius:10, padding:'12px 14px',
            }}>
              <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:8}}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:700, color:T.text}}>
                    {it.name}{p.variant ? ` · ${R.variantLabel(p.item, p.variant)}` : ''}
                  </div>
                  <div style={{fontSize:11, color:T.muted}}>{p.max} {it.unit} still on site</div>
                </div>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'140px 1fr', gap:10, alignItems:'flex-end'}}>
                <div>
                  <label style={{fontSize:10, color:T.subtle, fontWeight:700, letterSpacing:0.3, textTransform:'uppercase'}}>Returning</label>
                  <div style={{marginTop:3}}>
                    <ProtoInput value={p.qty} onChange={(v) => set(i, { qty: Math.min(p.max, Math.max(0, parseFloat(v) || 0)) })} type="number" mono suffix={it.unit}/>
                  </div>
                </div>
                <div>
                  <label style={{fontSize:10, color:T.subtle, fontWeight:700, letterSpacing:0.3, textTransform:'uppercase'}}>Condition</label>
                  <div style={{marginTop:3}}>
                    <ProtoRadioCards value={p.condition} onChange={(v) => set(i, { condition: v })}
                      options={[
                        { value:'good',     label:'Good' },
                        { value:'damaged',  label:'Damaged' },
                        { value:'lost',     label:'Lost' },
                      ]}/>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ProtoModal>
  );
}

// ─── Advance ────────────────────────────────────────────────────────
function AddAdvanceModal({ order, onClose, dispatch }) {
  const [amount, setAmount] = React.useState('');
  const [mode, setMode] = React.useState('upi');
  const [payer, setPayer] = React.useState('office');
  const [note, setNote] = React.useState('');
  const valid = amount && parseFloat(amount) > 0;
  return (
    <ProtoModal title="Add advance" sub={`${order.id} · ${R.vendor(order.vendor).name}`}
      onClose={onClose} width={480}
      primary={{ label:`Record · ₹${parseFloat(amount || 0).toLocaleString('en-IN')}`, disabled: !valid, onClick: () => {
        dispatch({ type:'ADD_ADVANCE', id: order.id, payload: {
          date: new Date().toISOString().slice(0,10), amount: parseFloat(amount), mode, payer, note,
        }});
        onClose();
      }}}
      secondary={{ label:'Cancel', onClick: onClose }}>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <ProtoField label="Amount">
          <ProtoInput value={amount} onChange={setAmount} type="number" mono
            leading={<span style={{fontSize:12, color:T.muted, fontFamily:T.mono}}>₹</span>}/>
        </ProtoField>
        <ProtoField label="Mode">
          <ProtoSelect value={mode} onChange={setMode}
            options={[{value:'cash',label:'Cash'},{value:'upi',label:'UPI'},{value:'bank',label:'Bank transfer'}]}/>
        </ProtoField>
      </div>
      <ProtoField label="Payer source">
        <ProtoRadioCards value={payer} onChange={setPayer}
          options={[
            { value:'office',       label:'Office',  sub:'Company funds' },
            { value:'site',         label:'Site',    sub:'Site petty cash' },
            { value:'wallet:ajith', label:'Wallet',  sub:'Ajith\'s wallet' },
          ]}/>
      </ProtoField>
      <ProtoField label="Note" optional>
        <ProtoInput value={note} onChange={setNote} placeholder="Mobilization advance, pickup, …"/>
      </ProtoField>
    </ProtoModal>
  );
}

// ─── Multi-party settlement ──────────────────────────────────────────
function SettleRentalModal({ order, onClose, dispatch }) {
  const v = R.vendor(order.vendor);
  const s = order.settlements || {};

  // VENDOR
  const accrued = R.accruedCost(order);
  const advance = R.totalAdvances(order);
  const [gross, setGross] = React.useState(s.vendor?.gross ?? Math.round(accrued));
  const [negotiated, setNeg] = React.useState(s.vendor?.negotiated ?? Math.round(accrued - advance));
  const [mode, setMode] = React.useState('upi');
  const [payer, setPayer] = React.useState('office');
  const savings = Math.max(0, gross - negotiated - advance);

  const hasInbound  = s.transportIn?.status  === 'pending';
  const hasOutbound = s.transportOut?.status === 'pending';

  return (
    <ProtoModal title="Settle rental" sub={`${order.id} · ${v.name}`}
      onClose={onClose} width={620}
      primary={{ label:`Settle vendor · ₹${negotiated.toLocaleString('en-IN')}`, onClick: () => {
        dispatch({ type:'SETTLE_VENDOR', id: order.id, payload: { gross, advance, negotiated, mode, payer }});
        onClose();
      }}}
      secondary={{ label:'Cancel', onClick: onClose }}>

      {/* Vendor party */}
      <PartyHeader name="Vendor" sub={v.name} accent={T.primary}/>
      <div style={{
        background:'#fff', border:`1px solid ${T.border}`, borderRadius:10, padding:14, marginBottom:12,
      }}>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10}}>
          <SettleStat label="Accrued cost"   value={`₹${Math.round(accrued).toLocaleString('en-IN')}`}/>
          <SettleStat label="Advances paid"  value={`₹${advance.toLocaleString('en-IN')}`}/>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10}}>
          <ProtoField label="Gross bill">
            <ProtoInput value={gross} onChange={(v) => setGross(parseFloat(v)||0)} type="number" mono
              leading={<span style={{fontSize:12, color:T.muted, fontFamily:T.mono}}>₹</span>}/>
          </ProtoField>
          <ProtoField label="Negotiated final" sub="What you'll actually pay.">
            <ProtoInput value={negotiated} onChange={(v) => setNeg(parseFloat(v)||0)} type="number" mono
              leading={<span style={{fontSize:12, color:T.muted, fontFamily:T.mono}}>₹</span>}/>
          </ProtoField>
        </div>

        {savings > 0 && (
          <div style={{
            padding:'10px 12px', background:T.successSoft, borderRadius:7,
            display:'flex', alignItems:'center', gap:8, marginBottom:10,
          }}>
            <Icon name="trend" size={13} color={T.success}/>
            <span style={{fontSize:12, color:T.success, fontWeight:700}}>
              You bargained down ₹{savings.toLocaleString('en-IN')} from accrued.
            </span>
          </div>
        )}

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
          <ProtoField label="Payment mode">
            <ProtoSelect value={mode} onChange={setMode}
              options={[{value:'cash',label:'Cash'},{value:'upi',label:'UPI'},{value:'bank',label:'Bank'}]}/>
          </ProtoField>
          <ProtoField label="Payer source">
            <ProtoSelect value={payer} onChange={setPayer}
              options={[
                {value:'office', label:'Office'},
                {value:'site',   label:'Site'},
                {value:'wallet:ajith', label:'Wallet · Ajith'},
              ]}/>
          </ProtoField>
        </div>
      </div>

      {/* Transport parties (still pending) */}
      {(hasInbound || hasOutbound) && (
        <>
          <PartyHeader name="Transport" sub="Still pending — settle separately after vendor" accent={T.warn}/>
          <div style={{
            background:T.warnSoft, border:`1px solid ${T.warn}33`, borderRadius:10, padding:14, marginBottom:12,
            display:'flex', flexDirection:'column', gap:8,
          }}>
            {hasInbound && <TransportRow which="in"  amount={s.transportIn.amount}  order={order} dispatch={dispatch}/>}
            {hasOutbound && <TransportRow which="out" amount={s.transportOut.amount} order={order} dispatch={dispatch}/>}
          </div>
        </>
      )}
    </ProtoModal>
  );
}

function TransportRow({ which, amount, order, dispatch }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10,
      padding:'10px 12px', background:'#fff', borderRadius:8,
    }}>
      <Icon name="download" size={13} color={T.warn}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:12, fontWeight:700}}>Transport {which === 'in' ? 'inbound' : 'outbound'}</div>
        <div style={{fontSize:10.5, color:T.muted}}>{which === 'in' ? 'Vendor delivery' : 'Vendor pickup'} · ₹{amount}</div>
      </div>
      <button onClick={() => dispatch({ type:'SETTLE_TRANSPORT', id: order.id, payload: { which, amount, mode:'cash', payer:'site' }})} style={{
        padding:'6px 10px', borderRadius:6, border:'none', cursor:'pointer',
        background:T.warn, color:'#fff', fontSize:11, fontWeight:700, fontFamily:T.font,
      }}>Settle ₹{amount}</button>
    </div>
  );
}

function PartyHeader({ name, sub, accent }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
      <span style={{
        padding:'2px 8px', borderRadius:5, background: `${accent}1a`, color: accent,
        fontSize:10, fontWeight:800, letterSpacing:0.4, textTransform:'uppercase',
      }}>{name}</span>
      <span style={{fontSize:11.5, color:T.muted}}>{sub}</span>
    </div>
  );
}

function SettleStat({ label, value }) {
  return (
    <div style={{padding:'8px 10px', background:T.bg, borderRadius:7}}>
      <div style={{fontSize:10, color:T.muted, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase'}}>{label}</div>
      <div style={{fontSize:14, fontFamily:T.mono, fontWeight:800, color:T.text, marginTop:2}}>{value}</div>
    </div>
  );
}

// ─── Extend date ────────────────────────────────────────────────────
function ExtendDateModal({ order, onClose, dispatch }) {
  const [newDate, setNewDate] = React.useState(order.expectedEnd);
  return (
    <ProtoModal title="Extend return date" sub={`${order.id} · current expected return ${fmtDateLong(order.expectedEnd)}`}
      onClose={onClose} width={420}
      primary={{ label:'Extend', disabled: !newDate, onClick: () => { dispatch({ type:'EXTEND_DATE', id: order.id, newDate }); onClose(); }}}
      secondary={{ label:'Cancel', onClick: onClose }}>
      <ProtoField label="New expected return">
        <ProtoInput value={newDate} onChange={setNewDate} type="date"/>
      </ProtoField>
      <div style={{padding:'10px 12px', background:T.primarySoft, borderRadius:8, display:'flex', alignItems:'center', gap:8, fontSize:11.5, color:T.primary, fontWeight:600}}>
        <Icon name="info" size={13} color={T.primary}/>
        Cost meter keeps ticking. Cleared overdue alert if the new date is in the future.
      </div>
    </ProtoModal>
  );
}

Object.assign(window, {
  CreateRentalModal, ApproveRentalModal, VerifyDeliveryModal,
  RecordReturnModal, AddAdvanceModal, SettleRentalModal, ExtendDateModal,
});
