// The Expenses Table — the priority surface.
// Excel-like: search, kind/trade/status filters, sort, group-by, density toggle,
// sticky header, footer totals on the filtered set.

function ExpensesTable({ expenses, trades }) {
  const [search, setSearch]   = React.useState('');
  const [kindF,  setKindF]    = React.useState('all');     // all | labor | building
  const [tradeF, setTradeF]   = React.useState('all');     // all | <tradeId>
  const [subF,   setSubF]     = React.useState('all');     // all | <subId>
  const [statusF,setStatusF]  = React.useState('all');     // all | paid | pending | advance
  const [sortBy, setSortBy]   = React.useState('date');    // date | amount | vendor | ref
  const [sortDir,setSortDir]  = React.useState('desc');
  const [groupBy,setGroupBy]  = React.useState('none');    // none | trade | kind | date | vendor
  const [dense,  setDense]    = React.useState(false);

  const rows = React.useMemo(() => {
    let out = expenses.slice();
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(r =>
        r.id.toLowerCase().includes(q) ||
        r.vendor.toLowerCase().includes(q) ||
        r.desc.toLowerCase().includes(q)
      );
    }
    if (kindF   !== 'all') out = out.filter(r => r.kind   === kindF);
    if (tradeF  !== 'all') out = out.filter(r => r.trade  === tradeF);
    if (subF    !== 'all') out = out.filter(r => r.sub    === subF);
    if (statusF !== 'all') out = out.filter(r => r.status === statusF);

    out.sort((a, b) => {
      let cmp = 0;
      if      (sortBy === 'date')   cmp = a.date.localeCompare(b.date);
      else if (sortBy === 'amount') cmp = a.amount - b.amount;
      else if (sortBy === 'vendor') cmp = a.vendor.localeCompare(b.vendor);
      else if (sortBy === 'ref')    cmp = a.id.localeCompare(b.id);
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return out;
  }, [expenses, search, kindF, tradeF, subF, statusF, sortBy, sortDir]);

  const filteredTotal   = rows.reduce((s, r) => s + r.amount, 0);
  const filteredLabor   = rows.filter(r => r.kind === 'labor').reduce((s, r) => s + r.amount, 0);
  const filteredBuild   = rows.filter(r => r.kind === 'building').reduce((s, r) => s + r.amount, 0);
  const anyFilter = search || kindF !== 'all' || tradeF !== 'all' || subF !== 'all' || statusF !== 'all';

  const grouped = React.useMemo(() => {
    if (groupBy === 'none') return [{ key: null, rows }];
    const map = new Map();
    rows.forEach(r => {
      let key;
      if      (groupBy === 'trade')  key = r.trade;
      else if (groupBy === 'kind')   key = r.kind;
      else if (groupBy === 'vendor') key = r.vendor;
      else if (groupBy === 'date')   key = r.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return [...map.entries()].map(([key, rows]) => ({ key, rows }));
  }, [rows, groupBy]);

  return (
    <div style={{
      background: T.card, border:`1px solid ${T.border}`, borderRadius:14,
      overflow:'hidden', fontFamily:T.font,
    }}>
      {/* Toolbar */}
      <div style={{padding:'14px 16px', borderBottom:`1px solid ${T.hairline}`, display:'flex', flexDirection:'column', gap:10}}>
        <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
          <div style={{
            display:'flex', alignItems:'center', gap:8, flex:'1 1 280px', minWidth:240,
            padding:'8px 12px', background:T.bg, border:`1px solid ${T.border}`, borderRadius:8,
          }}>
            <Icon name="search" size={14} color={T.subtle}/>
            <input
              placeholder="Search ref code, vendor, description…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex:1, background:'transparent', border:'none', outline:'none',
                fontFamily:T.font, fontSize:13, color:T.text,
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{background:'none', border:'none', cursor:'pointer', padding:2, display:'flex'}}>
                <Icon name="x" size={12} color={T.subtle}/>
              </button>
            )}
          </div>
          <div style={{display:'flex', gap:6, alignItems:'center'}}>
            <Pill active={kindF==='all'}      onClick={() => setKindF('all')}>All</Pill>
            <Pill active={kindF==='labor'}    onClick={() => setKindF('labor')}>Labor</Pill>
            <Pill active={kindF==='building'} onClick={() => setKindF('building')}>Building</Pill>
          </div>
          <Select value={tradeF} onChange={setTradeF} placeholder="All trades"
            options={[{ value:'all', label:'All trades' }, ...trades.map(t => ({ value:t.id, label:t.label }))]}/>
          <Select value={subF} onChange={setSubF} placeholder="All sub-kinds"
            options={[{ value:'all', label:'All sub-kinds' }, ...Object.entries(SUB_META).map(([k, v]) => ({ value:k, label:v.label }))]}/>
          <Select value={statusF} onChange={setStatusF} placeholder="All status"
            options={[
              { value:'all', label:'All status' },
              { value:'paid', label:'Paid' },
              { value:'pending', label:'Pending' },
              { value:'advance', label:'Advance' },
            ]}/>
          <div style={{flex:1}}/>
          <Btn variant="ghost" size="sm" leading={<Icon name="download" size={13}/>}>Export</Btn>
        </div>

        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap'}}>
          <div style={{display:'flex', alignItems:'center', gap:14, fontSize:12, color:T.muted}}>
            <span style={{fontWeight:600, color:T.text, fontVariantNumeric:'tabular-nums'}}>
              {rows.length} {rows.length === 1 ? 'record' : 'records'}
            </span>
            {anyFilter && (
              <button onClick={() => { setSearch(''); setKindF('all'); setTradeF('all'); setSubF('all'); setStatusF('all'); }} style={{
                background:'none', border:'none', cursor:'pointer', color:T.primary,
                fontSize:12, fontWeight:600, fontFamily:T.font,
              }}>Clear filters</button>
            )}
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <span style={{fontSize:11.5, color:T.subtle, fontWeight:600, textTransform:'uppercase', letterSpacing:0.4}}>Group by</span>
            <div style={{display:'flex', gap:0, background:T.bg, padding:2, borderRadius:7}}>
              {[
                ['none',   'None'],
                ['trade',  'Trade'],
                ['kind',   'Kind'],
                ['date',   'Date'],
                ['vendor', 'Vendor'],
              ].map(([k, l]) => (
                <button key={k} onClick={() => setGroupBy(k)} style={{
                  padding:'4px 10px', borderRadius:5, border:'none', cursor:'pointer',
                  fontFamily:T.font, fontSize:11.5, fontWeight:600,
                  background: groupBy === k ? T.card : 'transparent',
                  color: groupBy === k ? T.text : T.muted,
                  boxShadow: groupBy === k ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                }}>{l}</button>
              ))}
            </div>
            <button onClick={() => setDense(d => !d)} title={dense ? 'Comfortable' : 'Compact'} style={{
              width:30, height:28, border:`1px solid ${T.border}`, background:T.card,
              borderRadius:7, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <Icon name={dense ? 'grid' : 'list'} size={13} color={T.muted}/>
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{maxHeight: 520, overflow:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontFamily:T.font}}>
          <thead style={{position:'sticky', top:0, background:T.bg, zIndex:2}}>
            <tr style={{boxShadow:`inset 0 -1px 0 ${T.border}`}}>
              <Th label="Date"   sortKey="date"   sortBy={sortBy} sortDir={sortDir} setSort={(k, d) => { setSortBy(k); setSortDir(d); }} width={88}/>
              <Th label="Ref"    sortKey="ref"    sortBy={sortBy} sortDir={sortDir} setSort={(k, d) => { setSortBy(k); setSortDir(d); }} width={84} mono/>
              <Th label="Vendor / description"   sortKey="vendor" sortBy={sortBy} sortDir={sortDir} setSort={(k, d) => { setSortBy(k); setSortDir(d); }}/>
              <Th label="Trade"  width={110}/>
              <Th label="Kind"   width={140}/>
              <Th label="Status" width={100}/>
              <Th label="Amount" sortKey="amount" sortBy={sortBy} sortDir={sortDir} setSort={(k, d) => { setSortBy(k); setSortDir(d); }} width={120} align="right"/>
              <Th label=""       width={36}/>
            </tr>
          </thead>
          <tbody>
            {grouped.map(group => (
              <React.Fragment key={group.key ?? 'all'}>
                {group.key !== null && (
                  <tr style={{background:T.bg}}>
                    <td colSpan={8} style={{padding:'8px 16px', fontSize:11, fontWeight:700, letterSpacing:0.5, color:T.muted, textTransform:'uppercase'}}>
                      {groupHeader(groupBy, group.key, group.rows, trades)}
                    </td>
                  </tr>
                )}
                {group.rows.map(r => <Row key={r.id} row={r} trades={trades} dense={dense}/>)}
              </React.Fragment>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{padding:'40px 16px', textAlign:'center', color:T.subtle, fontSize:13}}>
                No expenses match your filters.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer totals */}
      <div style={{
        padding:'12px 16px', borderTop:`1px solid ${T.hairline}`, background:T.bg,
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, flexWrap:'wrap',
      }}>
        <div style={{display:'flex', gap:18, fontSize:12.5, color:T.muted}}>
          <span><span style={{fontWeight:500}}>Labor</span> <b style={{color:T.text, fontVariantNumeric:'tabular-nums'}}>{inrK(filteredLabor)}</b></span>
          <span><span style={{fontWeight:500}}>Building</span> <b style={{color:T.text, fontVariantNumeric:'tabular-nums'}}>{inrK(filteredBuild)}</b></span>
        </div>
        <div style={{display:'flex', alignItems:'baseline', gap:8}}>
          <span style={{fontSize:11.5, color:T.subtle, fontWeight:600, textTransform:'uppercase', letterSpacing:0.4}}>
            {anyFilter ? 'Filtered total' : 'Visible total'}
          </span>
          <span style={{fontSize:18, fontWeight:700, color:T.text, fontVariantNumeric:'tabular-nums', letterSpacing:-0.2}}>
            {inr(filteredTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Th({ label, sortKey, sortBy, sortDir, setSort, width, align = 'left', mono }) {
  const sortable = !!sortKey;
  const active = sortBy === sortKey;
  return (
    <th style={{
      padding:'10px 12px', textAlign: align, fontWeight:600, fontSize:11,
      letterSpacing:0.5, textTransform:'uppercase', color:T.muted,
      width, cursor: sortable ? 'pointer' : 'default', userSelect:'none',
      fontFamily: mono ? T.mono : T.font,
    }}
    onClick={sortable ? () => setSort(sortKey, active && sortDir === 'desc' ? 'asc' : 'desc') : undefined}
    >
      <span style={{display:'inline-flex', alignItems:'center', gap:4}}>
        {label}
        {sortable && active && <Icon name={sortDir === 'desc' ? 'arrowDn' : 'arrowUp'} size={11} color={T.text}/>}
      </span>
    </th>
  );
}

function Row({ row, trades, dense }) {
  const trade = trades.find(t => t.id === row.trade);
  const kindMeta = KIND_META[row.kind];
  const subMeta  = SUB_META[row.sub];
  const pad = dense ? '7px 12px' : '12px 12px';
  return (
    <tr style={{borderTop:`1px solid ${T.hairline}`, transition:'background .1s'}}
      onMouseEnter={e => { e.currentTarget.style.background = T.bg; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <td style={{padding:pad, fontSize:12.5, color:T.muted, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap'}}>
        {fmtDate(row.date)}
      </td>
      <td style={{padding:pad, fontSize:12, color:T.muted, fontFamily:T.mono, whiteSpace:'nowrap'}}>
        {row.id}
      </td>
      <td style={{padding:pad}}>
        <div style={{fontSize:13.5, color:T.text, fontWeight:600, lineHeight:1.3}}>{row.vendor}</div>
        {!dense && <div style={{fontSize:12, color:T.muted, marginTop:2, lineHeight:1.3}}>{row.desc}</div>}
      </td>
      <td style={{padding:pad, whiteSpace:'nowrap'}}>
        <span style={{display:'inline-flex', alignItems:'center', gap:6, fontSize:12.5, color:T.text, fontWeight:500}}>
          <span style={{width:7, height:7, borderRadius:2, background: trade?.color || T.subtle}}/>
          {trade?.label || row.trade}
        </span>
      </td>
      <td style={{padding:pad, whiteSpace:'nowrap'}}>
        <Badge tone={row.kind === 'labor' ? 'primary' : 'pink'} dot>
          {subMeta?.label || row.sub}
        </Badge>
      </td>
      <td style={{padding:pad, whiteSpace:'nowrap'}}>
        <StatusBadge status={row.status} flag={row.flag}/>
      </td>
      <td style={{padding:pad, textAlign:'right', fontSize:13.5, fontWeight:700, color:T.text, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap'}}>
        {inr(row.amount)}
      </td>
      <td style={{padding:'4px 8px', textAlign:'right'}}>
        <button style={{
          background:'none', border:'none', cursor:'pointer', padding:6, borderRadius:5,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}><Icon name="more" size={14} color={T.subtle}/></button>
      </td>
    </tr>
  );
}

function StatusBadge({ status, flag }) {
  const map = {
    paid:    { tone:'success', label:'Paid' },
    pending: { tone:'warn',    label:'Pending' },
    advance: { tone:'primary', label:'Advance' },
  };
  const m = map[status] || { tone:'neutral', label: status };
  return <Badge tone={m.tone} dot>{flag || m.label}</Badge>;
}

function groupHeader(groupBy, key, rows, trades) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  let label = key;
  if (groupBy === 'trade')  label = trades.find(t => t.id === key)?.label || key;
  if (groupBy === 'kind')   label = KIND_META[key]?.label || key;
  if (groupBy === 'date')   label = fmtDateLong(key);
  return (
    <span style={{display:'inline-flex', alignItems:'center', gap:8}}>
      <Icon name="chevDn" size={11}/>
      {label}
      <span style={{color:T.subtle, fontWeight:600}}>· {rows.length}</span>
      <span style={{marginLeft:'auto', color:T.text, fontWeight:700, fontVariantNumeric:'tabular-nums'}}>{inrK(total)}</span>
    </span>
  );
}

// Tiny custom select — same look as Pill but with caret.
function Select({ value, options, onChange, placeholder }) {
  return (
    <div style={{position:'relative', display:'inline-flex'}}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        appearance:'none', WebkitAppearance:'none',
        padding:'5px 28px 5px 12px', borderRadius:99,
        background: value && value !== 'all' ? T.primarySoft : T.chip,
        color: value && value !== 'all' ? T.primary : T.muted,
        border:'none', fontFamily:T.font, fontSize:12.5, fontWeight:600, cursor:'pointer',
      }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Icon name="chevDn" size={11} color={T.muted} style={{position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none'}}/>
    </div>
  );
}

Object.assign(window, { ExpensesTable });
