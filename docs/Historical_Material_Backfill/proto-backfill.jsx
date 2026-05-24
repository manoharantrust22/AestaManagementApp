// Historical Backfill — the post-facto bulk-ingest flow.
//
// Built for the realistic problem: 6 months of pre-app purchases need to
// land in the system without running each through the full MR→PO→
// Delivery→Settle chain. Two modes:
//
//   1) Manual entry  — single record, ~30 sec/row. Best for 1-20 items.
//   2) AI-assisted   — copy our schema as a prompt + paste it into
//      ChatGPT/Gemini along with bill photos → paste JSON back → preview
//      + confirm. Best for batches.
//
// Both create threads at stage='in-use' (or 'exhausted') with all lifecycle
// records backfilled. The `isHistorical: true` flag tints rows and
// surfaces a "Backfilled" badge so users can audit later.

// ─── Method picker — entry to the backfill flow ─────────────────────
function BackfillMethodModal({ onClose, dispatch }) {
  const open = (kind) => {
    onClose();
    setTimeout(() => dispatch({ type:'OPEN_MODAL', modal:{ kind }}), 60);
  };
  return (
    <ProtoModal title="Backfill historical record" sub="The work already happened. Skip the request → approval → PO → delivery chain — record it as a single completed transaction."
      onClose={onClose} width={580}>
      <div style={{display:'flex', flexDirection:'column', gap:10}}>
        <BackfillChoice
          icon="receipt" tone="primary" title="Manual entry"
          sub="One material at a time. Quick form with vendor, qty, amount, date, payment status, and group split."
          tag="~30 sec per record · best for 1–20 items"
          onClick={() => open('backfill-manual')}
        />
        <BackfillChoice
          icon="sparkle" tone="pink" highlighted title="AI-assisted ingest"
          sub="Copy our schema as a prompt. Upload your bill photos to ChatGPT or Gemini externally — paste the structured JSON back here. We'll preview every row before saving."
          tag="Best for batches of 20+ · uses external AI"
          onClick={() => open('backfill-ai')}
        />
      </div>
      <div style={{marginTop:14, padding:'11px 13px', background:T.bg, border:`1px solid ${T.hairline}`, borderRadius:9}}>
        <div style={{display:'flex', alignItems:'flex-start', gap:8}}>
          <Icon name="info" size={13} color={T.muted}/>
          <div style={{fontSize:11.5, color:T.muted, lineHeight:1.5}}>
            <b style={{color:T.text}}>New vendor or material?</b> Type the name as-is — we'll create it as a draft. Office reviews drafts later from Company &gt; Vendors / Materials.
          </div>
        </div>
      </div>
    </ProtoModal>
  );
}

function BackfillChoice({ icon, tone, title, sub, tag, onClick, highlighted }) {
  const tones = { primary:{bg:T.primarySoft,fg:T.primary}, pink:{bg:T.pinkSoft,fg:T.pink}, warn:{bg:T.warnSoft,fg:T.warn} };
  const t = tones[tone];
  return (
    <button onClick={onClick} style={{
      padding:'14px 16px', borderRadius:12, cursor:'pointer', fontFamily:T.font, textAlign:'left',
      background:'#fff', border:`1.5px solid ${highlighted ? t.fg : T.border}`,
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
            <span style={{padding:'2px 6px', borderRadius:4, background:t.fg, color:'#fff',
              fontSize:9, fontWeight:800, letterSpacing:0.4, textTransform:'uppercase'}}>AI</span>
          )}
        </div>
        <div style={{fontSize:11.5, color:T.muted, lineHeight:1.5, marginBottom:6}}>{sub}</div>
        <div style={{display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:4,
          background:T.bg, color:T.subtle, fontSize:10, fontWeight:700, letterSpacing:0.2}}>{tag}</div>
      </div>
      <Icon name="arrowRt" size={13} color={T.subtle}/>
    </button>
  );
}

