// Inventory — warehouse-style. Default is a card grid with prominent
// material "tiles" (placeholder visuals using category-themed gradients +
// patterns; swap for real product photos when available). Table view is
// an alternative for filter/sort-heavy ops.

function ProtoInventory({ state, dispatch, mobile }) {
  const [tab, setTab] = React.useState('all'); // 'all' | 'own' | 'group'
  const [layout, setLayout] = React.useState('cards'); // 'cards' | 'table'
  const [search, setSearch] = React.useState('');

  const stocked = state.threads.filter(t => t.inventory);
  const ownStock = stocked.filter(t => t.kind === 'own');
  const groupStock = stocked.filter(t => t.kind === 'group');
  const visible = (tab === 'all' ? stocked : tab === 'own' ? ownStock : groupStock)
    .filter(t => !search || M.material(t.material).name.toLowerCase().includes(search.toLowerCase()));

  const ownValue   = ownStock.reduce((a,t) => a + (t.po.amount * t.inventory.remaining / t.inventory.received), 0);
  const groupValue = groupStock.reduce((a,t) => a + (t.po.amount * t.inventory.remaining / t.inventory.received), 0);
  const lowStock = stocked.filter(t => t.inventory.remaining / t.inventory.received < 0.2).length;

  return (
    <div style={{flex:1, overflow:'auto', padding: mobile ? '14px 14px 80px' : '18px 22px 80px'}}>
      <button onClick={() => dispatch({type:'SET_VIEW', view:'hub'})} style={{
        display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px 5px 5px', borderRadius:7,
        border:'none', background:'transparent', color:T.muted, fontSize:12.5, fontWeight:600,
        cursor:'pointer', marginBottom:10, fontFamily:T.font,
      }}>
        <Icon name="arrowLt" size={13} color={T.muted}/> Back to Hub
      </button>

      <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom: 16, gap:12, flexWrap:'wrap'}}>
        <div>
          <h1 style={{margin:0, fontSize: mobile ? 20 : 22, fontWeight:700, letterSpacing:-0.4}}>Inventory</h1>
          <div style={{fontSize:12.5, color:T.muted, marginTop:4}}>Walk the shelves — what's physically here, what's shared with the cluster, and what's running low.</div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          {!mobile && (
            <div style={{display:'flex', background:'#fff', padding:3, borderRadius:9, border:`1px solid ${T.border}`}}>
              <InvLayoutBtn icon="grid" label="Cards" active={layout === 'cards'} onClick={() => setLayout('cards')}/>
              <InvLayoutBtn icon="list" label="Table" active={layout === 'table'} onClick={() => setLayout('table')}/>
            </div>
          )}
          <Btn variant="secondary" leading={<Icon name="upload" size={13}/>}>Manual adjustment</Btn>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap:10, marginBottom:18}}>
        <InvKpi label="Own stock"   value={inrK(ownValue)}   sub={`${ownStock.length} batches`} accent={T.primary}/>
        <InvKpi label="Group stock" value={inrK(groupValue)} sub={`${groupStock.length} shared batches`} accent={T.pink}/>
        <InvKpi label="Low stock"   value={lowStock + ''}    sub="below 20% remaining" accent={T.warn}/>
        <InvKpi label="Total batches" value={stocked.length + ''} sub="active in inventory" accent={T.text}/>
      </div>

      {/* Tabs + search */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, gap:12, flexWrap:'wrap'}}>
        <div style={{display:'flex', gap:4, background:'#fff', padding:4, borderRadius:10, border:`1px solid ${T.border}`}}>
          <InvTab active={tab==='all'} onClick={() => setTab('all')} accent={T.text}>
            All · {stocked.length}
          </InvTab>
          <InvTab active={tab==='own'} onClick={() => setTab('own')} accent={T.primary}>
            <Icon name="home" size={12} color="currentColor"/> Own · {ownStock.length}
          </InvTab>
          <InvTab active={tab==='group'} onClick={() => setTab('group')} accent={T.pink}>
            <Icon name="link" size={12} color="currentColor"/> Group · {groupStock.length}
          </InvTab>
        </div>

        <div style={{display:'flex', alignItems:'center', gap:6, padding:'7px 11px', background:'#fff', borderRadius:8, border:`1px solid ${T.border}`, minWidth:220}}>
          <Icon name="search" size={13} color={T.subtle}/>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search material…"
            style={{border:'none', background:'transparent', outline:'none', flex:1, fontSize:12.5, fontFamily:T.font, color:T.text}}/>
        </div>
      </div>

      {/* Content */}
      {layout === 'cards' || mobile ? (
        <InventoryCardGrid items={visible} dispatch={dispatch} mobile={mobile}/>
      ) : (
        <InventoryTable items={visible} dispatch={dispatch}/>
      )}
    </div>
  );
}

