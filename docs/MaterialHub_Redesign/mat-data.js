// Materials redesign — fictional but realistic data tracking the full
// lifecycle: Request → PO → Delivery → Settlement → Inventory → Usage → Expense.
// Two sites (Srinivasan House & Shop and Padmavathy Apartments) in a single
// "Pudukkottai Cluster" group so we can show inter-site settlement.

const M_SITES = [
  { id: 'srinivasan', short: 'SHS', name: 'Srinivasan House & Shop', city: 'Pudukkottai', accent: '#2563eb' },
  { id: 'padmavathy', short: 'PA',  name: 'Padmavathy Apartments',   city: 'Pudukkottai', accent: '#ec4899' },
];
const M_GROUP = { id: 'pkt-cluster', name: 'Pudukkottai Cluster', members: ['srinivasan', 'padmavathy'] };

const M_ENGINEERS = [
  { id: 'ajith',  name: 'Ajith K.',     site: 'srinivasan', initials: 'AK' },
  { id: 'rajesh', name: 'Rajesh M.',    site: 'padmavathy', initials: 'RM' },
];

const M_VENDORS = [
  { id: 'pinveedu', name: 'Pinveedu Manivel',      kind: 'Aggregates',  rating: 4.8, lastPrice: '₹3,600/Tn', leadTime: '1d' },
  { id: 'rahman',   name: 'Rahman Timbers',         kind: 'Timber',      rating: 4.6, lastPrice: '—',        leadTime: '3d' },
  { id: 'fmbm',     name: 'Father & Mother Building Materials', kind: 'Cement', rating: 4.5, lastPrice: '₹290/bag', leadTime: '1d' },
  { id: 'sathish',  name: 'Sathish · Chettinad Cement', kind: 'Cement', rating: 4.7, lastPrice: '₹290/bag', leadTime: 'same day' },
  { id: 'karuppaiah', name: 'Karuppaiah Steel',     kind: 'Steel',       rating: 4.4, lastPrice: '₹62/kg',   leadTime: '2d' },
  { id: 'vairam',   name: 'Vairam Fly Ash Brick',    kind: 'Bricks',      rating: 4.3, lastPrice: '₹6.95/nos', leadTime: '4d' },
  { id: 'thirumala', name: 'Thirumala Electrical Company', kind: 'Electrical', rating: 4.6, lastPrice: '—', leadTime: '2d' },
];

const M_MATERIALS = [
  { id: 'ppc',       name: 'PPC Cement',        spec: '50kg bag · Chettinad', unit: 'bag',  cat: 'Cement' },
  { id: 'msand',     name: 'M Sand',            spec: 'Manufactured', unit: 'cft',  cat: 'Aggregates' },
  { id: 'psand',     name: 'P Sand',            spec: 'Plastering', unit: 'cft',  cat: 'Aggregates' },
  { id: 'flyash',    name: 'Fly Ash Bricks',    spec: '230×100×75', unit: 'nos',  cat: 'Bricks' },
  { id: 'chips',     name: 'Chips Jalli',       spec: 'Thool Jalli', unit: 'tonne', cat: 'Aggregates' },
  { id: 'tmt12',     name: 'TMT Rods 12mm',     spec: '500D', unit: 'kg',   cat: 'Steel' },
  { id: 'tmt8',      name: 'TMT Rods 8mm',      spec: '500D', unit: 'kg',   cat: 'Steel' },
  { id: 'teak',      name: 'Teak wood',         spec: 'Log · 2nd Quality', unit: 'piece', cat: 'Timber' },
  { id: 'switch',    name: 'Modular Switches',  spec: '6A · white', unit: 'nos', cat: 'Electrical' },
];

// Lifecycle stages — what a row can be in.
const M_STAGES = ['requested', 'approved', 'ordered', 'in-transit', 'delivered', 'settled', 'in-use', 'exhausted'];