// ─── Manual single-entry ────────────────────────────────────────────
function BackfillManualModal({ onClose, dispatch }) {
  const [vendor, setVendor]   = React.useState('');
  const [vIsNew, setVNew]     = React.useState(false);
  const [material, setMat]    = React.useState('');
  const [matText, setMatText] = React.useState('');
  const [matIsNew, setMNew]   = React.useState(false);
  const [unit, setUnit]       = React.useState('bag');
  const [qty, setQty]         = React.useState('');
  const [amount, setAmount]   = React.useState('');
  const [date, setDate]       = React.useState('');
  const [section, setSection] = React.useState('');
  const [kind, setKind]       = React.useState('own');
  const [paid, setPaid]       = React.useState('settled');
  const [paidBy, setPaidBy]   = React.useState('office');
  const [usedQty, setUsedQty] = React.useState('');
  const [notes, setNotes]     = React.useState('');
  const [split, setSplit]     = React.useState(M_GROUP.members.map(s => ({ site:s, pct: s==='srinivasan'?50:50 })));

  const mat = material ? M.material(material) : null;
  const splitSum = split.reduce((a,s) => a+s.pct, 0);
  const splitOk = kind === 'own' || splitSum === 100;
  const valid = vendor && (material || matText) && qty && amount && date && splitOk;

  const submit = () => {
    let materialId = material;
    if (!materialId && matText) {
      // Synthetic draft id
      materialId = 'draft-' + matText.toLowerCase().replace(/\s+/g, '-').slice(0,16);
      if (!M.material(materialId)) {
        M_MATERIALS.push({ id: materialId, name: matText, spec:'(draft)', unit, cat:'Other', isDraft:true });
      }
    }
    dispatch({ type:'BACKFILL_THREAD', payload: {
      vendor: vendor.toLowerCase().replace(/\s+/g,'-'),
      vendorName: vendor, vendorIsDraft: vIsNew,
      material: materialId, materialIsDraft: matIsNew,
      qty: parseFloat(qty), unit: mat ? mat.unit : unit,
      amount: parseFloat(amount), purchaseDate: date,
      section: section || 'Historical', kind,
      paymentStatus: paid, paidBy: paid === 'settled' ? paidBy : null,
      usedQty: parseFloat(usedQty) || 0,
      groupSplit: kind === 'group' ? split : undefined,
      notes,
    }});
    onClose();
  };

  return (
    <ProtoModal title="Backfill · manual entry" sub="The work already happened. We'll collapse request, PO, delivery, and settlement into one record."
      onClose={onClose} width={680}
      primary={{ label:'Save historical record', disabled: !valid, onClick: submit }}
      secondary={{ label:'Back', onClick: onClose }}>

      <div style={{
        display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
        background:T.warnSoft, borderRadius:9, marginBottom:14,
      }}>
        <Icon name="calendar" size={14} color={T.warn}/>
        <div style={{flex:1}}>
          <div style={{fontSize:12, fontWeight:700, color:T.warn}}>Backfill mode</div>
          <div style={{fontSize:10.5, color:T.muted}}>Tagged as historical · skips approvals · settlement posts as the date you record.</div>
        </div>
      </div>

      <ProtoField label="Vendor — type to search or create a draft">
        <VendorAutocomplete value={vendor} onChange={setVendor} onNewFlag={setVNew}/>
      </ProtoField>

      <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:14}}>
        <ProtoField label="Material — type to search or create a draft">
          <MaterialAutocompleteBackfill
            text={matText} onText={(v) => { setMatText(v); setMat(''); }}
            picked={material} onPick={(id, name) => { setMat(id); setMatText(name); setMNew(false); }}
            onNewFlag={setMNew}/>
        </ProtoField>
        <ProtoField label={mat ? `Quantity (${mat.unit})` : 'Quantity & unit'}>
          <div style={{display:'flex', gap:6}}>
            <div style={{flex:1}}>
              <ProtoInput value={qty} onChange={setQty} type="number" mono placeholder="0"/>
            </div>
            {!mat && (
              <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{
                padding:'9px 10px', background:'#fff', border:`1px solid ${T.border}`,
                borderRadius:8, fontSize:12, color:T.text, fontFamily:T.font, outline:'none', width:80,
              }}>
                {['bag','kg','cft','tonne','nos','piece','unit','m'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
          </div>
        </ProtoField>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <ProtoField label="Total paid (₹)">
          <ProtoInput value={amount} onChange={setAmount} type="number" mono
            leading={<span style={{fontFamily:T.mono, color:T.muted, fontSize:13}}>₹</span>}/>
        </ProtoField>
        <ProtoField label="Purchase date">
          <ProtoInput value={date} onChange={setDate} type="date"/>
        </ProtoField>
      </div>

      <ProtoField label="Section · what for?" optional>
        <ProtoInput value={section} onChange={setSection} placeholder="Foundation, plaster, slab…"/>
      </ProtoField>

      <ProtoField label="Buying for">
        <ProtoRadioCards value={kind} onChange={setKind}
          options={[
            { value:'own',   label:'This site',    icon:'home' },
            { value:'group', label:'Group cluster', icon:'link' },
          ]}/>
      </ProtoField>

      {kind === 'group' && (
        <ProtoField label="Group % split — used by each site" sub="The work is done — enter actual consumption, not estimate.">
          <div style={{background:T.bg, borderRadius:10, padding:'12px 14px', border:`1px solid ${T.hairline}`}}>
            {split.map((s, i) => {
              const site = M.site(s.site);
              const value = (parseFloat(amount) || 0) * s.pct / 100;
              return (
                <div key={i} style={{display:'flex', alignItems:'center', gap:10, marginBottom: i < split.length-1 ? 8 : 4}}>
                  <span style={{padding:'4px 9px', borderRadius:5, background:`${site.accent}1a`, color:site.accent,
                    fontSize:11, fontWeight:800, minWidth:42, textAlign:'center'}}>{site.short}</span>
                  <span style={{fontSize:12, color:T.muted, flex:1}}>{site.name}</span>
                  <input type="number" value={s.pct}
                    onChange={(e) => setSplit(sp => sp.map((x,j) => j===i ? { ...x, pct: parseFloat(e.target.value)||0 } : x))}
                    style={{width:64, padding:'5px 8px', background:'#fff', border:`1px solid ${T.border}`, borderRadius:6,
                      fontSize:12, fontFamily:T.mono, fontWeight:700, color:T.text, outline:'none', textAlign:'right'}}/>
                  <span style={{fontSize:11, color:T.muted, fontWeight:600}}>%</span>
                  <span style={{fontSize:11, fontFamily:T.mono, fontWeight:700, color:T.text, minWidth:74, textAlign:'right'}}>
                    ₹{Math.round(value).toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
            <div style={{display:'flex', justifyContent:'space-between', paddingTop:8, borderTop:`1px dashed ${T.border}`}}>
              <span style={{fontSize:11, fontWeight:700, color: splitOk ? T.success : T.danger}}>Total {splitSum}%</span>
              <span style={{fontSize:10.5, color:T.muted}}>{splitOk ? 'Inter-site debt will compute on save.' : 'Must total 100%.'}</span>
            </div>
          </div>
        </ProtoField>
      )}

      <ProtoField label="Already used? (optional)" sub="How much of this batch was consumed before today.">
        <ProtoInput value={usedQty} onChange={setUsedQty} type="number" mono
          suffix={mat ? mat.unit : unit} placeholder="0"/>
      </ProtoField>

      <ProtoField label="Payment">
        <ProtoRadioCards value={paid} onChange={setPaid}
          options={[
            { value:'settled', label:'Paid · settled', sub:'Already paid the vendor in full.' },
            { value:'pending', label:'Outstanding',     sub:'Still owe the vendor.' },
          ]}/>
      </ProtoField>

      {paid === 'settled' && (
        <ProtoField label="Paid by">
          <ProtoRadioCards value={paidBy} onChange={setPaidBy}
            options={[
              { value:'office', label:'Office' },
              { value:'wallet', label:'Wallet' },
              { value:'site',   label:'Site funds' },
            ]}/>
        </ProtoField>
      )}

      <ProtoField label="Notes" optional>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          placeholder="Quality, bill ref, anything to remember…"
          style={{width:'100%', padding:'9px 12px', background:'#fff', border:`1px solid ${T.border}`,
            borderRadius:8, fontSize:13, color:T.text, fontFamily:T.font, outline:'none',
            resize:'vertical', boxSizing:'border-box'}}/>
      </ProtoField>
    </ProtoModal>
  );
}

// Material autocomplete with "create as draft" path
function MaterialAutocompleteBackfill({ text, onText, picked, onPick, onNewFlag }) {
  const [open, setOpen] = React.useState(false);
  const matches = text ? M_MATERIALS.filter(m => m.name.toLowerCase().includes(text.toLowerCase())) : [];
  const isNew = text && !picked && !matches.some(m => m.name.toLowerCase() === text.toLowerCase());
  React.useEffect(() => { onNewFlag(isNew); }, [isNew]);
  return (
    <div style={{position:'relative'}}>
      <ProtoInput value={text} onChange={(v) => { onText(v); setOpen(true); }}
        placeholder="PPC Cement, M Sand, Aluminium sheet…"
        leading={<Icon name="search" size={11} color={T.subtle}/>}/>
      {open && text && (
        <div style={{position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:10,
          background:'#fff', border:`1px solid ${T.border}`, borderRadius:8,
          boxShadow:'0 8px 24px rgba(15,23,42,.12)', maxHeight:220, overflow:'auto'}}>
          {matches.slice(0,5).map(m => (
            <button key={m.id} onClick={() => { onPick(m.id, m.name); setOpen(false); }}
              style={{display:'flex', width:'100%', padding:'7px 10px', border:'none', background:'transparent',
                cursor:'pointer', fontFamily:T.font, alignItems:'center', textAlign:'left', flexDirection:'column', gap:1}}>
              <span style={{fontSize:12, fontWeight:600, color:T.text}}>{m.name}</span>
              <span style={{fontSize:10, color:T.muted}}>{m.spec} · {m.unit}</span>
            </button>
          ))}
          {isNew && (
            <button onClick={() => setOpen(false)} style={{
              display:'flex', width:'100%', padding:'7px 10px', border:'none', background:T.warnSoft,
              cursor:'pointer', fontFamily:T.font, alignItems:'center', gap:6, textAlign:'left',
              borderTop:`1px solid ${T.warn}33`,
            }}>
              <Icon name="plus" size={10} color={T.warn}/>
              <span style={{fontSize:11, fontWeight:700, color:T.warn}}>Create "{text}" as new material (draft)</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI-assisted bulk ingest ───────────────────────────────────────
// 3-step flow: Generate prompt → Paste JSON → Preview rows → Save.

function BackfillAIModal({ onClose, dispatch }) {
  const [step, setStep] = React.useState(1);
  const [pasted, setPasted] = React.useState('');
  const [rows, setRows] = React.useState([]);
  const [parseError, setParseError] = React.useState('');

  // Build the canonical prompt with current catalog context — so the AI
  // tries to map to existing IDs first, only marking new ones as drafts.
  const prompt = React.useMemo(() => buildBackfillPrompt(), []);

  const parseJson = () => {
    try {
      const raw = JSON.parse(pasted);
      const arr = Array.isArray(raw) ? raw : (raw.records || raw.items || raw.purchases);
      if (!Array.isArray(arr)) throw new Error('Expected an array');
      const normalized = arr.map((r, i) => normalizeBackfillRow(r, i));
      setRows(normalized);
      setParseError('');
      setStep(3);
    } catch (e) {
      setParseError(e.message + '. Make sure you pasted valid JSON, ideally just the array we asked for.');
    }
  };

  const updateRow = (idx, patch) => setRows(rs => rs.map((r,i) => i===idx ? { ...r, ...patch } : r));
  const removeRow = (idx) => setRows(rs => rs.filter((_,i) => i !== idx));

  const validRows = rows.filter(r => r._include && r.vendor && r.material && r.qty > 0 && r.amount > 0 && r.purchaseDate);
  const ingest = () => {
    dispatch({ type:'BACKFILL_BATCH', payload: validRows.map(r => ({
      vendor: r.vendor.toLowerCase().replace(/\s+/g,'-'),
      vendorName: r.vendor, vendorIsDraft: r._vendorIsDraft,
      material: r.material, materialName: r._materialName || r.material,
      materialIsDraft: r._materialIsDraft,
      qty: r.qty, unit: r.unit, amount: r.amount,
      purchaseDate: r.purchaseDate, section: r.section || 'Historical',
      kind: r.kind, payer: r.kind === 'group' ? r.payer : undefined,
      paymentStatus: r.paymentStatus, paidBy: r.paidBy,
      usedQty: r.usedQty || 0,
      groupSplit: r.kind === 'group' ? r.groupSplit : undefined,
      notes: r.notes, quality: r.quality,
    }))});
    onClose();
  };

  return (
    <ProtoModal title="AI-assisted bulk ingest"
      sub={
        step === 1 ? 'Step 1 of 3 · Copy our schema as a prompt, then upload your bills externally in ChatGPT or Gemini.' :
        step === 2 ? 'Step 2 of 3 · Paste the JSON the AI returned. We\'ll parse it row by row.' :
                     `Step 3 of 3 · Preview ${rows.length} record${rows.length !== 1 ? 's' : ''}. Adjust anything before saving.`}
      onClose={onClose} width={step === 3 ? 920 : 680}
      primary={
        step === 1 ? { label:'I\'ve got the JSON →', onClick: () => setStep(2) } :
        step === 2 ? { label:'Parse JSON', disabled: !pasted, onClick: parseJson } :
                     { label:`Ingest ${validRows.length} record${validRows.length !== 1 ? 's' : ''}`, disabled: validRows.length === 0, onClick: ingest }}
      secondary={step > 1 ? { label:'Back', onClick: () => setStep(step - 1) } : { label:'Cancel', onClick: onClose }}>

      {/* Stepper */}
      <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:18}}>
        {[1,2,3].map(n => (
          <React.Fragment key={n}>
            <span style={{
              width:22, height:22, borderRadius:'50%',
              background: step >= n ? T.primary : T.hairline,
              color: step >= n ? '#fff' : T.subtle,
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              fontSize:11, fontWeight:800, fontFamily:T.mono,
            }}>{n}</span>
            {n < 3 && <div style={{flex:1, height:2, background: step > n ? T.primary : T.hairline}}/>}
          </React.Fragment>
        ))}
      </div>

      {step === 1 && <Step1CopyPrompt prompt={prompt}/>}
      {step === 2 && <Step2PasteJson pasted={pasted} onChange={setPasted} parseError={parseError}/>}
      {step === 3 && <Step3Preview rows={rows} onUpdate={updateRow} onRemove={removeRow}/>}
    </ProtoModal>
  );
}

function Step1CopyPrompt({ prompt }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div>
      <div style={{
        padding:'12px 14px', background:T.primarySoft, borderRadius:9, marginBottom:14,
      }}>
        <div style={{fontSize:12, fontWeight:700, color:T.primary, marginBottom:6}}>How to use this</div>
        <ol style={{margin:0, paddingLeft:18, fontSize:11.5, color:T.muted, lineHeight:1.7}}>
          <li>Tap <b>Copy prompt</b> below — it includes our schema + vendor &amp; material catalog.</li>
          <li>Open ChatGPT (free tier works) or Gemini. Paste the prompt.</li>
          <li>Attach photos of your bills — one or many. The AI will read them.</li>
          <li>It'll return a JSON array. Copy it back here in step 2.</li>
        </ol>
      </div>

      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6}}>
        <label style={{fontSize:11, fontWeight:700, color:T.text, letterSpacing:0.2, textTransform:'uppercase'}}>Prompt (auto-generated)</label>
        <button onClick={copy} style={{
          display:'inline-flex', alignItems:'center', gap:6, padding:'6px 11px', borderRadius:7,
          border:'none', cursor:'pointer',
          background: copied ? T.success : T.primary, color:'#fff',
          fontSize:12, fontWeight:700, fontFamily:T.font,
        }}>
          <Icon name={copied ? 'check' : 'upload'} size={12} color="#fff" stroke={2.4}/>
          {copied ? 'Copied!' : 'Copy prompt'}
        </button>
      </div>
      <pre style={{
        margin:0, padding:'14px 16px', background:'#0f172a', color:'#e2e8f0',
        borderRadius:10, fontSize:11, fontFamily:T.mono, lineHeight:1.55,
        maxHeight: 340, overflow:'auto', whiteSpace:'pre-wrap', wordBreak:'break-word',
      }}>{prompt}</pre>
    </div>
  );
}

function Step2PasteJson({ pasted, onChange, parseError }) {
  return (
    <div>
      <div style={{
        padding:'10px 12px', background:T.warnSoft, borderRadius:9, marginBottom:12, display:'flex', alignItems:'center', gap:8,
      }}>
        <Icon name="info" size={13} color={T.warn}/>
        <span style={{fontSize:11.5, color:T.warn, fontWeight:600}}>
          Paste the entire JSON response. We'll show every row before saving — nothing's committed yet.
        </span>
      </div>
      <textarea value={pasted} onChange={(e) => onChange(e.target.value)}
        placeholder='[{"vendor": "Sathish Cement", "material": "PPC Cement", "qty": 200, "amount": 58000, ...}, ...]'
        rows={14}
        style={{
          width:'100%', padding:'12px 14px',
          background:'#fff', border:`1px solid ${parseError ? T.danger : T.border}`,
          borderRadius:9, fontSize:11.5, fontFamily:T.mono, color:T.text, outline:'none',
          resize:'vertical', boxSizing:'border-box', lineHeight:1.55,
        }}/>
      {parseError && (
        <div style={{marginTop:8, padding:'9px 12px', background:T.dangerSoft, borderRadius:8,
          color:T.danger, fontSize:11.5, fontWeight:600, display:'flex', alignItems:'flex-start', gap:8}}>
          <Icon name="x" size={12} color={T.danger}/>{parseError}
        </div>
      )}
      <div style={{marginTop:10, display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:T.bg, borderRadius:8}}>
        <Icon name="info" size={12} color={T.muted}/>
        <span style={{fontSize:11, color:T.muted}}>
          Don't have JSON yet? Go back to step 1 and copy the prompt.
        </span>
      </div>
    </div>
  );
}

function Step3Preview({ rows, onUpdate, onRemove }) {
  const included = rows.filter(r => r._include).length;
  const drafts = rows.filter(r => r._vendorIsDraft || r._materialIsDraft).length;

  return (
    <div>
      <div style={{
        display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
        background:T.primarySoft, borderRadius:9, marginBottom:12,
      }}>
        <Icon name="check" size={14} color={T.primary} stroke={2.4}/>
        <div style={{flex:1}}>
          <div style={{fontSize:12, fontWeight:700, color:T.primary}}>
            {rows.length} records parsed · {included} to ingest · {drafts > 0 ? `${drafts} need${drafts === 1 ? 's' : ''} draft approval` : 'all matched'}
          </div>
          <div style={{fontSize:10.5, color:T.muted, marginTop:1}}>Review each row. Untick to skip. Edit anything inline.</div>
        </div>
      </div>

      <div style={{
        background:'#fff', border:`1px solid ${T.border}`, borderRadius:10, overflow:'hidden',
      }}>
        <div style={{maxHeight:430, overflow:'auto'}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0,
            fontFamily:T.font, fontSize:11.5, minWidth: 820}}>
            <thead>
              <tr>
                {['','Date','Vendor','Material','Qty','Amount','Kind','Pay','Drafts'].map((h,i) => (
                  <th key={i} style={{
                    position:'sticky', top:0, background:T.bg, zIndex:1, padding:'9px 10px',
                    borderBottom:`1px solid ${T.border}`, textAlign:'left',
                    fontSize:9.5, fontWeight:700, color:T.muted, letterSpacing:0.4, textTransform:'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <PreviewRow key={i} r={r} onUpdate={(p) => onUpdate(i, p)} onRemove={() => onRemove(i)}/>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {drafts > 0 && (
        <div style={{marginTop:10, padding:'10px 12px', background:T.warnSoft, borderRadius:8,
          display:'flex', alignItems:'flex-start', gap:8}}>
          <Icon name="info" size={13} color={T.warn}/>
          <div style={{fontSize:11.5, color:T.warn, fontWeight:600, lineHeight:1.5}}>
            {drafts} record{drafts !== 1 ? 's' : ''} reference vendors or materials not in your catalog. They'll be saved as <b>drafts</b> — office reviews them later. Records still ingest now.
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewRow({ r, onUpdate, onRemove }) {
  const cell = { padding:'7px 10px', borderBottom:`1px solid ${T.hairline}`, fontSize:11.5, verticalAlign:'middle' };
  return (
    <tr style={{ opacity: r._include ? 1 : 0.5, background: r._include ? '#fff' : T.bg }}>
      <td style={{...cell, padding:'7px 6px 7px 10px', width:36}}>
        <input type="checkbox" checked={r._include} onChange={(e) => onUpdate({ _include: e.target.checked })} style={{cursor:'pointer'}}/>
      </td>
      <td style={cell}>
        <input value={r.purchaseDate} onChange={(e) => onUpdate({ purchaseDate: e.target.value })} type="date"
          style={inlineInput(95)}/>
      </td>
      <td style={cell}>
        <div style={{display:'flex', alignItems:'center', gap:5}}>
          <input value={r.vendor} onChange={(e) => onUpdate({ vendor: e.target.value })} style={inlineInput(140)}/>
          {r._vendorIsDraft && <span title="New vendor — will save as draft" style={draftTag}>+V</span>}
        </div>
      </td>
      <td style={cell}>
        <div style={{display:'flex', alignItems:'center', gap:5}}>
          <input value={r._materialName || r.material} onChange={(e) => onUpdate({ _materialName: e.target.value })} style={inlineInput(140)}/>
          {r._materialIsDraft && <span title="New material — will save as draft" style={draftTag}>+M</span>}
        </div>
      </td>
      <td style={cell}>
        <div style={{display:'flex', alignItems:'center', gap:4}}>
          <input value={r.qty} onChange={(e) => onUpdate({ qty: parseFloat(e.target.value) || 0 })} type="number"
            style={{...inlineInput(54), fontFamily:T.mono, textAlign:'right'}}/>
          <span style={{fontSize:10, color:T.subtle, fontWeight:600}}>{r.unit}</span>
        </div>
      </td>
      <td style={cell}>
        <input value={r.amount} onChange={(e) => onUpdate({ amount: parseFloat(e.target.value) || 0 })} type="number"
          style={{...inlineInput(80), fontFamily:T.mono, textAlign:'right'}}/>
      </td>
      <td style={cell}>
        <select value={r.kind} onChange={(e) => onUpdate({ kind: e.target.value })} style={inlineSelect()}>
          <option value="own">Own</option>
          <option value="group">Group</option>
        </select>
        {r.kind === 'group' && r.groupSplit && (
          <div style={{display:'flex', gap:2, marginTop:3}}>
            {r.groupSplit.map((s, j) => {
              const site = M.site(s.site);
              return <span key={j} style={{
                fontSize:9, padding:'1px 4px', borderRadius:3,
                background: `${site.accent}1a`, color: site.accent, fontWeight:700,
              }}>{site.short} {s.pct}%</span>;
            })}
          </div>
        )}
      </td>
      <td style={cell}>
        <select value={r.paymentStatus} onChange={(e) => onUpdate({ paymentStatus: e.target.value })} style={inlineSelect()}>
          <option value="settled">Paid</option>
          <option value="pending">Owed</option>
        </select>
      </td>
      <td style={cell}>
        <button onClick={onRemove} style={{
          width:24, height:24, borderRadius:6, border:`1px solid ${T.border}`, background:'#fff',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <Icon name="x" size={10} color={T.muted}/>
        </button>
      </td>
    </tr>
  );
}

const draftTag = {
  padding:'1px 5px', borderRadius:3, background:T.warnSoft, color:T.warn,
  fontSize:9, fontWeight:800, letterSpacing:0.3,
};
function inlineInput(w) {
  return {
    width: w, padding:'4px 6px', background:'#fff', border:`1px solid ${T.hairline}`,
    borderRadius:5, fontSize:11.5, color:T.text, fontFamily:T.font, outline:'none',
  };
}
function inlineSelect() {
  return {
    padding:'4px 6px', background:'#fff', border:`1px solid ${T.hairline}`,
    borderRadius:5, fontSize:11, color:T.text, fontFamily:T.font, outline:'none', appearance:'none',
  };
}

// ─── Prompt builder ────────────────────────────────────────────────
function buildBackfillPrompt() {
  const vendors = M_VENDORS.map(v => `  - ${v.name} (id: ${v.id})`).join('\n');
  const materials = M_MATERIALS.filter(m => !m.isDraft).map(m => `  - ${m.name} · ${m.spec} (id: ${m.id}, unit: ${m.unit})`).join('\n');
  const sites = M_SITES.map(s => `  - ${s.name} (id: ${s.id})`).join('\n');
  return `You are helping me bulk-import historical material purchase records into our construction site app (Aesta).

I'll attach photos of past purchase bills. Read each bill and return a JSON array of records — one object per material line item.

# Output schema

Return ONLY a JSON array. Each object MUST have these fields:

{
  "vendor": "string — vendor name as shown on bill",
  "material": "string — material name as shown on bill",
  "material_spec": "string — spec like '50kg bag · OPC 53 grade' (optional)",
  "qty": number,
  "unit": "string — bag | kg | cft | tonne | nos | piece | m | unit",
  "amount": number — total for this line in INR (just the number, no commas),
  "purchase_date": "YYYY-MM-DD",
  "section": "string — e.g. Foundation, Slab, Plaster (optional)",
  "kind": "own" | "group",
  "group_split": [{ "site": "srinivasan" | "padmavathy", "pct": number }] — only when kind is "group", must sum to 100,
  "payment_status": "settled" | "pending",
  "paid_by": "office" | "wallet" | "site" — only when payment_status is "settled",
  "used_qty": number — how much of this batch has already been consumed (0 if unknown),
  "quality": "good" | "fair" | "poor" (optional, default "good"),
  "notes": "string (optional)"
}

# Vendor catalog — match to existing IDs where possible. New vendor? Use the bill name as-is, we'll save as draft.

${vendors}

# Material catalog — match to existing IDs where possible. New material? Use bill name as-is.

${materials}

# Site IDs

${sites}

# Rules

1. One row per material line item — split bills with multiple materials into multiple rows.
2. ALWAYS use ISO date (YYYY-MM-DD). If only month is shown, use the 15th.
3. If unsure whether a purchase was "own" or "group", default to "own".
4. For group purchases without explicit split shown on the bill, omit group_split (we'll ask the user).
5. For payment status, look for "PAID" stamps, signatures, or "balance" / "due" annotations. Default to "settled" if unclear.
6. used_qty should be 0 unless the bill or my note explicitly says how much was consumed.
7. amounts: just the line total — no GST breakdowns, no truck/loading charges as separate rows.
8. RETURN ONLY THE JSON ARRAY. No markdown, no commentary, no \`\`\`json wrapper.`;
}

// ─── Row normalizer ────────────────────────────────────────────────
function normalizeBackfillRow(r, idx) {
  // Map LLM-emitted fields to our internal shape. Tolerant of casing,
  // common synonyms (date/purchase_date, qty/quantity, total/amount, etc.).
  const vendorName = r.vendor || r.vendor_name || r.shop || '';
  const matchedVendor = M_VENDORS.find(v =>
    v.name.toLowerCase() === vendorName.toLowerCase() || v.id === r.vendor_id
  );
  const materialName = r.material || r.material_name || r.item || '';
  const matchedMaterial = M_MATERIALS.find(m =>
    m.name.toLowerCase() === materialName.toLowerCase() || m.id === r.material_id
  );
  const qty = parseFloat(r.qty || r.quantity || 0);
  const amount = parseFloat(r.amount || r.total || r.line_total || 0);
  const purchaseDate = r.purchase_date || r.date || r.purchaseDate || '';
  const kind = (r.kind || 'own').toLowerCase();
  const groupSplit = r.group_split || r.groupSplit;

  return {
    _include: !!(vendorName && materialName && qty > 0 && amount > 0 && purchaseDate),
    _vendorIsDraft: !!vendorName && !matchedVendor,
    _materialIsDraft: !!materialName && !matchedMaterial,
    _materialName: materialName,
    vendor: vendorName,
    material: matchedMaterial ? matchedMaterial.id : `draft-${materialName.toLowerCase().replace(/\s+/g, '-').slice(0,16)}`,
    qty, unit: r.unit || (matchedMaterial ? matchedMaterial.unit : 'unit'),
    amount, purchaseDate,
    section: r.section || 'Historical',
    kind: kind === 'group' ? 'group' : 'own',
    groupSplit: kind === 'group' && Array.isArray(groupSplit)
      ? groupSplit.map(s => ({ site: s.site, pct: parseFloat(s.pct) || 0 }))
      : (kind === 'group' ? [{site:'srinivasan',pct:50},{site:'padmavathy',pct:50}] : undefined),
    paymentStatus: r.payment_status || r.paymentStatus || 'settled',
    paidBy: r.paid_by || r.paidBy || 'office',
    usedQty: parseFloat(r.used_qty || r.usedQty || 0),
    quality: r.quality || 'good',
    notes: r.notes || '',
  };
}

Object.assign(window, {
  BackfillMethodModal, BackfillManualModal, BackfillAIModal,
  MaterialAutocompleteBackfill, buildBackfillPrompt, normalizeBackfillRow,
});