// ─── Material visual placeholder — category-themed tile ──────────────
// CSS gradients + repeating patterns stand in for product photos. Each
// category has its own palette + texture so a glance across the grid
// distinguishes cement vs steel vs aggregates vs timber. Drop in real
// img URLs whenever they're available.
const MAT_VISUAL = {
  Cement:      { bg: 'linear-gradient(135deg, #e2dfd6 0%, #a8a39a 100%)', fg: '#5a554d',
                 pattern: `repeating-linear-gradient(0deg, transparent 0 14px, rgba(0,0,0,.05) 14px 15px)` },
  Aggregates:  { bg: 'linear-gradient(135deg, #e6d4a8 0%, #b89a6b 100%)', fg: '#6a5530',
                 pattern: `radial-gradient(rgba(0,0,0,.18) 1px, transparent 1px) 0 0/9px 9px` },
  Bricks:      { bg: 'linear-gradient(135deg, #d2745a 0%, #9a3f25 100%)', fg: '#fff',
                 pattern: `repeating-linear-gradient(0deg, transparent 0 12px, rgba(0,0,0,.18) 12px 13px),
                          repeating-linear-gradient(90deg, transparent 0 24px, rgba(0,0,0,.18) 24px 25px)` },
  Steel:       { bg: 'linear-gradient(135deg, #6b7280 0%, #2d3540 100%)', fg: '#e2e6ee',
                 pattern: `repeating-linear-gradient(90deg, transparent 0 6px, rgba(255,255,255,.08) 6px 7px)` },
  Timber:      { bg: 'linear-gradient(135deg, #b07a4a 0%, #5d3a1c 100%)', fg: '#fff',
                 pattern: `repeating-linear-gradient(0deg, transparent 0 4px, rgba(0,0,0,.1) 4px 5px),
                          repeating-linear-gradient(0deg, transparent 0 28px, rgba(0,0,0,.18) 28px 30px)` },
  Electrical:  { bg: 'linear-gradient(135deg, #4299e1 0%, #2b4d8c 100%)', fg: '#fff',
                 pattern: `radial-gradient(rgba(255,255,255,.18) 1px, transparent 1px) 0 0/14px 14px` },
};

function MaterialAvatar({ mat, size = 140, lowStock, exhausted }) {
  const v = MAT_VISUAL[mat.cat] || MAT_VISUAL.Cement;
  return (
    <div style={{
      width: '100%', height: size, position:'relative', overflow:'hidden',
      borderRadius:0,
      background: v.bg,
      color: v.fg,
      display:'flex', alignItems:'flex-end', justifyContent:'flex-start', padding:'10px 12px',
    }}>
      {/* Pattern layer */}
      <div style={{
        position:'absolute', inset:0, background: v.pattern, opacity: exhausted ? 0.3 : 1,
        pointerEvents:'none',
      }}/>

      {/* Material name watermark */}
      <div style={{
        position:'relative', zIndex:1,
        fontFamily:T.mono, fontSize:10.5, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase',
        opacity: 0.55,
      }}>
        {mat.name}
      </div>

      {/* Big category initial — abstract product mark */}
      <div style={{
        position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -55%)',
        zIndex:1, fontSize: size * 0.42, fontWeight:800, color: v.fg, opacity: 0.35,
        fontFamily:T.font, letterSpacing:-2, lineHeight:1, fontStretch:'expanded',
      }}>
        {mat.cat[0]}
      </div>

      {/* Badges */}
      {lowStock && (
        <div style={{
          position:'absolute', top:8, right:8, zIndex:2,
          padding:'2px 8px', borderRadius:5, background:'#ef4444', color:'#fff',
          fontSize:9.5, fontWeight:800, letterSpacing:0.5,
        }}>LOW</div>
      )}
      {exhausted && (
        <div style={{
          position:'absolute', top:8, right:8, zIndex:2,
          padding:'2px 8px', borderRadius:5, background:'rgba(15,23,42,.7)', color:'#fff',
          fontSize:9.5, fontWeight:800, letterSpacing:0.5,
        }}>EMPTY</div>
      )}
    </div>
  );
}

