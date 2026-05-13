// Three variants of the "Browse by Trade" strip.
// (1) detailed   — rich cards with sub-breakdown
// (2) compact    — single-line rows with amount + records
// (3) chips      — pill-sized chips, very dense
//
// In all variants, zero-record trades degrade to a softer "+ trade" affordance
// so we don't waste real estate.

function TradeStrip({ variant = 'detailed', trades, onPick }) {
  if (variant === 'chips')   return <TradeChips trades={trades} onPick={onPick}/>;
  if (variant === 'compact') return <TradeCompact trades={trades} onPick={onPick}/>;
  return <TradeDetailed trades={trades} onPick={onPick}/>;
}

function TradeDetailed({ trades, onPick }) {
  const active = trades.filter(t => t.amount > 0);
  const empty  = trades.filter(t => t.amount === 0);
  return (
    <div style={{display:'flex', flexDirection:'column', gap:12}}>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:12}}>
        {active.map(t => <TradeCard key={t.id} trade={t} onClick={() => onPick?.(t)}/>)}
        {empty.length > 0 && empty.map(t => <TradeAddCard key={t.id} trade={t} onClick={() => onPick?.(t)}/>)}
      </div>
    </div>
  );
}

function TradeCard({ trade, onClick }) {
  return (
    <button onClick={onClick} style={{
      textAlign:'left', cursor:'pointer', background:T.card, border:`1px solid ${T.border}`,
      borderLeft:`3px solid ${trade.color}`, borderRadius:10, padding:'14px 16px',
      display:'flex', flexDirection:'column', gap:10, fontFamily:T.font,
      transition:'all .12s',
    }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,.05)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
        <div>
          <div style={{fontSize:11, fontWeight:700, letterSpacing:0.5, color:T.subtle, textTransform:'uppercase'}}>
            {trade.label}
          </div>
          <div style={{fontSize:20, fontWeight:700, color:T.text, marginTop:4, fontVariantNumeric:'tabular-nums', letterSpacing:-0.2}}>
            {inrK(trade.amount)}
          </div>
        </div>
        <div style={{fontSize:11, color:T.subtle, fontWeight:600, fontVariantNumeric:'tabular-nums'}}>
          {trade.records} <span style={{fontWeight:500}}>rec</span>
        </div>
      </div>
      {trade.sub && (
        <div style={{display:'flex', flexDirection:'column', gap:5}}>
          {trade.sub.map(s => (
            <div key={s.label} style={{display:'flex', justifyContent:'space-between', fontSize:12.5}}>
              <span style={{color:T.muted}}>{s.label}</span>
              <span style={{color:T.text, fontWeight:600, fontVariantNumeric:'tabular-nums'}}>{inrK(s.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function TradeAddCard({ trade, onClick }) {
  return (
    <button onClick={onClick} style={{
      textAlign:'left', cursor:'pointer', background:'transparent',
      border:`1px dashed ${T.border}`, borderRadius:10, padding:'14px 16px',
      display:'flex', flexDirection:'column', gap:6, fontFamily:T.font,
      transition:'all .12s', minHeight: 84,
    }}
    onMouseEnter={e => { e.currentTarget.style.background = T.card; e.currentTarget.style.borderColor = T.subtle; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = T.border; }}
    >
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:11, fontWeight:700, letterSpacing:0.5, color:T.subtle, textTransform:'uppercase'}}>
          {trade.label}
        </div>
        <Icon name="plus" size={13} color={T.subtle}/>
      </div>
      <div style={{fontSize:12, color:T.subtle, fontWeight:500}}>No expenses yet</div>
    </button>
  );
}

function TradeCompact({ trades, onPick }) {
  const active = trades.filter(t => t.amount > 0);
  const empty  = trades.filter(t => t.amount === 0);
  const max = Math.max(...active.map(t => t.amount), 1);
  return (
    <div style={{display:'flex', flexDirection:'column', gap:8}}>
      <div style={{
        background:T.card, border:`1px solid ${T.border}`, borderRadius:10, overflow:'hidden',
      }}>
        {active.map((t, i) => (
          <button key={t.id} onClick={() => onPick?.(t)} style={{
            display:'grid', gridTemplateColumns:'auto 1fr 180px 80px 16px', gap:14, alignItems:'center',
            width:'100%', textAlign:'left', cursor:'pointer', padding:'12px 16px',
            background:'transparent', border:'none',
            borderTop: i ? `1px solid ${T.hairline}` : 'none',
            fontFamily:T.font, transition:'background .12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.bg; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{width:8, height:8, borderRadius:2, background:t.color}}/>
            <span style={{fontSize:13.5, fontWeight:600, color:T.text}}>{t.label}</span>
            <div style={{position:'relative', height:6, background:T.hairline, borderRadius:99}}>
              <div style={{position:'absolute', inset:0, width:`${(t.amount/max)*100}%`, background:t.color, borderRadius:99}}/>
            </div>
            <span style={{fontSize:13.5, fontWeight:700, color:T.text, fontVariantNumeric:'tabular-nums', textAlign:'right'}}>{inrK(t.amount)}</span>
            <Icon name="chevRt" size={14} color={T.subtle}/>
          </button>
        ))}
      </div>
      {empty.length > 0 && (
        <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
          <span style={{fontSize:11.5, color:T.subtle, fontWeight:600, alignSelf:'center', marginRight:4, textTransform:'uppercase', letterSpacing:0.4}}>
            Not used:
          </span>
          {empty.map(t => (
            <button key={t.id} onClick={() => onPick?.(t)} style={{
              padding:'4px 10px', borderRadius:99, border:`1px dashed ${T.border}`,
              background:'transparent', color:T.subtle, fontSize:11.5, fontWeight:600,
              fontFamily:T.font, cursor:'pointer',
            }}>{t.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function TradeChips({ trades, onPick }) {
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
      {trades.map(t => {
        const hasData = t.amount > 0;
        return (
          <button key={t.id} onClick={() => onPick?.(t)} style={{
            display:'inline-flex', alignItems:'center', gap:8,
            padding:'7px 12px', borderRadius:99, fontFamily:T.font,
            background: hasData ? T.card : 'transparent',
            border: hasData ? `1px solid ${T.border}` : `1px dashed ${T.border}`,
            color: hasData ? T.text : T.subtle,
            cursor:'pointer', transition:'all .12s',
          }}>
            <span style={{
              width:8, height:8, borderRadius:2,
              background: hasData ? t.color : T.border,
            }}/>
            <span style={{fontSize:12.5, fontWeight:600}}>{t.label}</span>
            {hasData ? (
              <>
                <span style={{fontSize:12.5, fontWeight:700, color:T.text, fontVariantNumeric:'tabular-nums'}}>{inrK(t.amount)}</span>
                <span style={{fontSize:11, color:T.subtle, fontWeight:500, fontVariantNumeric:'tabular-nums'}}>· {t.records}</span>
              </>
            ) : (
              <Icon name="plus" size={11} color={T.subtle}/>
            )}
          </button>
        );
      })}
    </div>
  );
}

Object.assign(window, { TradeStrip, TradeDetailed, TradeCompact, TradeChips, TradeCard, TradeAddCard });