// Threads — one per material request. Each is a row in the Material Hub.
// own/group + advance flags drive different rendering.
const M_THREADS = [
  {
    id: 'MR-260520-A8B2', site: 'srinivasan', section: 'Foundation', floor: 'Footing',
    priority: 'high', kind: 'group', advance: false, stage: 'in-use',
    material: 'chips', qty: 1, unit: 'tonne',
    requestedBy: 'ajith', requestedAt: '2026-05-20',
    needBy: '2026-05-22',
    po: { id: 'PO-MPH6MGGC', vendor: 'pinveedu', amount: 3600, qty: 1, expected: '2026-05-20', status: 'delivered', payer: 'srinivasan' },
    delivery: { date: '2026-05-20', recordedBy: 'ajith', quality: 'good', notes: 'Clean, no excess fines.' },
    settlement: { status: 'settled', amount: 3600, paidBy: 'office', settledAt: '2026-05-21' },
    inventory: { batch: 'MAT-260520-7A41', received: 1, used: 0.17, remaining: 0.83 },
    interSiteUsage: [ { site: 'srinivasan', used: 0.17, value: 612 } ],
  },
  {
    id: 'MR-260512-DBBO', site: 'srinivasan', section: 'Carpentry', floor: 'Ground Floor',
    priority: 'normal', kind: 'own', advance: false, stage: 'delivered',
    material: 'teak', qty: 33.781, unit: 'piece',
    requestedBy: 'ajith', requestedAt: '2026-05-12',
    needBy: '2026-05-14',
    po: { id: 'PO-MPDDWMMB', vendor: 'rahman', amount: 25375, qty: 33.781, expected: '2026-05-12', status: 'delivered', payer: 'srinivasan' },
    delivery: { date: '2026-05-12', recordedBy: 'ajith', quality: 'good', notes: '2nd quality logs as specified. Photographed.' },
    settlement: { status: 'pending', amount: 25375, paidBy: null },
  },
  {
    id: 'MR-260514-7TII', site: 'srinivasan', section: 'Masonry', floor: 'Third Floor',
    priority: 'normal', kind: 'group', advance: true, stage: 'in-use',
    material: 'ppc', qty: 200, unit: 'bag',
    requestedBy: 'ajith', requestedAt: '2026-05-14',
    needBy: '2026-05-30',
    po: { id: 'PO-MP7YYJGX', vendor: 'fmbm', amount: 61000, qty: 200, expected: '2026-05-14', status: 'partial', payer: 'padmavathy',
          advance: { totalPaid: 61000, batches: [{date:'2026-05-16', qty:50},{date:'2026-05-22', qty:50}], nextBatch: '2026-06-01' } },
    delivery: { date: '2026-05-16', recordedBy: 'ajith', quality: 'good' },
    settlement: { status: 'settled', amount: 61000, paidBy: 'padmavathy', settledAt: '2026-05-14' },
    inventory: { batch: 'MAT-260516-7A41', received: 200, used: 33, remaining: 167 },
    interSiteUsage: [
      { site: 'srinivasan', used: 12, value: 3660 },
      { site: 'padmavathy', used: 21, value: 6405 },
    ],
  },
  {
    id: 'MR-260506-9MM4', site: 'srinivasan', section: 'Plastering', floor: '—',
    priority: 'normal', kind: 'group', advance: false, stage: 'ordered',
    material: 'psand', qty: 3, unit: 'cft',
    requestedBy: 'ajith', requestedAt: '2026-05-06',
    needBy: '2026-05-08',
    po: { id: 'PO-MOZ9OZ7G', vendor: 'pinveedu', amount: 18000, qty: 3, expected: '2026-05-06', status: 'partial', payer: 'srinivasan' },
    delivery: null,
    settlement: { status: 'pending', amount: 18000, paidBy: null },
  },
  {
    id: 'MR-260424-CITO', site: 'srinivasan', section: 'Walls', floor: 'Ground Floor',
    priority: 'high', kind: 'own', advance: false, stage: 'requested',
    material: 'flyash', qty: 2000, unit: 'nos',
    requestedBy: 'ajith', requestedAt: '2026-04-24',
    needBy: '2026-05-01',
    po: null,
    note: 'Need by Friday — bricklayers booked. Vairam quoted ₹6.95/nos.',
  },
  {
    id: 'MR-260408-IRJ8', site: 'srinivasan', section: 'Slab', floor: 'Ground Floor',
    priority: 'high', kind: 'own', advance: false, stage: 'approved',
    material: 'ppc', qty: 80, unit: 'bag',
    requestedBy: 'ajith', requestedAt: '2026-04-08',
    needBy: '2026-04-12',
    po: null,
    approvedBy: 'admin', approvedAt: '2026-04-09',
  },
  {
    id: 'MR-260319-T89P', site: 'padmavathy', section: 'Beam', floor: 'Second Floor',
    priority: 'normal', kind: 'group', advance: false, stage: 'in-use',
    material: 'tmt12', qty: 480, unit: 'kg',
    requestedBy: 'rajesh', requestedAt: '2026-03-19',
    needBy: '2026-03-25',
    po: { id: 'PO-MMT89PXR', vendor: 'karuppaiah', amount: 53899, qty: 480, expected: '2026-03-25', status: 'delivered', payer: 'padmavathy' },
    delivery: { date: '2026-03-25', recordedBy: 'rajesh', quality: 'good' },
    settlement: { status: 'settled', amount: 53899, paidBy: 'padmavathy', settledAt: '2026-03-26' },
    inventory: { batch: 'MAT-260325-7A41', received: 480, used: 392, remaining: 88 },
    interSiteUsage: [
      { site: 'padmavathy', used: 320, value: 35932 },
      { site: 'srinivasan', used: 72,  value: 8084 },
    ],
  },
  {
    id: 'MR-260318-EMDM', site: 'padmavathy', section: 'Slab', floor: 'First Floor',
    priority: 'normal', kind: 'group', advance: false, stage: 'in-use',
    material: 'tmt8', qty: 220, unit: 'kg',
    requestedBy: 'rajesh', requestedAt: '2026-03-18',
    needBy: '2026-03-24',
    po: { id: 'PO-MMQEMDMC', vendor: 'karuppaiah', amount: 32790, qty: 220, expected: '2026-03-24', status: 'delivered', payer: 'padmavathy' },
    delivery: { date: '2026-03-24', recordedBy: 'rajesh', quality: 'fair', notes: 'Some bars bent on edge — accepted with weight adjustment.' },
    settlement: { status: 'settled', amount: 32790, paidBy: 'padmavathy', settledAt: '2026-03-25' },
    inventory: { batch: 'MAT-260324-7A41', received: 220, used: 180, remaining: 40 },
    interSiteUsage: [
      { site: 'padmavathy', used: 145, value: 21617 },
      { site: 'srinivasan', used: 35,  value: 5219 },
    ],
  },
];

