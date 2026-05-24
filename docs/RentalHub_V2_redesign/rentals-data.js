// Rentals seed data + helpers.
// Mirrors the Aesta domain: rental items (with size variants + rate type),
// rental vendors (often the same shops as material vendors), and orders
// across the 5-stage collapsed lifecycle.

const R_SITES = [
  { id: 'srinivasan', short: 'SHS', name: 'Srinivasan House & Shop', city: 'Pudukkottai', accent: '#2563eb' },
  { id: 'padmavathy', short: 'PA',  name: 'Padmavathy Apartments',   city: 'Pudukkottai', accent: '#ec4899' },
];

const R_VENDORS = [
  { id: 'karuppaiah-earth', name: 'Karuppaiah Earthmovers',   kind: 'Heavy machinery', rating: 4.5, phone: '+91 98432 11244' },
  { id: 'sri-scaffold',     name: 'Sri Scaffolding Works',    kind: 'Scaffolding',     rating: 4.6, phone: '+91 99440 22788' },
  { id: 'thanikai-mixers',  name: 'Thanikai Mixers & Tools',  kind: 'Site equipment',  rating: 4.4, phone: '+91 94432 65501' },
  { id: 'arm-tools',        name: 'ARM Tools Rental',         kind: 'Hand tools',      rating: 4.3, phone: '+91 90033 77890' },
  { id: 'pinveedu',         name: 'Pinveedu Centring',        kind: 'Centring',        rating: 4.7, phone: '+91 98765 43210' },
];

// Rental items catalog — equipment + scaffolding + centring + tools.
// Each item has a "rateType" (hourly or daily) and optionally size variants.
const R_ITEMS = [
  { id:'jcb',         name:'JCB 3DX',           cat:'Heavy machinery',  unit:'unit',  rateType:'hourly', defaultRate: 950 },
  { id:'mixer',       name:'Concrete Mixer',     cat:'Site equipment',   unit:'unit',  rateType:'daily',  defaultRate: 850 },
  { id:'vibrator',    name:'Needle Vibrator',    cat:'Site equipment',   unit:'unit',  rateType:'daily',  defaultRate: 450 },
  { id:'breaker',     name:'Breaker · Heavy',    cat:'Heavy machinery',  unit:'unit',  rateType:'daily',  defaultRate: 1800 },
  { id:'scaffold',    name:'Scaffolding bay',    cat:'Scaffolding',      unit:'bay',   rateType:'daily',
    variants:[
      { id:'8ft',  label:'8 ft',  rate: 28 },
      { id:'10ft', label:'10 ft', rate: 34 },
      { id:'12ft', label:'12 ft', rate: 42 },
    ]},
  { id:'centring',    name:'Centring pipe',      cat:'Centring',         unit:'piece', rateType:'daily',
    variants:[
      { id:'std', label:'Standard',  rate: 12 },
    ]},
  { id:'shutter',     name:'Shuttering plate',   cat:'Centring',         unit:'piece', rateType:'daily',  defaultRate: 18 },
  { id:'drill',       name:'Cordless drill',     cat:'Hand tools',       unit:'unit',  rateType:'daily',  defaultRate: 220 },
];

// 5-stage collapsed lifecycle for the row pipeline.
const R_STAGES = ['request', 'confirm', 'active', 'returned', 'settled'];
const R_STAGE_LABELS = { request:'Request', confirm:'Confirm', active:'Active', returned:'Returned', settled:'Settled' };

// Internal status taxonomy (matches the real app) — collapses to one of the
// 5 visible stages for the pipeline.
function stageFor(status) {
  if (status === 'pending' || status === 'approved' || status === 'draft') return 'request';
  if (status === 'confirmed') return 'confirm';
  if (status === 'active' || status === 'partially_returned') return 'active';
  if (status === 'completed') return 'returned';
  if (status === 'settled') return 'settled';
  if (status === 'cancelled') return 'cancelled';
  return 'request';
}

// Today reference for the prototype's "now" — pin to 23 May 2026 so seed
// dates have stable "overdue 3d" / "active 8d" relationships.
const R_TODAY = new Date('2026-05-23');

