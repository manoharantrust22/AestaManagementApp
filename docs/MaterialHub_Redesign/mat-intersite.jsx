// Inter-site settlement — the trickiest concept in the current flow.
// Reimagined as a debt ledger between sites in the cluster.
// Replaces the "Inter-Site Settlement" page in the production app.
//
// Key idea: site-to-site debt is exactly like a wallet ledger but at the
// site level. Show net balance prominently, then break down by material
// batch with usage progress so users see *why* they owe what they owe.

function MatInterSite() {
  const data = M_INTERSITE;
  const me = M.site(data.thisSite);
  const other = M.site('padmavathy');
  const owesNet = data.net < 0;

  // Synthesize "share" rows from threads with interSiteUsage
  const shareRows = M_THREADS
    .filter(t => t.kind === 'group' && t.interSiteUsage)
    .flatMap(t => t.interSiteUsage.map(u => ({ thread: t, usage: u })))
    .filter(r => r.usage.site !== r.thread.po.payer);

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', background: T.bg}}>
      <MatTopBar breadcrumb={['Materials', 'Inter-site']}/>

      <div style={{flex:1, overflow:'auto', padding:'18px 22px 80px'}}>
        <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom: 16}}>
          <div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
              <h1 style={{margin:0, fontSize:22, fontWeight:700, letterSpacing:-0.4}}>Inter-Site Settlement</h1>
              <Badge tone="pink" dot>Pudukkottai Cluster</Badge>
            </div>
            <div style={{fontSize:13, color:T.muted}}>How material costs reconcile between sites that share group purchases.</div>
          </div>
          <Btn variant="primary" leading={<Icon name="check" size={13}/>}>Net settle ₹30,964</Btn>
        </div>

        {/* The "balance" card — like a wallet's net balance, but between sites */}
        <Card padding={0} style={{overflow:'hidden', marginBottom:16}}>
          <div style={{
            background:'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color:'#fff', padding:'24px 28px', display:'grid',
            gridTemplateColumns: '1fr auto 1fr', alignItems:'center', gap:24,
          }}>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:11, opacity:0.6, letterSpacing:0.6, fontWeight:600, textTransform:'uppercase', marginBottom:4}}>
                You owe
              </div>
              <div style={{fontSize:32, fontWeight:800, fontFamily:T.mono, letterSpacing:-0.8, color:'#f87171'}}>
                {inr(data.iOwe)}
              </div>
              <div style={{fontSize:11, opacity:0.7, marginTop:4}}>21 records · for materials others bought</div>
            </div>

            <div style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:6,
              padding:'0 8px',
            }}>
              <div style={{
                width:44, height:44, borderRadius:'50%',
                background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <Icon name="link" size={20} color="#fff"/>
              </div>
              <div style={{fontSize:9.5, opacity:0.5, letterSpacing:0.6, fontWeight:700, textTransform:'uppercase'}}>net</div>
              <div style={{fontSize:18, fontWeight:800, fontFamily:T.mono, color: owesNet ? '#f87171' : '#34d399'}}>
                {owesNet ? '−' : '+'}{inrK(Math.abs(data.net))}
              </div>
            </div>

            <div>
              <div style={{fontSize:11, opacity:0.6, letterSpacing:0.6, fontWeight:600, textTransform:'uppercase', marginBottom:4}}>
                Others owe you
              </div>
              <div style={{fontSize:32, fontWeight:800, fontFamily:T.mono, letterSpacing:-0.8, color:'#34d399'}}>
                {inr(data.othersOwe)}
              </div>
              <div style={{fontSize:11, opacity:0.7, marginTop:4}}>12 records · for materials you bought</div>
            </div>
          </div>

          {/* Sites in the loop */}
          <div style={{padding:'16px 28px', display:'flex', alignItems:'center', gap:14, background:'#fff', borderTop:`1px solid ${T.border}`}}>
            <SiteChip site={me}/>
            <Icon name="arrowLt" size={16} color={T.subtle}/>
            <Icon name="arrowRt" size={16} color={T.subtle}/>
            <SiteChip site={other}/>
            <div style={{flex:1}}/>
            <span style={{fontSize:11.5, color:T.muted}}>Net offsets ₹18,554. Srinivasan pays Padmavathy ₹30,964.29.</span>
          </div>
        </Card>

        {/* Two-pane breakdown — bold visual: who owes whom */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18}}>
          {/* You owe */}
          <Card padding={0} style={{overflow:'hidden'}}>
            <div style={{padding:'14px 16px', background:'#fef2f2', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <Icon name="arrowRt" size={14} color={T.danger}/>
                <h3 style={{margin:0, fontSize:13, fontWeight:700, color:T.text}}>You owe</h3>
                <span style={{fontSize:11, color:T.danger, fontWeight:700, fontFamily:T.mono}}>{inr(data.iOwe)}</span>
              </div>
              <span style={{fontSize:10.5, color:T.muted, fontWeight:600}}>21 batches consumed</span>
            </div>
            <div>
              {shareRows.filter(r => r.usage.site === 'srinivasan').slice(0,5).map((r, i) => {
                const mat = M.material(r.thread.material);
                return (
                  <div key={i} style={{
                    padding:'10px 16px', borderBottom: i < 4 ? `1px solid ${T.hairline}` : 'none',
                    display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center',
                  }}>
                    <div style={{minWidth:0}}>
                      <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
                        <div style={{fontSize:12.5, fontWeight:700, color:T.text}}>{mat.name}</div>
                        <Badge tone="neutral">{r.usage.used} {r.thread.unit}</Badge>
                      </div>
                      <div style={{fontSize:10.5, color:T.muted, fontFamily:T.mono}}>
                        Batch {r.thread.inventory?.batch} · paid by Padmavathy
                      </div>
                    </div>
                    <div style={{fontSize:13, fontFamily:T.mono, fontWeight:700, color:T.danger}}>
                      −{inr(r.usage.value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Others owe you */}
          <Card padding={0} style={{overflow:'hidden'}}>
            <div style={{padding:'14px 16px', background:'#ecfdf5', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <Icon name="arrowLt" size={14} color={T.success}/>
                <h3 style={{margin:0, fontSize:13, fontWeight:700, color:T.text}}>Others owe you</h3>
                <span style={{fontSize:11, color:T.success, fontWeight:700, fontFamily:T.mono}}>{inr(data.othersOwe)}</span>
              </div>
              <span style={{fontSize:10.5, color:T.muted, fontWeight:600}}>12 batches consumed</span>
            </div>
            <div>
              {shareRows.filter(r => r.usage.site === 'padmavathy').slice(0,5).map((r, i) => {
                const mat = M.material(r.thread.material);
                return (
                  <div key={i} style={{
                    padding:'10px 16px', borderBottom: i < 4 ? `1px solid ${T.hairline}` : 'none',
                    display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center',
                  }}>
                    <div style={{minWidth:0}}>
                      <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
                        <div style={{fontSize:12.5, fontWeight:700, color:T.text}}>{mat.name}</div>
                        <Badge tone="neutral">{r.usage.used} {r.thread.unit}</Badge>
                      </div>
                      <div style={{fontSize:10.5, color:T.muted, fontFamily:T.mono}}>
                        Batch {r.thread.inventory?.batch} · paid by Srinivasan
                      </div>
                    </div>
                    <div style={{fontSize:13, fontFamily:T.mono, fontWeight:700, color:T.success}}>
                      +{inr(r.usage.value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Active batches — the running record */}
        <Card padding={0}>
          <div style={{padding:'14px 18px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div>
              <h3 style={{margin:0, fontSize:14, fontWeight:700, color:T.text}}>Shared batches · still in use</h3>
              <div style={{fontSize:11.5, color:T.muted, marginTop:2}}>
                Inter-site debt accrues here, batch by batch. Settles automatically when batches finish.
              </div>
            </div>
            <Btn variant="ghost" leading={<Icon name="grid" size={12}/>} size="sm">All 33 batches</Btn>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)'}}>
            {M_THREADS.filter(t => t.kind === 'group' && t.inventory && t.inventory.remaining > 0).map((t, i) => (
              <SharedBatchCard t={t} key={t.id} last={i >= M_THREADS.filter(t=>t.kind==='group'&&t.inventory&&t.inventory.remaining>0).length-2}/>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SiteChip({ site }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:8, padding:'6px 12px',
      background:'#fff', borderRadius:99, border:`1.5px solid ${site.accent}33`,
    }}>
      <div style={{
        width:24, height:24, borderRadius:'50%', background:site.accent, color:'#fff',
        display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:10, letterSpacing:0.3,
      }}>{site.short}</div>
      <div style={{fontSize:12.5, fontWeight:700, color:T.text}}>{site.name}</div>
    </div>
  );
}

function SharedBatchCard({ t, last }) {
  const mat = M.material(t.material);
  const isSpot = t.purchaseType === 'spot';
  // Spot threads carry vendor/payer info on `t.spot` and `t.site`, not `t.po`.
  // Fall back accordingly so this card renders cleanly for both kinds.
  const vendor = isSpot ? { name: t.spot.vendorName } : M.vendor(t.po.vendor);
  const payer  = isSpot ? M.site(t.site) : M.site(t.po.payer);
  const amount = isSpot ? t.spot.amount : t.po.amount;
  const pct = (t.inventory.used / t.inventory.received);

  return (
    <div style={{
      padding:'14px 18px',
      borderRight: `1px solid ${T.hairline}`,
      borderBottom: !last ? `1px solid ${T.hairline}` : 'none',
    }}>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, marginBottom:8}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:10, fontFamily:T.mono, color:T.subtle, letterSpacing:0.3, marginBottom:3}}>
            {t.inventory.batch}
            {t.advance && <span style={{marginLeft:8, color:T.warn, fontWeight:700}}>· ADVANCE</span>}
          </div>
          <div style={{fontSize:14, fontWeight:700, color:T.text}}>
            {mat.name} <span style={{color:T.muted, fontWeight:500}}>· {t.inventory.received} {t.unit}</span>
          </div>
          <div style={{fontSize:11, color:T.muted, marginTop:2}}>
            {vendor.name} · paid by <span style={{color: payer.accent, fontWeight:700}}>{payer.short}</span>
          </div>
        </div>
        <div style={{fontSize:11, color:T.muted, textAlign:'right'}}>
          <div style={{fontSize:13, fontFamily:T.mono, fontWeight:700, color:T.text}}>{inr(amount)}</div>
          <div>{Math.round(pct*100)}% used</div>
        </div>
      </div>

      {/* Stacked usage bar */}
      <div style={{
        height: 10, borderRadius: 5, background: T.hairline, overflow:'hidden', display:'flex',
      }}>
        {t.interSiteUsage.map((u, i) => {
          const site = M.site(u.site);
          return (
            <div key={i} title={`${site.name}: ${u.used} ${t.unit}`} style={{
              width: `${(u.used / t.inventory.received) * 100}%`,
              background: site.accent,
            }}/>
          );
        })}
      </div>

      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8, gap:8}}>
        <div style={{display:'flex', gap:10}}>
          {t.interSiteUsage.map((u, i) => {
            const site = M.site(u.site);
            return (
              <div key={i} style={{display:'flex', alignItems:'center', gap:5}}>
                <span style={{width:8, height:8, borderRadius:2, background:site.accent}}/>
                <span style={{fontSize:10.5, color:T.muted, fontWeight:600}}>{site.short}</span>
                <span style={{fontSize:10.5, fontFamily:T.mono, color:T.text, fontWeight:700}}>{u.used}</span>
              </div>
            );
          })}
          <div style={{display:'flex', alignItems:'center', gap:5}}>
            <span style={{width:8, height:8, borderRadius:2, background:T.hairline}}/>
            <span style={{fontSize:10.5, color:T.subtle, fontWeight:600}}>Unused</span>
            <span style={{fontSize:10.5, fontFamily:T.mono, color:T.subtle, fontWeight:700}}>{t.inventory.remaining}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MatInterSite, SiteChip, SharedBatchCard });