// Action inbox — what currently needs someone's attention. Drives left rail.
const M_INBOX = [
  { kind: 'approve',  count: 2, label: 'Approve requests',     threads: ['MR-260424-CITO', 'MR-260506-9MM4'] },
  { kind: 'po',       count: 1, label: 'Create purchase order', threads: ['MR-260408-IRJ8'] },
  { kind: 'delivery', count: 1, label: 'Record delivery',       threads: ['MR-260506-9MM4'] },
  { kind: 'settle',   count: 10, label: 'Settle vendors',        amount: 138000 },
  { kind: 'usage',    count: 5, label: 'Log usage today',        amount: null },
  { kind: 'intersite', count: 33, label: 'Inter-site reconcile', amount: 30964 },
];

const M_INTERSITE = {
  thisSite: 'srinivasan',
  othersOwe:  18554,   // others owe me (for using my materials)
  iOwe:       49519,   // I owe others (for using their materials)
  net:       -30964,
  detail: [
    { from: 'padmavathy', to: 'srinivasan', materials: 5, amount: 18554 },
    { from: 'srinivasan', to: 'padmavathy', materials: 7, amount: 49519 },
  ],
};

window.M_SITES = M_SITES; window.M_GROUP = M_GROUP; window.M_ENGINEERS = M_ENGINEERS;
window.M_VENDORS = M_VENDORS; window.M_MATERIALS = M_MATERIALS;
window.M_STAGES = M_STAGES; window.M_THREADS = M_THREADS; window.M_INBOX = M_INBOX;
window.M_INTERSITE = M_INTERSITE;

// Helpers
window.M = {
  site: (id) => M_SITES.find(s => s.id === id) || (id === 'group' ? { id:'group', name:'Group', short:'GRP', accent:'#9333ea' } : null),
  vendor: (id) => M_VENDORS.find(v => v.id === id),
  material: (id) => M_MATERIALS.find(m => m.id === id),
  engineer: (id) => M_ENGINEERS.find(e => e.id === id),
  // What stage progress a thread is at (0..1)
  progress: (thread) => {
    const idx = M_STAGES.indexOf(thread.stage);
    return Math.max(0, idx) / (M_STAGES.length - 1);
  },
  stageLabel: (s) => ({
    requested:'Requested', approved:'Approved', ordered:'Ordered',
    'in-transit':'In transit', delivered:'Delivered', settled:'Settled',
    'in-use':'In use', exhausted:'Exhausted',
  })[s] || s,
  // What's the next blocking action for this thread?
  nextAction: (t) => {
    // Spot purchases bypass MR/PO/Delivery/Settlement. Group spots need
    // allocation finalization once consumed (or 7d after purchase).
    if (t.purchaseType === 'spot') {
      if (t.kind === 'group' && t.spotStage === 'provisional') {
        return { who:'engineer', label:'Finalize split' };
      }
      return null;
    }
    if (t.stage === 'requested') return { who:'admin',    label:'Approve' };
    if (t.stage === 'approved')  return { who:'admin',    label:'Create PO' };
    if (t.stage === 'ordered')   return { who:'engineer', label:'Record delivery' };
    if (t.stage === 'delivered' && (!t.settlement || t.settlement.status === 'pending'))
                                  return { who:'office',  label:'Settle vendor' };
    if (t.stage === 'in-use')    return { who:'engineer', label:'Log usage' };
    return null;
  },
};