const R_SEED_ORDERS = [
  // 1) Pending request — awaiting approval
  {
    id: 'RO-260522-Q4A', site: 'srinivasan', section: 'Foundation',
    status: 'pending', kind: 'own', requestedBy: 'ajith', requestedAt: '2026-05-22',
    vendor: 'karuppaiah-earth',
    items: [
      { item:'breaker', variant:null, qty:1, rateType:'daily', dailyRate: 1800, qtyReturned:0 },
    ],
    expectedStart: '2026-05-25', expectedEnd: '2026-05-28',
    notes: 'For old chimney demolition. Need 3 days.',
  },

  // 2) Confirmed — PO sent, awaiting delivery
  {
    id: 'RO-260520-MIX', site: 'srinivasan', section: 'Slab pour',
    status: 'confirmed', kind: 'own', requestedBy: 'ajith', requestedAt: '2026-05-20',
    approvedBy: 'admin', approvedAt: '2026-05-20',
    vendor: 'thanikai-mixers',
    items: [
      { item:'mixer', variant:null, qty:1, rateType:'daily', dailyRate: 850, qtyReturned:0 },
      { item:'vibrator', variant:null, qty:2, rateType:'daily', dailyRate: 450, qtyReturned:0 },
    ],
    expectedStart: '2026-05-24', expectedEnd: '2026-05-30',
    transportIn: { by:'vendor', cost: 0 },
  },

  // 3) Active — JCB on site, ticking
  {
    id: 'RO-260514-JCB', site: 'srinivasan', section: 'Site clearing',
    status: 'active', kind: 'own', requestedBy: 'ajith', requestedAt: '2026-05-13',
    approvedBy: 'admin', approvedAt: '2026-05-13',
    vendor: 'karuppaiah-earth',
    items: [
      { item:'jcb', variant:null, qty:1, rateType:'hourly', hourlyRate: 950, qtyReturned:0, hoursLogged: 56 },
    ],
    actualStart: '2026-05-14', expectedEnd: '2026-05-24',
    transportIn: { by:'company', cost: 1200 },
    advances: [ { date:'2026-05-14', amount: 20000, mode:'upi', payer:'office', note:'Mobilization advance' } ],
  },

  // 4) Active + OVERDUE — expected back 20 May, today is 23 May
  {
    id: 'RO-260502-SCF', site: 'srinivasan', section: 'External plaster',
    status: 'active', kind: 'group', requestedBy: 'ajith', requestedAt: '2026-05-01',
    approvedBy: 'admin', approvedAt: '2026-05-02',
    vendor: 'sri-scaffold',
    items: [
      { item:'scaffold', variant:'10ft', qty:60,  rateType:'daily', dailyRate: 34, qtyReturned: 0, sizeLabelSnapshot:'10 ft scaffolding bay' },
      { item:'scaffold', variant:'8ft',  qty:30,  rateType:'daily', dailyRate: 28, qtyReturned: 0, sizeLabelSnapshot:'8 ft scaffolding bay' },
    ],
    actualStart: '2026-05-03', expectedEnd: '2026-05-20',
    transportIn: { by:'vendor', cost: 0 },
    advances: [ { date:'2026-05-03', amount: 15000, mode:'cash', payer:'site', note:'Pickup advance' } ],
  },

  // 5) Partially returned — some scaffolding back, rest still ticking
  {
    id: 'RO-260420-CTR', site: 'srinivasan', section: 'First-floor slab',
    status: 'partially_returned', kind: 'own', requestedBy: 'ajith', requestedAt: '2026-04-19',
    approvedBy: 'admin', approvedAt: '2026-04-19',
    vendor: 'pinveedu',
    items: [
      { item:'centring', variant:'std', qty:200, rateType:'daily', dailyRate: 12, qtyReturned: 80,  sizeLabelSnapshot:'Centring pipe · Standard' },
      { item:'shutter',  variant:null,  qty:80,  rateType:'daily', dailyRate: 18, qtyReturned: 80 },
    ],
    actualStart: '2026-04-21', expectedEnd: '2026-05-26',
    transportIn: { by:'company', cost: 2400 },
    returns: [
      { date: '2026-05-15', items: [
        { item:'centring', variant:'std', qty: 80, condition: 'good' },
        { item:'shutter',  variant:null, qty: 80, condition: 'good' },
      ]},
    ],
    advances: [ { date:'2026-04-21', amount: 8000, mode:'cash', payer:'site' } ],
  },

  // 6) Completed — all returned, awaiting settlement (vendor + transport out)
  {
    id: 'RO-260410-VIB', site: 'srinivasan', section: 'Plinth concrete',
    status: 'completed', kind: 'own', requestedBy: 'ajith', requestedAt: '2026-04-09',
    approvedBy: 'admin', approvedAt: '2026-04-09',
    vendor: 'thanikai-mixers',
    items: [
      { item:'vibrator', variant:null, qty:2, rateType:'daily', dailyRate: 450, qtyReturned: 2 },
    ],
    actualStart: '2026-04-10', actualEnd: '2026-04-18', expectedEnd: '2026-04-18',
    transportIn: { by:'company', cost: 600 },
    transportOut: { by:'company', cost: 600 },
    returns: [ { date: '2026-04-18', items: [{ item:'vibrator', variant:null, qty:2, condition:'good' }] } ],
    advances: [],
    settlements: {
      vendor: { status: 'pending', gross: 8100 },         // 2 × ₹450 × 9 days
      transportIn:  { status: 'settled', amount: 600, mode:'cash', payer:'site', settledAt:'2026-04-10' },
      transportOut: { status: 'pending', amount: 600 },
    },
  },

  // 7) Settled — fully done
  {
    id: 'RO-260302-DRL', site: 'srinivasan', section: 'Carpentry',
    status: 'settled', kind: 'own', requestedBy: 'ajith', requestedAt: '2026-03-01',
    approvedBy: 'admin', approvedAt: '2026-03-01',
    isHistorical: true, vendor: 'arm-tools',
    items: [
      { item:'drill', variant:null, qty:2, rateType:'daily', dailyRate: 220, qtyReturned: 2, sku:'DRL-0014' },
    ],
    actualStart: '2026-03-03', actualEnd: '2026-03-10', expectedEnd: '2026-03-10',
    transportIn: { by:'company', cost: 350 }, transportOut: { by:'company', cost: 350 },
    returns: [ { date:'2026-03-10', items: [{ item:'drill', variant:null, qty:2, condition:'good' }] } ],
    advances: [ { date:'2026-03-03', amount: 1000, mode:'upi', payer:'wallet:ajith', note:'pickup advance' } ],
    settlements: {
      vendor: { status:'settled', ref:'RSET-260302-001', gross: 3520, advance: 1000, negotiated: 2900, savings: 620, mode:'upi', payer:'wallet:ajith', settledAt:'2026-03-12',
                receipts: { bill: true, payment: true } },
      transportIn:  { status:'settled', ref:'RSET-260302-002', amount: 350, mode:'cash', payer:'site', settledAt:'2026-03-03', receipts: { bill: false, payment: false } },
      transportOut: { status:'settled', ref:'RSET-260311-001', amount: 350, mode:'cash', payer:'site', settledAt:'2026-03-11', receipts: { bill: false, payment: false } },
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────
window.R_SITES = R_SITES;
window.R_VENDORS = R_VENDORS;
window.R_ITEMS = R_ITEMS;
window.R_STAGES = R_STAGES;
window.R_STAGE_LABELS = R_STAGE_LABELS;
window.R_TODAY = R_TODAY;
window.R_SEED_ORDERS = R_SEED_ORDERS;
window.stageFor = stageFor;

window.R = {
  site:   (id) => R_SITES.find(s => s.id === id),
  vendor: (id) => R_VENDORS.find(v => v.id === id),
  item:   (id) => R_ITEMS.find(i => i.id === id),
  variantLabel: (item, vid) => {
    const it = R_ITEMS.find(i => i.id === item);
    if (!it || !vid) return null;
    return (it.variants || []).find(v => v.id === vid)?.label;
  },

  // Days elapsed since actual start, capped at today (or actualEnd if completed).
  daysElapsed: (o) => {
    if (!o.actualStart) return 0;
    const start = new Date(o.actualStart).getTime();
    const end = o.actualEnd ? new Date(o.actualEnd).getTime() : R_TODAY.getTime();
    let days = Math.max(0, Math.floor((end - start) / (24*60*60*1000)) + 1);
    if (o.excludeStartDate && days > 0) days -= 1;
    return days;
  },

  // Returns true if expectedEnd < today AND not yet returned/settled.
  isOverdue: (o) => {
    if (!['active','partially_returned'].includes(o.status)) return false;
    return new Date(o.expectedEnd).getTime() < R_TODAY.getTime();
  },
  overdueDays: (o) => {
    if (!R.isOverdue(o)) return 0;
    return Math.floor((R_TODAY.getTime() - new Date(o.expectedEnd).getTime()) / (24*60*60*1000));
  },

  // Sum of line × rate × days. For partially_returned items uses qty-outstanding
  // for the days after the return date (simplified — exact math uses per-return events).
  accruedCost: (o) => {
    if (!o.actualStart) return 0;
    const days = R.daysElapsed(o);
    return o.items.reduce((a, ln) => {
      const ratePerDay = ln.rateType === 'hourly'
        ? (ln.hourlyRate * (ln.hoursLogged || 0)) / Math.max(1, days)
        : ln.dailyRate;
      const totalQty = ln.qty;
      const returnedQty = ln.qtyReturned || 0;
      // simplified: for prototype, full qty over full days (real app uses returns to taper)
      const effectiveQty = o.status === 'partially_returned'
        ? ((totalQty + (totalQty - returnedQty)) / 2)  // avg
        : (returnedQty >= totalQty ? totalQty : totalQty);
      if (ln.rateType === 'hourly') return a + ln.hourlyRate * (ln.hoursLogged || 0);
      return a + (ln.dailyRate * effectiveQty * days);
    }, 0);
  },

  totalAdvances: (o) => (o.advances || []).reduce((a,x) => a+x.amount, 0),

  balanceDue: (o) => {
    // Use settled values when available; else accrued − advances.
    if (o.settlements?.vendor?.status === 'settled') {
      const settled = (o.settlements.vendor.negotiated || 0) - (o.settlements.vendor.advance || 0);
      const tIn  = o.settlements?.transportIn?.status  === 'pending' ? (o.settlements.transportIn.amount  || 0) : 0;
      const tOut = o.settlements?.transportOut?.status === 'pending' ? (o.settlements.transportOut.amount || 0) : 0;
      return settled + tIn + tOut;
    }
    const accrued = R.accruedCost(o);
    return accrued - R.totalAdvances(o);
  },

  qtyOutstanding: (o) => o.items.reduce((a, ln) => a + (ln.qty - (ln.qtyReturned || 0)), 0),

  // What's the next blocking action for this order?
  nextAction: (o) => {
    if (o.status === 'pending')              return { who:'admin',    label:'Approve' };
    if (o.status === 'approved' || o.status === 'draft') return { who:'admin', label:'Confirm PO' };
    if (o.status === 'confirmed')            return { who:'engineer', label:'Verify delivery' };
    if (o.status === 'active' || o.status === 'partially_returned')
                                              return { who:'engineer', label:'Record return' };
    if (o.status === 'completed') {
      const s = o.settlements || {};
      if (!s.vendor || s.vendor.status === 'pending')           return { who:'office',   label:'Settle vendor' };
      if (s.transportIn  && s.transportIn.status  === 'pending') return { who:'office',  label:'Settle transport in' };
      if (s.transportOut && s.transportOut.status === 'pending') return { who:'office',  label:'Settle transport out' };
    }
    return null;
  },

  // Pipeline stage for a given order.
  stage: (o) => stageFor(o.status),
};
