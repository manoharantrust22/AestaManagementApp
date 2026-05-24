// Materials Redesign root — design canvas presenting the redesigned IA across
// desktop + mobile artboards.

function MatApp() {
  return (
    <DesignCanvas>
      <DCSection
        id="materials-redesign"
        title="Materials · IA redesign"
        subtitle="Replacing 6 disconnected pages (Requests / POs / Delivery / Settlement / Inter-Site / Expenses) with one unified flow."
      >
        <DCArtboard id="hub-desktop" label="① Material Hub · desktop" width={1440} height={1180}>
          <div style={{display:'flex', height:'100%'}}>
            <MatSidebar activeKey="hub"/>
            <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column'}}>
              <MatHub/>
            </div>
          </div>
        </DCArtboard>

        <DCArtboard id="hub-expanded" label="② Thread · expanded detail" width={1440} height={1180}>
          <div style={{display:'flex', height:'100%'}}>
            <MatSidebar activeKey="hub"/>
            <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column'}}>
              <MatHubExpanded/>
            </div>
          </div>
        </DCArtboard>

        <DCArtboard id="intersite-desktop" label="③ Inter-Site Settlement" width={1440} height={1180}>
          <div style={{display:'flex', height:'100%'}}>
            <MatSidebar activeKey="inter"/>
            <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column'}}>
              <MatInterSite/>
            </div>
          </div>
        </DCArtboard>
      </DCSection>

      <DCSection
        id="mobile-engineer"
        title="Mobile · Site Engineer"
        subtitle="On-site, daily, photo-friendly. Long lists & filters live on desktop — mobile is for fast micro-tasks."
      >
        <DCArtboard id="m-today"   label="① Today" width={390} height={844}>
          <MatMobile tab="today"/>
        </DCArtboard>
        <DCArtboard id="m-deliver" label="② Record delivery" width={390} height={844}>
          <MatMobile tab="deliver"/>
        </DCArtboard>
        <DCArtboard id="m-usage"   label="③ Log usage" width={390} height={844}>
          <MatMobile tab="usage"/>
        </DCArtboard>
        <DCArtboard id="m-wallet"  label="④ Wallet settle" width={390} height={844}>
          <MatMobile tab="wallet"/>
        </DCArtboard>
      </DCSection>

      {/* Design notes */}
      <DCPostIt top={40} left={40} width={260} rotate={-2}>
        <b>The core problem</b><br/>
        6 disconnected pages force users to mentally
        stitch the lifecycle together. We replace
        them with <b>one Hub</b> where each material
        request is a <b>thread</b> showing its whole
        journey at a glance.
      </DCPostIt>
      <DCPostIt top={300} left={40} width={260} rotate={1.6}>
        Each row carries its <b>own pipeline</b>.
        No more global "step 3 of 5" indicator — the
        progress is per-thread, where it matters.
      </DCPostIt>
      <DCPostIt top={560} left={40} width={260} rotate={-1.5}>
        <b>Group vs Own</b> visible at first glance
        via the left edge band + chip. Currently
        these blend into the same table; site eng's
        complain they can't tell whose money funded
        what batch.
      </DCPostIt>
      <DCPostIt top={820} left={40} width={260} rotate={2}>
        <b>Advance POs</b> get a batch progress bar
        in the row itself. Today, advance vs regular
        looks identical until you open the PO detail.
      </DCPostIt>

      {/* Mobile notes — placed below the desktop row, alongside the mobile artboards */}
      <DCPostIt top={1500} left={40} width={260} rotate={-1.5}>
        <b>Mobile = actions, not pages.</b> Instead
        of porting the desktop table to a phone,
        the site engineer gets a Today view that
        surfaces exactly what they need to do this
        shift. Three taps for a delivery record.
      </DCPostIt>
      <DCPostIt top={1760} left={40} width={260} rotate={1.8}>
        <b>Usage stepper</b> replaces a form. One
        screen, one finger, four open batches —
        and you're done logging today's work in
        under a minute.
      </DCPostIt>
      <DCPostIt top={2020} left={40} width={260} rotate={-2}>
        Wallet settle is one tap from anywhere.
        Engineer's wallet balance lives in the
        bottom-tab so it's never far away.
      </DCPostIt>
    </DesignCanvas>
  );
}

// Pre-expanded variant — shows what a thread looks like opened.
function MatHubExpanded() {
  const [filter, setFilter] = React.useState('all');
  const expanded = 'MR-260514-7TII'; // the advance/group PO — most interesting
  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', background: T.bg}}>
      <MatTopBar breadcrumb={['Materials', 'Hub', 'MR-260514-7TII']}/>
      <div style={{flex:1, overflow:'auto', padding:'18px 22px 80px'}}>
        <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom: 16}}>
          <div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
              <h1 style={{margin:0, fontSize:22, fontWeight:700, letterSpacing:-0.4}}>Material Hub</h1>
              <Badge tone="primary">47 threads</Badge>
            </div>
            <div style={{fontSize:13, color:T.muted}}>Every material from request to expense, on one surface.</div>
          </div>
          <div style={{display:'flex', gap:8}}>
            <Btn variant="secondary" leading={<Icon name="filter" size={13}/>}>Filter</Btn>
            <Btn variant="secondary" leading={<Icon name="download" size={13}/>}>Export</Btn>
            <Btn variant="primary"   leading={<Icon name="plus" size={13}/>}>New request</Btn>
          </div>
        </div>

        <MatKpiStrip/>

        <div style={{display:'flex', gap:6, marginTop:22, marginBottom:14}}>
          <FilterChip active count={M_THREADS.length}>All</FilterChip>
          <FilterChip count={6} accent="warn"><Icon name="bell" size={11} color="currentColor"/> Needs action</FilterChip>
          <FilterChip count={14}><Icon name="home" size={11} color="currentColor"/> Own site</FilterChip>
          <FilterChip count={33} accent="pink"><Icon name="link" size={11} color="currentColor"/> Group</FilterChip>
          <FilterChip count={2} accent="warn"><Icon name="calendar" size={11} color="currentColor"/> Advance</FilterChip>
        </div>

        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {M_THREADS.map(t => (
            <MatThreadRow key={t.id} t={t}
              selected={t.id === expanded}
              onSelect={() => {}}
              density="comfortable"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<MatApp/>);
