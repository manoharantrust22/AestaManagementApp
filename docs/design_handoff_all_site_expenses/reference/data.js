// Mock data for Srinivasan House & Shop site
// Numbers match the original screenshot's totals so the redesign reads true.

window.SITE = {
  name: 'Srinivasan House & Shop',
  location: 'Pudukkottai',
  status: 'active',
  startedOn: '2025-11-12',

  // From Contracts module (linked, not edited here)
  contract: {
    value: 2500000,
    collected: 1200000,
    invoiced: 1450000,
    nextMilestone: { label: 'Footing complete', amount: 350000, dueOn: '2026-05-25' },
  },

  // Budget set when project was planned
  budget: 2200000,

  // Computed: spent so far
  spent: 930726,
  records: 312,

  // Progress reported by site supervisor (% complete)
  progress: 0.38,

  // Burn rate (last 4 weeks avg)
  burnPerWeek: 86400,
  burnTrend: [62000, 71000, 94000, 86400, 78000, 91000, 86400, 102000], // sparkline
};

// Spending breakdown — by Kind (primary) and Trade (cross-cutting)
window.BY_KIND = {
  labor: {
    total: 624476,
    records: 270,
    children: [
      { id: 'salary',   label: 'Salary settlement', amount: 522125, records: 205,
        children: [
          { id: 'daily',    label: 'Daily wages', amount: 168675, records: 89 },
          { id: 'contract', label: 'Contract',    amount: 353450, records: 116, note: '2 advance' },
        ]},
      { id: 'tea',      label: 'Tea & snacks',     amount: 4327,   records: 11 },
      { id: 'excess',   label: 'Excess',           amount: 22799,  records: 19, flag: 'review' },
      { id: 'unlinked', label: 'Unlinked salary',  amount: 75225,  records: 35, flag: 'attention' },
    ],
  },
  building: {
    total: 306250,
    records: 40,
    children: [
      { id: 'material',  label: 'Material',      amount: 285825, records: 27 },
      { id: 'machinery', label: 'Machinery',     amount: 15000,  records: 6  },
      { id: 'general',   label: 'General',       amount: 0,      records: 0  },
      { id: 'misc',      label: 'Miscellaneous', amount: 5425,   records: 7  },
    ],
  },
};

// Trades — cross-cutting work areas. Civil dominates; the rest are stubbed.
window.TRADES = [
  { id: 'civil',       label: 'Civil',       amount: 641901, records: 284, color: '#2563eb',
    sub: [{ label: 'Daily',    amount: 169000 },
          { label: 'Contract', amount: 338000 },
          { label: 'Material', amount: 134901 }] },
  { id: 'carpentry',   label: 'Carpentry',   amount: 0, records: 0, color: '#d97706' },
  { id: 'electrical',  label: 'Electrical',  amount: 0, records: 0, color: '#dc2626' },
  { id: 'fabrication', label: 'Fabrication', amount: 0, records: 0, color: '#0891b2' },
  { id: 'flooring',    label: 'Flooring',    amount: 0, records: 0, color: '#7c3aed' },
  { id: 'painting',    label: 'Painting',    amount: 0, records: 0, color: '#db2777' },
  { id: 'plumbing',    label: 'Plumbing',    amount: 0, records: 0, color: '#0e9b6e' },
  { id: 'scaffolding', label: 'Scaffolding', amount: 0, records: 0, color: '#64748b' },
];

