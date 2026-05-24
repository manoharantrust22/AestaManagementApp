// Hub · Table view — switchable from Cards. Designed for scale: sticky
// header with sort, optional filter row per column, type-to-search per
// text column, multi-select filter per categorical column. Date-desc
// default. Rows are dense but tappable; stage shows as a compact pill.

const TABLE_COLS = [
  { key:'reqDate', label:'Request #',   sortable:true, kind:'text',   width: 140 },
  { key:'stage',   label:'Stage',       sortable:true, kind:'pill',   width: 130 },
  { key:'material',label:'Material',    sortable:true, kind:'text',   width: 220 },
  { key:'qty',     label:'Qty',         sortable:true, kind:'num',    width: 90,  align:'right' },
  { key:'section', label:'Section',     sortable:false,kind:'text',   width: 140 },
  { key:'type',    label:'Type',        sortable:true, kind:'pill',   width: 110 },
  { key:'vendor',  label:'Vendor',      sortable:false,kind:'text',   width: 150 },
  { key:'amount',  label:'Amount',      sortable:true, kind:'num',    width: 110, align:'right' },
  { key:'needBy',  label:'Need by',     sortable:true, kind:'date',   width: 110 },
  { key:'action',  label:'',            sortable:false,kind:'action', width: 140 },
];