// ─── Card grid (warehouse browse) ───────────────────────────────────
function InventoryCardGrid({ items, dispatch, mobile }) {
  if (items.length === 0) {
    return (
      <div style={{padding:'40px 20px', textAlign:'center', background:'#fff', borderRadius:12, border:`1px dashed ${T.border}`}}>
        <div style={{fontSize:13, color:T.muted}}>Nothing in this section yet.</div>
      </div>
    );
  }
  return (
    <div style={{
      display:'grid',
      gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 12,
    }}>
      {items.map(t => <InventoryCard t={t} key={t.id} dispatch={dispatch}/>)}
    </div>
  );
}

function InventoryCard({ t, dispatch }) {
  const mat = M.material(t.material);
  const isSpot = t.purchaseType === 'spot';
  const vendor = isSpot ? { name: t.spot.vendorName } : M.vendor(t.po.vendor);
  const payer = isSpot ? M.site(t.site) : M.site(t.po.payer);
  const amount = isSpot ? t.spot.amount : t.po.amount;
  const expected = isSpot ? t.boughtAt : t.po.expected;
  const isGroup = t.kind === 'group';
  const pct = t.inventory.used / t.inventory.received;
  const remaining = t.inventory.remaining;
  const lowStock = remaining > 0 && (1 - pct) < 0.2;
  const exhausted = remaining <= 0;
  const accent = isSpot ? T.warn : (isGroup ? T.pink : T.primary);

  return (
    <div style={{
      background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden',
      display:'flex', flexDirection:'column',
      transition:'all .12s',
    }}>
      <MaterialAvatar mat={mat} size={140} lowStock={lowStock} exhausted={exhausted}/>

      {/* Body */}
      <div style={{padding:'14px', display:'flex', flexDirection:'column', gap:10}}>
        {/* Tags row */}
        <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
          {isSpot && <Badge tone="warn" dot>Spot</Badge>}
          {isGroup ? <Badge tone="pink" dot>Group · cluster</Badge> : <Badge tone="primary" dot>Own site</Badge>}
          {t.advance && <Badge tone="warn" dot>Advance</Badge>}
          {isSpot && isGroup && t.spotStage === 'provisional' && (
            <Badge tone="warn">PROVISIONAL</Badge>
          )}
          <span style={{marginLeft:'auto', fontSize:10, fontFamily:T.mono, color:T.subtle, fontWeight:600}}>
            {t.inventory.batch}
          </span>
        </div>

        {/* Title */}
        <div>
          <div style={{fontSize:14, fontWeight:700, color:T.text, letterSpacing:-0.1}}>{mat.name}</div>
          <div style={{fontSize:11.5, color:T.muted, marginTop:2}}>{mat.spec}</div>
        </div>

        {/* Big remaining number */}
        <div style={{display:'flex', alignItems:'baseline', gap:6}}>
          <div style={{
            fontSize:30, fontWeight:800, fontFamily:T.mono, letterSpacing:-1,
            color: exhausted ? T.subtle : (lowStock ? T.warn : T.text),
            lineHeight:1,
          }}>{remaining}</div>
          <div style={{fontSize:13, color:T.muted, fontWeight:600}}>{t.unit}</div>
          <div style={{flex:1}}/>
          <div style={{fontSize:11, color:T.subtle, fontWeight:500}}>of {t.inventory.received}</div>
        </div>

        {/* Stacked usage bar */}
        <div>
          <div style={{height:8, borderRadius:4, background:T.hairline, overflow:'hidden', display:'flex'}}>
            {isGroup && t.interSiteUsage && t.interSiteUsage.length > 0
              ? t.interSiteUsage.map((u, i) => {
                  const s = M.site(u.site);
                  return <div key={i} title={`${s.name}: ${u.used} ${t.unit}`} style={{
                    width: `${(u.used / t.inventory.received) * 100}%`, background: s.accent,
                  }}/>;
                })
              : <div style={{width: `${pct*100}%`, background: T.primary}}/>}
          </div>
          {/* Legend / breakdown */}
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginTop:7}}>
            {isGroup && t.interSiteUsage && t.interSiteUsage.length > 0 ? (
              t.interSiteUsage.map((u, i) => {
                const s = M.site(u.site);
                const isPayer = !isSpot && u.site === t.po.payer;
                return (
                  <div key={i} style={{display:'flex', alignItems:'center', gap:4, fontSize:10.5}}>
                    <span style={{width:8, height:8, borderRadius:2, background:s.accent}}/>
                    <span style={{color:T.muted, fontWeight:600}}>{s.short}</span>
                    <span style={{fontFamily:T.mono, fontWeight:700, color:T.text}}>{u.used.toFixed(1)}</span>
                    {isPayer && <span style={{fontSize:8.5, color:T.subtle, fontWeight:800, letterSpacing:0.4}}>PAYER</span>}
                  </div>
                );
              })
            ) : isSpot && isGroup && t.spot.allocation ? (
              t.spot.allocation.split.map((s, i) => {
                const site = M.site(s.site);
                return (
                  <div key={i} style={{display:'flex', alignItems:'center', gap:4, fontSize:10.5}}>
                    <span style={{width:8, height:8, borderRadius:2, background:site.accent}}/>
                    <span style={{color:T.muted, fontWeight:600}}>{site.short}</span>
                    <span style={{fontFamily:T.mono, fontWeight:700, color:T.warn}}>{s.pct}%</span>
                  </div>
                );
              })
            ) : (
              <div style={{display:'flex', alignItems:'center', gap:4, fontSize:10.5}}>
                <span style={{width:8, height:8, borderRadius:2, background:T.primary}}/>
                <span style={{color:T.muted, fontWeight:600}}>Used</span>
                <span style={{fontFamily:T.mono, fontWeight:700, color:T.text}}>{t.inventory.used} {t.unit}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer: vendor + paid by + action */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:10,
          paddingTop:10, borderTop:`1px solid ${T.hairline}`,
        }}>
          <div style={{minWidth:0, flex:1}}>
            <div style={{fontSize:11.5, color:T.text, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{vendor.name}</div>
            <div style={{fontSize:10.5, color:T.muted, marginTop:1}}>
              {isSpot
                ? <>Wallet · {t.spot.paymentMode.toUpperCase()} · {inr(amount)}</>
                : <>Paid by <span style={{color: payer.accent, fontWeight:700}}>{payer.short}</span> · {inr(amount)}</>}
            </div>
          </div>
          {isSpot && isGroup && t.spotStage === 'provisional' ? (
            <button onClick={() => dispatch({type:'OPEN_MODAL', modal:{kind:'finalize-allocation', threadId: t.id}})} style={{
              padding:'7px 11px', borderRadius:7, border:'none', cursor:'pointer',
              background:T.warn, color:'#fff', fontSize:11.5, fontWeight:700, fontFamily:T.font,
              display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap',
            }}>
              Finalize
            </button>
          ) : !exhausted ? (
            <button onClick={() => dispatch({type:'OPEN_MODAL', modal:{kind:'log-usage', threadId: t.id}})} style={{
              padding:'7px 11px', borderRadius:7, border:'none', cursor:'pointer',
              background:accent, color:'#fff', fontSize:11.5, fontWeight:700, fontFamily:T.font,
              display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap',
            }}>
              <Icon name="plus" size={10} color="#fff"/> Log
            </button>
          ) : (
            <span style={{
              fontSize:11, color:T.subtle, fontWeight:700,
              padding:'7px 11px', background:T.bg, borderRadius:7,
            }}>Done</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Inventory Table (filter/sort heavy) ────────────────────────────
function InventoryTable({ items, dispatch }) {
  const [sortKey, setSortKey] = React.useState('remaining');
  const [sortDir, setSortDir] = React.useState('desc');
  const [filters, setFilters] = React.useState({
    material:'', vendor:'', batch:'', kind:new Set(), payer: new Set(),
    minRem:'', maxRem:'',
  });
  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const toggleSet = (k, v) => setFilters((f) => {
    const s = new Set(f[k]); s.has(v) ? s.delete(v) : s.add(v);
    return { ...f, [k]: s };
  });
  const clearAll = () => setFilters({ material:'', vendor:'', batch:'', kind:new Set(), payer:new Set(), minRem:'', maxRem:''});
  const filterCount =
    (filters.material?1:0) + (filters.vendor?1:0) + (filters.batch?1:0) +
    filters.kind.size + filters.payer.size + (filters.minRem||filters.maxRem ? 1 : 0);

  const visible = React.useMemo(() => {
    let rows = items.filter(t => {
      const mat = M.material(t.material);
      const isSpot = t.purchaseType === 'spot';
      const vendor = isSpot ? { name: t.spot.vendorName } : M.vendor(t.po.vendor);
      const payerId = isSpot ? t.site : t.po.payer;
      if (filters.material && !mat.name.toLowerCase().includes(filters.material.toLowerCase())) return false;
      if (filters.vendor   && !vendor.name.toLowerCase().includes(filters.vendor.toLowerCase())) return false;
      if (filters.batch    && !t.inventory.batch.toLowerCase().includes(filters.batch.toLowerCase())) return false;
      if (filters.kind.size && !filters.kind.has(t.kind)) return false;
      if (filters.payer.size && !filters.payer.has(payerId)) return false;
      if (filters.minRem   && t.inventory.remaining < parseFloat(filters.minRem)) return false;
      if (filters.maxRem   && t.inventory.remaining > parseFloat(filters.maxRem)) return false;
      return true;
    });
    const cmp = (a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'material':  av = M.material(a.material).name; bv = M.material(b.material).name; break;
        case 'qty':       av = a.inventory.received; bv = b.inventory.received; break;
        case 'used':      av = a.inventory.used; bv = b.inventory.used; break;
        case 'remaining': av = a.inventory.remaining; bv = b.inventory.remaining; break;
        case 'pct':       av = a.inventory.used / a.inventory.received; bv = b.inventory.used / b.inventory.received; break;
        case 'amount':    av = (a.po?.amount ?? a.spot?.amount ?? 0); bv = (b.po?.amount ?? b.spot?.amount ?? 0); break;
        default: return 0;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    };
    return rows.slice().sort(cmp);
  }, [items, filters, sortKey, sortDir]);

  const onSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const cols = [
    { key:'image',     label:'',          width: 44,  sortable: false },
    { key:'batch',     label:'Batch',     width: 130, sortable: false },
    { key:'material',  label:'Material',  width: 200, sortable: true },
    { key:'kind',      label:'Kind',      width: 110, sortable: false },
    { key:'qty',       label:'Received',  width: 100, sortable: true,  align:'right' },
    { key:'used',      label:'Used',      width: 100, sortable: true,  align:'right' },
    { key:'remaining', label:'Remaining', width: 100, sortable: true,  align:'right' },
    { key:'pct',       label:'% used',    width: 110, sortable: true },
    { key:'vendor',    label:'Vendor',    width: 150, sortable: false },
    { key:'amount',    label:'Value',     width: 100, sortable: true,  align:'right' },
    { key:'payer',     label:'Paid by',   width: 100, sortable: false },
    { key:'action',    label:'',          width: 100, sortable: false },
  ];

  return (
    <div style={{background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{padding:'10px 14px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
        <span style={{fontSize:12, fontWeight:700}}>{visible.length} of {items.length} batches</span>
        {filterCount > 0 && <Badge tone="primary">{filterCount} filter{filterCount !== 1 ? 's' : ''}</Badge>}
        <div style={{flex:1}}/>
        {filterCount > 0 && (
          <button onClick={clearAll} style={{
            display:'inline-flex', alignItems:'center', gap:5, padding:'6px 10px', borderRadius:7,
            border:'none', background:'transparent', color:T.danger,
            fontSize:11.5, fontWeight:600, fontFamily:T.font, cursor:'pointer',
          }}>
            <Icon name="x" size={10} color={T.danger}/> Clear
          </button>
        )}
        <span style={{fontSize:11, color:T.muted, fontFamily:T.mono}}>
          Sort: <b style={{color:T.text}}>{cols.find(c => c.key === sortKey)?.label}</b> {sortDir === 'desc' ? '↓' : '↑'}
        </span>
      </div>

      <div style={{overflow:'auto', maxHeight: 660}}>
        <table style={{
          width:'100%', borderCollapse:'separate', borderSpacing:0,
          fontFamily:T.font, fontSize:12.5, minWidth: 1240,
        }}>
          <colgroup>{cols.map(c => <col key={c.key} style={{width: c.width}}/>)}</colgroup>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} onClick={c.sortable ? () => onSort(c.key) : undefined}
                  style={{
                    position:'sticky', top:0, background:T.bg, zIndex:2,
                    textAlign: c.align || 'left',
                    padding:'10px 12px',
                    borderBottom:`1px solid ${T.border}`,
                    fontSize:10.5, fontWeight:700, color:T.muted, letterSpacing:0.4, textTransform:'uppercase',
                    whiteSpace:'nowrap', cursor: c.sortable ? 'pointer' : 'default', userSelect:'none',
                  }}>
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
            <tr>
              <th style={tableFilterCellStyle}/>
              <th style={tableFilterCellStyle}>
                <ColInput value={filters.batch} onChange={(v) => setF('batch', v)} placeholder="MAT-…"/>
              </th>
              <th style={tableFilterCellStyle}>
                <ColInput value={filters.material} onChange={(v) => setF('material', v)} placeholder="cement…"/>
              </th>
              <th style={tableFilterCellStyle}>
                <MultiSelect label="Any" selected={filters.kind}
                  options={[{value:'own',label:'Own'},{value:'group',label:'Group'}]}
                  onToggle={(v) => toggleSet('kind', v)}
                  onClear={() => setF('kind', new Set())}/>
              </th>
              <th style={tableFilterCellStyle}/>
              <th style={tableFilterCellStyle}/>
              <th style={tableFilterCellStyle}>
                <div style={{display:'flex', gap:3}}>
                  <ColInput value={filters.minRem} onChange={(v) => setF('minRem', v)} placeholder="min" small/>
                  <ColInput value={filters.maxRem} onChange={(v) => setF('maxRem', v)} placeholder="max" small/>
                </div>
              </th>
              <th style={tableFilterCellStyle}/>
              <th style={tableFilterCellStyle}>
                <ColInput value={filters.vendor} onChange={(v) => setF('vendor', v)} placeholder="vendor…"/>
              </th>
              <th style={tableFilterCellStyle}/>
              <th style={tableFilterCellStyle}>
                <MultiSelect label="Any" selected={filters.payer}
                  options={M_SITES.map(s => ({ value: s.id, label: s.short }))}
                  onToggle={(v) => toggleSet('payer', v)}
                  onClear={() => setF('payer', new Set())}/>
              </th>
              <th style={tableFilterCellStyle}/>
            </tr>
          </thead>
          <tbody>
            {visible.map((t, ri) => <InventoryTableRow t={t} key={t.id} dispatch={dispatch} striped={ri % 2 === 1}/>)}
            {visible.length === 0 && (
              <tr>
                <td colSpan={cols.length} style={{padding:'30px', textAlign:'center', color:T.muted, fontSize:12.5}}>
                  No batches match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryTableRow({ t, dispatch, striped }) {
  const mat = M.material(t.material);
  const isSpot = t.purchaseType === 'spot';
  const vendor = isSpot ? { name: t.spot.vendorName } : M.vendor(t.po.vendor);
  const payer = isSpot ? M.site(t.site) : M.site(t.po.payer);
  const amount = isSpot ? t.spot.amount : t.po.amount;
  const isGroup = t.kind === 'group';
  const pct = t.inventory.used / t.inventory.received;
  const lowStock = t.inventory.remaining > 0 && (1 - pct) < 0.2;
  const exhausted = t.inventory.remaining <= 0;
  const v = MAT_VISUAL[mat.cat] || MAT_VISUAL.Cement;

  const cell = {padding:'8px 12px', borderBottom:`1px solid ${T.hairline}`, fontSize:12, verticalAlign:'middle'};
  return (
    <tr style={{background: striped ? T.bg : '#fff'}}>
      <td style={{...cell, padding:'6px 6px 6px 12px'}}>
        {/* Tiny material avatar */}
        <div style={{
          width:32, height:32, borderRadius:6, background: v.bg, color: v.fg,
          display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13,
          fontFamily:T.font, position:'relative', overflow:'hidden',
        }}>
          <div style={{position:'absolute', inset:0, background: v.pattern, opacity: 0.8}}/>
          <span style={{position:'relative'}}>{mat.cat[0]}</span>
        </div>
      </td>
      <td style={cell}>
        <span style={{fontFamily:T.mono, fontSize:10.5, color:T.subtle, fontWeight:600}}>{t.inventory.batch}</span>
      </td>
      <td style={cell}>
        <div style={{fontWeight:700, color:T.text}}>{mat.name}</div>
        <div style={{fontSize:10.5, color:T.subtle, marginTop:1}}>{mat.spec}</div>
      </td>
      <td style={cell}>
        <div style={{display:'flex', flexDirection:'column', gap:3}}>
          {isGroup ? <Badge tone="pink" dot>Group</Badge> : <Badge tone="primary" dot>Own</Badge>}
          {t.advance && <Badge tone="warn" dot>Advance</Badge>}
        </div>
      </td>
      <td style={{...cell, textAlign:'right', fontFamily:T.mono, fontWeight:700}}>
        {t.inventory.received} <span style={{color:T.muted, fontWeight:500, fontSize:10.5}}>{t.unit}</span>
      </td>
      <td style={{...cell, textAlign:'right', fontFamily:T.mono, color:T.muted, fontWeight:600}}>
        {t.inventory.used}
      </td>
      <td style={{...cell, textAlign:'right', fontFamily:T.mono, fontWeight:700,
        color: exhausted ? T.subtle : (lowStock ? T.warn : T.success)}}>
        {t.inventory.remaining}
      </td>
      <td style={cell}>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <div style={{flex:1, height:5, borderRadius:3, background:T.hairline, overflow:'hidden'}}>
            <div style={{width: `${pct*100}%`, height:'100%', background: lowStock ? T.warn : T.primary}}/>
          </div>
          <span style={{fontSize:10.5, fontFamily:T.mono, fontWeight:700, color:T.text, minWidth:30, textAlign:'right'}}>
            {Math.round(pct*100)}%
          </span>
        </div>
      </td>
      <td style={cell}>
        <span style={{fontSize:11.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'inline-block', maxWidth:140}}>
          {vendor.name}
        </span>
      </td>
      <td style={{...cell, textAlign:'right', fontFamily:T.mono, fontWeight:700}}>
        {inr(amount)}
      </td>
      <td style={cell}>
        <span style={{
          padding:'2px 6px', borderRadius:4, background:`${payer.accent}1a`, color:payer.accent,
          fontSize:10.5, fontWeight:800,
        }}>{payer.short}</span>
      </td>
      <td style={cell}>
        {!exhausted ? (
          <button onClick={() => dispatch({type:'OPEN_MODAL', modal:{kind:'log-usage', threadId: t.id}})} style={{
            padding:'5px 10px', borderRadius:6, border:'none', cursor:'pointer',
            background: isGroup ? T.pink : T.primary, color:'#fff',
            fontSize:11, fontWeight:700, fontFamily:T.font,
            display:'inline-flex', alignItems:'center', gap:4, whiteSpace:'nowrap',
          }}><Icon name="plus" size={9} color="#fff"/> Log</button>
        ) : (
          <Icon name="check" size={13} color={T.success}/>
        )}
      </td>
    </tr>
  );
}

// Bits reused from before
function InvKpi({ label, value, sub, accent }) {
  return (
    <div style={{
      background:'#fff', border:`1px solid ${T.border}`, borderRadius:12, padding:14,
      position:'relative', overflow:'hidden',
    }}>
      <div style={{position:'absolute', left:0, top:0, bottom:0, width:3, background:accent}}/>
      <div style={{fontSize:11, color:T.muted, fontWeight:600, marginBottom:4}}>{label}</div>
      <div style={{fontSize:22, fontWeight:800, fontFamily:T.mono, letterSpacing:-0.6, color:T.text}}>{value}</div>
      <div style={{fontSize:11, color:T.muted, marginTop:3}}>{sub}</div>
    </div>
  );
}
function InvTab({ active, onClick, children, accent }) {
  return (
    <button onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:7,
      border:'none', cursor:'pointer', fontFamily:T.font, fontWeight: active ? 700 : 600, fontSize:12.5,
      background: active ? accent : 'transparent',
      color: active ? '#fff' : T.muted,
    }}>{children}</button>
  );
}
function InvLayoutBtn({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:6,
      border:'none', cursor:'pointer', fontFamily:T.font, fontWeight: active ? 700 : 600, fontSize:12,
      background: active ? T.primary : 'transparent',
      color: active ? '#fff' : T.muted,
    }}>
      <Icon name={icon} size={12} color="currentColor"/> {label}
    </button>
  );
}

Object.assign(window, { ProtoInventory, MaterialAvatar, MAT_VISUAL });