// Expense records — sample of ~24 rows that together represent the 312 real ones.
// Each row carries (trade, kind, sub) so the table can filter/group either way.
window.EXPENSES = [
  { id: 'EX-2841', date: '2026-05-12', vendor: 'R. Murugan',      desc: 'Roof slab concreting — labour',  trade: 'civil', kind: 'labor',    sub: 'contract', amount: 48500, status: 'paid',     paidBy: 'UPI'   },
  { id: 'EX-2840', date: '2026-05-12', vendor: 'Lakshmi Cements',  desc: 'OPC 53 grade · 80 bags',         trade: 'civil', kind: 'building', sub: 'material', amount: 32800, status: 'paid',     paidBy: 'Bank'  },
  { id: 'EX-2839', date: '2026-05-11', vendor: 'Daily — 6 workers',desc: 'Slab prep & shuttering',         trade: 'civil', kind: 'labor',    sub: 'daily',    amount: 4200,  status: 'paid',     paidBy: 'Cash'  },
  { id: 'EX-2838', date: '2026-05-11', vendor: 'Senthil Steels',   desc: 'TMT 12mm · 1.4 tonne',           trade: 'civil', kind: 'building', sub: 'material', amount: 87600, status: 'paid',     paidBy: 'Bank'  },
  { id: 'EX-2837', date: '2026-05-10', vendor: 'Karthik (Mason)',  desc: 'Contract advance — Block C',     trade: 'civil', kind: 'labor',    sub: 'contract', amount: 25000, status: 'advance', paidBy: 'UPI', flag: 'Advance' },
  { id: 'EX-2836', date: '2026-05-10', vendor: 'Site canteen',     desc: 'Tea & vada — 14 workers',        trade: 'civil', kind: 'labor',    sub: 'tea',      amount: 420,   status: 'paid',     paidBy: 'Cash'  },
  { id: 'EX-2835', date: '2026-05-09', vendor: 'JCB rental',       desc: 'Excavator · 4 hrs',              trade: 'civil', kind: 'building', sub: 'machinery',amount: 6500,  status: 'paid',     paidBy: 'Cash'  },
  { id: 'EX-2834', date: '2026-05-09', vendor: 'Daily — 4 workers',desc: 'Centering removal',              trade: 'civil', kind: 'labor',    sub: 'daily',    amount: 2800,  status: 'paid',     paidBy: 'Cash'  },
  { id: 'EX-2833', date: '2026-05-08', vendor: 'Unlinked',         desc: 'Salary not tagged to a worker',  trade: 'civil', kind: 'labor',    sub: 'unlinked', amount: 8500,  status: 'pending', paidBy: 'UPI', flag: 'Tag worker' },
  { id: 'EX-2832', date: '2026-05-08', vendor: 'Murugan Hardware', desc: 'Misc · binding wire, nails',     trade: 'civil', kind: 'building', sub: 'misc',     amount: 1820,  status: 'paid',     paidBy: 'Cash'  },
  { id: 'EX-2831', date: '2026-05-07', vendor: 'R. Murugan',       desc: 'Brick masonry — Block B',        trade: 'civil', kind: 'labor',    sub: 'contract', amount: 54000, status: 'paid',     paidBy: 'Bank'  },
  { id: 'EX-2830', date: '2026-05-07', vendor: 'Excess payout',    desc: 'Overtime — slab pour day',       trade: 'civil', kind: 'labor',    sub: 'excess',   amount: 3400,  status: 'paid',     paidBy: 'Cash', flag: 'Review'  },
  { id: 'EX-2829', date: '2026-05-06', vendor: 'Lakshmi Cements',  desc: 'PPC · 40 bags',                  trade: 'civil', kind: 'building', sub: 'material', amount: 16400, status: 'paid',     paidBy: 'Bank'  },
  { id: 'EX-2828', date: '2026-05-06', vendor: 'Daily — 5 workers',desc: 'Plastering · ground floor',      trade: 'civil', kind: 'labor',    sub: 'daily',    amount: 3500,  status: 'paid',     paidBy: 'Cash'  },
  { id: 'EX-2827', date: '2026-05-05', vendor: 'Sand supplier',    desc: 'M-sand · 2 units',               trade: 'civil', kind: 'building', sub: 'material', amount: 11200, status: 'paid',     paidBy: 'Bank'  },
  { id: 'EX-2826', date: '2026-05-05', vendor: 'Karthik (Mason)',  desc: 'Contract — Block C plastering',  trade: 'civil', kind: 'labor',    sub: 'contract', amount: 42000, status: 'paid',     paidBy: 'UPI'   },
  { id: 'EX-2825', date: '2026-05-04', vendor: 'Site canteen',     desc: 'Tea — 12 workers',               trade: 'civil', kind: 'labor',    sub: 'tea',      amount: 360,   status: 'paid',     paidBy: 'Cash'  },
  { id: 'EX-2824', date: '2026-05-04', vendor: 'Unlinked',         desc: 'Salary cash · unassigned',       trade: 'civil', kind: 'labor',    sub: 'unlinked', amount: 12000, status: 'pending', paidBy: 'Cash', flag: 'Tag worker' },
  { id: 'EX-2823', date: '2026-05-03', vendor: 'Concrete mixer',   desc: 'Mixer rental · 8 hrs',           trade: 'civil', kind: 'building', sub: 'machinery',amount: 3800,  status: 'paid',     paidBy: 'Cash'  },
  { id: 'EX-2822', date: '2026-05-03', vendor: 'Daily — 7 workers',desc: 'Stone laying',                   trade: 'civil', kind: 'labor',    sub: 'daily',    amount: 4900,  status: 'paid',     paidBy: 'Cash'  },
  { id: 'EX-2821', date: '2026-05-02', vendor: 'Senthil Steels',   desc: 'TMT 8mm · 600 kg',               trade: 'civil', kind: 'building', sub: 'material', amount: 36100, status: 'paid',     paidBy: 'Bank'  },
  { id: 'EX-2820', date: '2026-05-02', vendor: 'R. Murugan',       desc: 'Contract — Block A finishing',   trade: 'civil', kind: 'labor',    sub: 'contract', amount: 38000, status: 'paid',     paidBy: 'Bank'  },
  { id: 'EX-2819', date: '2026-05-01', vendor: 'Excess payout',    desc: 'Night work allowance',           trade: 'civil', kind: 'labor',    sub: 'excess',   amount: 5800,  status: 'paid',     paidBy: 'Cash', flag: 'Review'  },
  { id: 'EX-2818', date: '2026-04-30', vendor: 'Murugan Hardware', desc: 'PVC pipes — temp drainage',      trade: 'civil', kind: 'building', sub: 'misc',     amount: 1280,  status: 'paid',     paidBy: 'Cash'  },
];

window.KIND_META = {
  labor:    { label: 'Labor',    color: '#2563eb', soft: '#eff4ff' },
  building: { label: 'Building', color: '#db2777', soft: '#fdf2f8' },
};

window.SUB_META = {
  daily:    { label: 'Daily wages',  color: '#2563eb' },
  contract: { label: 'Contract',     color: '#1d4ed8' },
  tea:      { label: 'Tea & snacks', color: '#0891b2' },
  excess:   { label: 'Excess',       color: '#d97706' },
  unlinked: { label: 'Unlinked',     color: '#dc2626' },
  material: { label: 'Material',     color: '#db2777' },
  machinery:{ label: 'Machinery',    color: '#a21caf' },
  misc:     { label: 'Misc',         color: '#7c3aed' },
  general:  { label: 'General',      color: '#6b7280' },
};