function ProtoHubTable({ threads, dispatch, state }) {
  // Sort state — default date-desc
  const [sortKey, setSortKey] = React.useState('reqDate');
  const [sortDir, setSortDir] = React.useState('desc');

  // Per-column filter state
  const [showFilters, setShowFilters] = React.useState(true);
  const [filters, setFilters] = React.useState({
    reqDate: '', material: '', section: '', vendor: '',
    stage: new Set(),
    type: new Set(),       // 'own', 'group', 'advance'
    qtyMin: '', qtyMax: '',
    amountMin: '', amountMax: '',
  });
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const clearFilters = () => setFilters({
    reqDate:'', material:'', section:'', vendor:'',
    stage: new Set(), type: new Set(),
    qtyMin:'', qtyMax:'', amountMin:'', amountMax:'',
  });
  const filterCount = (filters.reqDate ? 1 : 0)
    + (filters.material ? 1 : 0)
    + (filters.section ? 1 : 0)
    + (filters.vendor ? 1 : 0)
    + (filters.stage.size)
    + (filters.type.size)
    + (filters.qtyMin || filters.qtyMax ? 1 : 0)
    + (filters.amountMin || filters.amountMax ? 1 : 0);

  // Apply filters then sort
  const visible = React.useMemo(() => {
    let rows = threads.filter(t => {
      const mat = M.material(t.material);
      const isSpot = t.purchaseType === 'spot';
      const vendor = isSpot ? { name: t.spot.vendorName } : (t.po && M.vendor(t.po.vendor));
      const amount = isSpot ? t.spot.amount : t.po?.amount;
      if (filters.reqDate  && !t.id.toLowerCase().includes(filters.reqDate.toLowerCase())) return false;
      if (filters.material && !mat.name.toLowerCase().includes(filters.material.toLowerCase())) return false;
      if (filters.section  && !(t.section || '').toLowerCase().includes(filters.section.toLowerCase())) return false;
      if (filters.vendor   && (!vendor || !vendor.name.toLowerCase().includes(filters.vendor.toLowerCase()))) return false;
      if (filters.stage.size && !filters.stage.has(t.stage)) return false;
      if (filters.type.size) {
        const has = (filters.type.has(t.kind))
          || (filters.type.has('advance') && t.advance)
          || (filters.type.has('spot') && isSpot);
        if (!has) return false;
      }
      if (filters.qtyMin && t.qty < parseFloat(filters.qtyMin)) return false;
      if (filters.qtyMax && t.qty > parseFloat(filters.qtyMax)) return false;
      if (filters.amountMin && (amount == null || amount < parseFloat(filters.amountMin))) return false;
      if (filters.amountMax && (amount != null && amount > parseFloat(filters.amountMax))) return false;
      return true;
    });

    const cmp = (a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'reqDate':  av = a.requestedAt; bv = b.requestedAt; break;
        case 'stage':    av = M_STAGES.indexOf(a.stage); bv = M_STAGES.indexOf(b.stage); break;
        case 'material': av = M.material(a.material).name; bv = M.material(b.material).name; break;
        case 'qty':      av = a.qty; bv = b.qty; break;
        case 'type':     av = a.kind + (a.advance ? '_adv' : ''); bv = b.kind + (b.advance ? '_adv' : ''); break;
        case 'amount':   av = a.po?.amount || 0; bv = b.po?.amount || 0; break;
        case 'needBy':   av = a.needBy || ''; bv = b.needBy || ''; break;
        default: return 0;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    };
    return rows.slice().sort(cmp);
  }, [threads, filters, sortKey, sortDir]);

  const toggleSet = (key, value) => {
    setFilters((f) => {
      const s = new Set(f[key]);
      if (s.has(value)) s.delete(value);
      else s.add(value);
      return { ...f, [key]: s };
    });
  };
  const onSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  return (
    <div style={{background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      {/* Table toolbar */}
      <div style={{
        padding:'10px 14px', borderBottom:`1px solid ${T.border}`,
        display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
      }}>
        <span style={{fontSize:12, fontWeight:700, color:T.text}}>{visible.length} of {threads.length} threads</span>
        {filterCount > 0 && (
          <Badge tone="primary">{filterCount} filter{filterCount !== 1 ? 's' : ''} active</Badge>
        )}
        <div style={{flex:1}}/>
        <button onClick={() => setShowFilters(s => !s)} style={{
          display:'inline-flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:7,
          border:`1px solid ${T.border}`, background: showFilters ? T.primarySoft : '#fff',
          color: showFilters ? T.primary : T.text,
          fontSize:11.5, fontWeight:600, fontFamily:T.font, cursor:'pointer',
        }}>
          <Icon name="filter" size={11} color="currentColor"/> Column filters
        </button>
        {filterCount > 0 && (
          <button onClick={clearFilters} style={{
            display:'inline-flex', alignItems:'center', gap:5, padding:'6px 10px', borderRadius:7,
            border:'none', background:'transparent', color:T.danger,
            fontSize:11.5, fontWeight:600, fontFamily:T.font, cursor:'pointer',
          }}>
            <Icon name="x" size={10} color={T.danger}/> Clear
          </button>
        )}
        <span style={{padding:'0 4px', color:T.subtle, fontSize:12}}>·</span>
        <span style={{fontSize:11, color:T.muted, fontFamily:T.mono}}>
          Sort: <b style={{color:T.text}}>{TABLE_COLS.find(c => c.key === sortKey)?.label}</b> {sortDir === 'desc' ? '↓' : '↑'}
        </span>
      </div>

      {/* Scroll container — horizontal scroll for narrow viewports */}
      <div style={{overflow:'auto', maxHeight: 720}}>
        <table style={{
          width:'100%', borderCollapse:'separate', borderSpacing:0,
          fontFamily:T.font, fontSize:12.5, minWidth: 1180,
        }}>
          <colgroup>
            {TABLE_COLS.map(c => <col key={c.key} style={{width: c.width}}/>)}
          </colgroup>

          {/* Header row — sort */}
          <thead>
            <tr>
              {TABLE_COLS.map(c => (
                <th key={c.key} style={{
                  position:'sticky', top:0, background:T.bg, zIndex:2,
                  textAlign: c.align || 'left',
                  padding:'10px 12px',
                  borderBottom:`1px solid ${T.border}`,
                  fontSize:10.5, fontWeight:700, color:T.muted, letterSpacing:0.4, textTransform:'uppercase',
                  whiteSpace:'nowrap',
                  cursor: c.sortable ? 'pointer' : 'default',
                  userSelect:'none',
                }}
                  onClick={c.sortable ? () => onSort(c.key) : undefined}>
                  <span style={{display:'inline-flex', alignItems:'center', gap:5}}>
                    {c.label}
                    {c.sortable && (
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
              ))}
            </tr>

            {/* Filter row */}
            {showFilters && (
              <tr>
                {/* Req# search */}
                <th style={tableFilterCellStyle}>
                  <ColInput value={filters.reqDate} onChange={(v) => setFilter('reqDate', v)} placeholder="MR-…"/>
                </th>
                {/* Stage multi-select */}
                <th style={tableFilterCellStyle}>
                  <MultiSelect
                    label="Any stage"
                    selected={filters.stage}
                    options={M_STAGES.map(s => ({ value: s, label: M.stageLabel(s) }))}
                    onToggle={(v) => toggleSet('stage', v)}
                    onClear={() => setFilter('stage', new Set())}
                  />
                </th>
                {/* Material search */}
                <th style={tableFilterCellStyle}>
                  <ColInput value={filters.material} onChange={(v) => setFilter('material', v)} placeholder="cement…"/>
                </th>
                {/* Qty range */}
                <th style={tableFilterCellStyle}>
                  <div style={{display:'flex', gap:4}}>
                    <ColInput value={filters.qtyMin} onChange={(v) => setFilter('qtyMin', v)} placeholder="min" small/>
                    <ColInput value={filters.qtyMax} onChange={(v) => setFilter('qtyMax', v)} placeholder="max" small/>
                  </div>
                </th>
                {/* Section search */}
                <th style={tableFilterCellStyle}>
                  <ColInput value={filters.section} onChange={(v) => setFilter('section', v)} placeholder="foundation…"/>
                </th>
                {/* Type multi */}
                <th style={tableFilterCellStyle}>
                  <MultiSelect
                    label="Any type"
                    selected={filters.type}
                    options={[
                      { value:'own',     label:'Own site' },
                      { value:'group',   label:'Group' },
                      { value:'advance', label:'Advance' },
                      { value:'spot',    label:'Spot · wallet' },
                    ]}
                    onToggle={(v) => toggleSet('type', v)}
                    onClear={() => setFilter('type', new Set())}
                  />
                </th>
                {/* Vendor search */}
                <th style={tableFilterCellStyle}>
                  <ColInput value={filters.vendor} onChange={(v) => setFilter('vendor', v)} placeholder="vendor…"/>
                </th>
                {/* Amount range */}
                <th style={tableFilterCellStyle}>
                  <div style={{display:'flex', gap:4}}>
                    <ColInput value={filters.amountMin} onChange={(v) => setFilter('amountMin', v)} placeholder="min" small/>
                    <ColInput value={filters.amountMax} onChange={(v) => setFilter('amountMax', v)} placeholder="max" small/>
                  </div>
                </th>
                <th style={tableFilterCellStyle}>{/* needBy — no filter for now */}</th>
                <th style={tableFilterCellStyle}>{/* action — no filter */}</th>
              </tr>
            )}
          </thead>

          {/* Body */}
          <tbody>
            {visible.map((t, ri) => (
              <TableRow key={t.id} t={t} dispatch={dispatch} striped={ri % 2 === 1}/>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={TABLE_COLS.length} style={{padding:'30px', textAlign:'center', color:T.muted, fontSize:12.5}}>
                  No rows match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{
        padding:'10px 14px', borderTop:`1px solid ${T.border}`, background:T.bg,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        fontSize:11.5, color:T.muted, fontWeight:500,
      }}>
        <span>{visible.length} row{visible.length !== 1 ? 's' : ''}</span>
        <span>Click any column header to sort · click filter cells to narrow</span>
      </div>
    </div>
  );
}

const tableFilterCellStyle = {
  position:'sticky', top: 36, background:T.bg, zIndex:1,
  padding:'6px 10px', borderBottom:`1px solid ${T.border}`,
};

function ColInput({ value, onChange, placeholder, small }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: small ? 50 : '100%', padding:'5px 8px', background:'#fff',
        border:`1px solid ${T.border}`, borderRadius:6,
        fontSize:11, color:T.text, fontFamily:T.font, outline:'none',
      }}/>
  );
}

function MultiSelect({ label, selected, options, onToggle, onClear }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const off = (e) => { if (!ref.current || !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [open]);
  const summary = selected.size === 0 ? label : `${selected.size} selected`;
  return (
    <div ref={ref} style={{position:'relative'}}>
      <button onClick={() => setOpen(o => !o)} style={{
        width:'100%', padding:'5px 8px', background:'#fff', cursor:'pointer',
        border:`1px solid ${selected.size > 0 ? T.primary : T.border}`, borderRadius:6,
        fontSize:11, color: selected.size > 0 ? T.primary : T.muted, fontFamily:T.font,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        fontWeight: selected.size > 0 ? 700 : 500,
      }}>
        <span>{summary}</span>
        <Icon name="chevDn" size={9} color="currentColor"/>
      </button>
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, minWidth:170,
          background:'#fff', border:`1px solid ${T.border}`, borderRadius:8,
          boxShadow:'0 8px 24px rgba(15,23,42,.12)', padding:4, zIndex:10, maxHeight:280, overflow:'auto',
        }}>
          {options.map(o => (
            <button key={o.value} onClick={() => onToggle(o.value)} style={{
              display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 9px', borderRadius:6,
              background: selected.has(o.value) ? T.primarySoft : 'transparent',
              border:'none', cursor:'pointer', fontSize:11.5, fontFamily:T.font, color:T.text,
              fontWeight: selected.has(o.value) ? 700 : 500, textAlign:'left',
            }}>
              <span style={{
                width:14, height:14, borderRadius:4,
                background: selected.has(o.value) ? T.primary : '#fff',
                border: `1.5px solid ${selected.has(o.value) ? T.primary : T.border}`,
                display:'inline-flex', alignItems:'center', justifyContent:'center',
              }}>
                {selected.has(o.value) && <Icon name="check" size={8} color="#fff" stroke={3}/>}
              </span>
              {o.label}
            </button>
          ))}
          {selected.size > 0 && (
            <>
              <div style={{height:1, background:T.hairline, margin:'4px 0'}}/>
              <button onClick={onClear} style={{
                display:'flex', alignItems:'center', gap:6, width:'100%', padding:'6px 9px', borderRadius:6,
                background:'transparent', border:'none', cursor:'pointer',
                fontSize:11, color:T.danger, fontWeight:600, fontFamily:T.font, textAlign:'left',
              }}>
                <Icon name="x" size={10} color={T.danger}/> Clear
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TableRow({ t, dispatch, striped }) {
  const mat = M.material(t.material);
  const isSpot = t.purchaseType === 'spot';
  const vendor = isSpot ? { name: t.spot.vendorName } : (t.po && M.vendor(t.po.vendor));
  const amount = isSpot ? t.spot.amount : t.po?.amount;
  const next = M.nextAction(t);
  const isGroup = t.kind === 'group';
  const cellBase = {
    padding:'9px 12px', borderBottom:`1px solid ${T.hairline}`,
    fontSize:12, color:T.text, verticalAlign:'middle',
  };
  return (
    <tr style={{background: striped ? T.bg : '#fff'}}>
      {/* Req# + date */}
      <td style={cellBase}>
        <div style={{display:'flex', flexDirection:'column', gap:2}}>
          <span style={{fontFamily:T.mono, fontSize:11, fontWeight:700, color:T.primary}}>{t.id}</span>
          <span style={{fontSize:10.5, color:T.subtle}}>{fmtDate(t.requestedAt)}</span>
        </div>
      </td>

      {/* Stage pill */}
      <td style={cellBase}>
        <StagePill stage={t.stage}/>
      </td>

      {/* Material */}
      <td style={cellBase}>
        <div style={{display:'flex', flexDirection:'column', gap:1}}>
          <span style={{fontSize:12, fontWeight:600, color:T.text}}>{mat.name}</span>
          <span style={{fontSize:10.5, color:T.subtle}}>{mat.spec}</span>
        </div>
      </td>

      {/* Qty */}
      <td style={{...cellBase, textAlign:'right', fontFamily:T.mono, fontWeight:700}}>
        {t.qty} <span style={{color:T.muted, fontWeight:500}}>{t.unit}</span>
      </td>

      {/* Section */}
      <td style={cellBase}>
        <div style={{display:'flex', flexDirection:'column', gap:1}}>
          <span style={{fontSize:11.5, fontWeight:600}}>{t.section}</span>
          <span style={{fontSize:10.5, color:T.subtle}}>{t.floor || '—'}</span>
        </div>
      </td>

      {/* Type */}
      <td style={cellBase}>
        <div style={{display:'flex', flexDirection:'column', gap:3}}>
          {isGroup ? <Badge tone="pink" dot>Group</Badge> : <Badge tone="primary" dot>Own</Badge>}
          {t.advance && <Badge tone="warn" dot>Advance</Badge>}
        </div>
      </td>

      {/* Vendor */}
      <td style={cellBase}>
        {vendor ? (
          <span style={{fontSize:11.5, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'inline-block', maxWidth:140}}>{vendor.name}</span>
        ) : <span style={{fontSize:11, color:T.subtle, fontStyle:'italic'}}>—</span>}
      </td>

      {/* Amount */}
      <td style={{...cellBase, textAlign:'right', fontFamily:T.mono, fontWeight:700}}>
        {amount != null ? inr(amount) : <span style={{color:T.subtle, fontWeight:500, fontStyle:'italic', fontFamily:T.font, fontSize:11}}>—</span>}
      </td>

      {/* Need by */}
      <td style={cellBase}>
        <span style={{fontSize:11, color: t.priority === 'high' ? T.danger : T.muted, fontWeight: t.priority === 'high' ? 700 : 500}}>
          {t.needBy ? fmtDate(t.needBy) : '—'}
        </span>
      </td>

      {/* Action */}
      <td style={cellBase}>
        {next ? (
          <button onClick={() => onNextAction(t, dispatch)} style={{
            padding:'6px 10px', borderRadius:7, border:'none', cursor:'pointer',
            background: isGroup ? T.pink : T.primary, color:'#fff',
            fontSize:11, fontWeight:700, fontFamily:T.font,
            display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap',
          }}>{next.label} <Icon name="arrowRt" size={9} color="#fff"/></button>
        ) : (
          <Icon name="check" size={13} color={T.success}/>
        )}
      </td>
    </tr>
  );
}

function StagePill({ stage }) {
  const stageMap = {
    'requested':  { bg: T.bg,         fg: T.muted,    icon: 'plus'    },
    'approved':   { bg: T.primarySoft, fg: T.primary,  icon: 'check'   },
    'ordered':    { bg: T.warnSoft,    fg: T.warn,     icon: 'receipt' },
    'delivered':  { bg: '#ecfeff',     fg: '#0891b2',  icon: 'download'},
    'settled':    { bg: T.successSoft, fg: T.success,  icon: 'check'   },
    'in-use':     { bg: T.primarySoft, fg: T.primary,  icon: 'trend'   },
    'exhausted':  { bg: T.hairline,    fg: T.subtle,   icon: 'check'   },
    'rejected':   { bg: T.dangerSoft,  fg: T.danger,   icon: 'x'       },
  };
  const s = stageMap[stage] || stageMap.requested;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'2px 8px', borderRadius:6, background:s.bg, color:s.fg,
      fontSize:10.5, fontWeight:700, letterSpacing:0.2, textTransform:'uppercase',
    }}>
      <Icon name={s.icon} size={9} color="currentColor" stroke={2.4}/>
      {M.stageLabel(stage)}
    </span>
  );
}

Object.assign(window, { ProtoHubTable, StagePill, tableFilterCellStyle, ColInput, MultiSelect });
