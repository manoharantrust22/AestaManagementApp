// Proto state — seed threads + reducer for the interactive prototype.
// Same data shape as mat-data.js but with mutations: actions advance threads
// through the lifecycle (requested → approved → ordered → delivered →
// settled → in-use → exhausted) and create the supporting records.

const PROTO_SEED_THREADS = [
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
    delivery: { date: '2026-05-12', recordedBy: 'ajith', quality: 'good', notes: '2nd quality logs as specified.' },
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
    inventory: { batch: 'MAT-260516-7A41', received: 100, used: 33, remaining: 67 },
    interSiteUsage: [
      { site: 'srinivasan', used: 12, value: 3660 },
      { site: 'padmavathy', used: 21, value: 6405 },
    ],
  },
  {
    id: 'MR-260424-CITO', site: 'srinivasan', section: 'Walls', floor: 'Ground Floor',
    priority: 'high', kind: 'own', advance: false, stage: 'requested',
    material: 'flyash', qty: 2000, unit: 'nos',
    requestedBy: 'ajith', requestedAt: '2026-04-24',
    needBy: '2026-05-01',
    note: 'Need by Friday — bricklayers booked. Vairam quoted ₹6.95/nos.',
  },
  {
    id: 'MR-260408-IRJ8', site: 'srinivasan', section: 'Slab', floor: 'Ground Floor',
    priority: 'high', kind: 'own', advance: false, stage: 'approved',
    material: 'ppc', qty: 80, unit: 'bag',
    requestedBy: 'ajith', requestedAt: '2026-04-08',
    needBy: '2026-04-12',
    approvedBy: 'admin', approvedAt: '2026-04-09',
  },
  // Reverse-direction group PO (Srinivasan paid, Padma used some) — gives the
  // inter-site ledger a true 2-way debt to net against.
  {
    id: 'MR-260415-TMT4', site: 'srinivasan', section: 'Slab', floor: 'First Floor',
    priority: 'normal', kind: 'group', advance: false, stage: 'in-use',
    material: 'tmt12', qty: 200, unit: 'kg',
    requestedBy: 'ajith', requestedAt: '2026-04-15',
    needBy: '2026-04-22',
    po: { id: 'PO-MOQ8YZ4P', vendor: 'karuppaiah', amount: 12400, qty: 200, expected: '2026-04-22', status: 'delivered', payer: 'srinivasan' },
    delivery: { date: '2026-04-22', recordedBy: 'ajith', quality: 'good', notes: 'Bundles weighed; matched invoice.' },
    settlement: { status: 'settled', amount: 12400, paidBy: 'srinivasan', settledAt: '2026-04-23' },
    inventory: { batch: 'MAT-260422-T9KL', received: 200, used: 90, remaining: 110 },
    interSiteUsage: [
      { site: 'srinivasan', used: 70, value: 4340 },
      { site: 'padmavathy', used: 20, value: 1240 },
    ],
  },
  {
    id: 'MR-260402-FA88', site: 'srinivasan', section: 'Plinth', floor: 'Ground Floor',
    priority: 'normal', kind: 'own', advance: false, stage: 'in-use',
    material: 'flyash', qty: 2500, unit: 'nos',
    requestedBy: 'ajith', requestedAt: '2026-04-02',
    needBy: '2026-04-08',
    po: { id: 'PO-MOLM5RZP', vendor: 'vairam', amount: 17375, qty: 2500, expected: '2026-04-08', status: 'delivered', payer: 'srinivasan' },
    delivery: { date: '2026-04-08', recordedBy: 'ajith', quality: 'good' },
    settlement: { status: 'settled', amount: 17375, paidBy: 'office', settledAt: '2026-04-10' },
    inventory: { batch: 'MAT-260408-FA22', received: 2500, used: 1850, remaining: 650 },
  },
  {
    id: 'MR-260328-MSAN', site: 'srinivasan', section: 'Plastering', floor: 'Ground Floor',
    priority: 'normal', kind: 'own', advance: false, stage: 'in-use',
    material: 'msand', qty: 18, unit: 'cft',
    requestedBy: 'ajith', requestedAt: '2026-03-28',
    needBy: '2026-04-02',
    po: { id: 'PO-MOK19LM4', vendor: 'pinveedu', amount: 81000, qty: 18, expected: '2026-04-02', status: 'delivered', payer: 'srinivasan' },
    delivery: { date: '2026-04-02', recordedBy: 'ajith', quality: 'good' },
    settlement: { status: 'settled', amount: 81000, paidBy: 'office', settledAt: '2026-04-03' },
    inventory: { batch: 'MAT-260402-MS01', received: 18, used: 12, remaining: 6 },
  },

  // ─── Spot purchases ──────────────────────────────────────────────
  // Bypass the MR/PO/Delivery/Settlement chain — supervisor walks to a
  // nearby shop, pays cash/UPI from his wallet, records post-facto.
  // Group-stock spots carry a provisional split that flips to final when
  // the batch is consumed (or 7 days after purchase).
  {
    id: 'SP-260521-BW01', purchaseType: 'spot', site: 'srinivasan', section: 'Masonry',
    kind: 'own', stage: 'in-use', spotStage: 'bought',
    material: 'binding-wire', qty: 5, unit: 'roll',
    requestedBy: 'ajith', requestedAt: '2026-05-21', boughtAt: '2026-05-21',
    spot: {
      vendor: 'arm-mart', vendorName: 'ARM Build Mart',
      items: [ { material:'binding-wire', name:'GI Binding Wire 22 SWG', qty:5, unit:'roll', paidRate: 98, lastRate: 95, lineTotal: 490 } ],
      paidBy: 'ajith', walletId:'ajith', paymentMode:'cash', amount:490,
      bill: { attached:true, kind:'image' }, screenshot: { attached:false },
      rateDiverged: true,
    },
    inventory: { batch: 'SP-260521-BW01', received: 5, used: 1, remaining: 4 },
  },
  {
    id: 'SP-260522-HW02', purchaseType: 'spot', site: 'srinivasan', section: 'Fasteners',
    kind: 'group', stage: 'in-use', spotStage: 'provisional',
    material: 'hardware', qty: 1, unit: 'set',
    requestedBy: 'ajith', requestedAt: '2026-05-22', boughtAt: '2026-05-22',
    spot: {
      vendor: 'pkt-hardware', vendorName: 'Pudukkottai Hardware (draft)',
      vendorIsDraft: true,
      items: [
        { material:'hardware', name:'Bolt + nut · M12 × 100mm',  qty:24, unit:'piece', paidRate: 14, lineTotal: 336 },
        { material:'hardware', name:'L-clamp · 4″',              qty:8,  unit:'piece', paidRate: 35, lineTotal: 280 },
      ],
      paidBy: 'ajith', walletId:'ajith', paymentMode:'upi', amount: 616,
      bill: { attached:false }, screenshot: { attached:true, kind:'image' },
      allocation: {
        kind:'provisional',
        split: [ { site:'srinivasan', pct:60 }, { site:'padmavathy', pct:40 } ],
        dueBy: '2026-05-29',
      },
      rateDiverged: false,
    },
    inventory: { batch: 'SP-260522-HW02', received: 32, used: 0, remaining: 32 },
  },
  {
    id: 'SP-260510-NL09', purchaseType: 'spot', site: 'srinivasan', section: 'Carpentry',
    kind: 'group', stage: 'in-use', spotStage: 'provisional',
    material: 'nails', qty: 3, unit: 'kg',
    requestedBy: 'ajith', requestedAt: '2026-05-10', boughtAt: '2026-05-10',
    spot: {
      vendor: 'sri-tools', vendorName: 'Sri Tools & Hardware',
      items: [ { material:'nails', name:'Wire nails · 2″',  qty:3, unit:'kg', paidRate: 88, lineTotal: 264 } ],
      paidBy: 'ajith', walletId:'ajith', paymentMode:'cash', amount: 264,
      bill: { attached:true, kind:'image' },
      allocation: { kind:'provisional', split: [ { site:'srinivasan', pct:50 }, { site:'padmavathy', pct:50 } ], dueBy:'2026-05-17' },
      rateDiverged: false,
    },
    inventory: { batch: 'SP-260510-NL09', received: 3, used: 3, remaining: 0 },
  },
];

// New materials for spot purchases (not part of M_MATERIALS yet).
const SPOT_MATERIAL_DRAFTS = [
  { id:'binding-wire', name:'GI Binding Wire', spec:'22 SWG · annealed', unit:'roll', cat:'Steel', isDraft: true },
  { id:'hardware',     name:'Hardware (assorted)', spec:'bolts, nuts, clamps', unit:'piece', cat:'Steel', isDraft: true },
  { id:'nails',        name:'Wire nails', spec:'2″ · mild steel', unit:'kg', cat:'Steel', isDraft: true },
];
SPOT_MATERIAL_DRAFTS.forEach(d => { if (!M.material(d.id)) M_MATERIALS.push(d); });

// Reducer — every action advances the thread's stage and writes the
// supporting record. Returns the new state, never mutates.
function protoReduce(state, action) {
  const updateThread = (id, fn) => ({
    ...state,
    threads: state.threads.map(t => t.id === id ? fn(t) : t),
  });

  switch (action.type) {
    case 'CREATE_REQUEST': {
      const id = 'MR-' + Date.now().toString(36).slice(-8).toUpperCase();
      const t = {
        id, site: 'srinivasan', stage: 'requested',
        requestedBy: 'ajith', requestedAt: new Date().toISOString().slice(0,10),
        kind: 'own', advance: false,
        ...action.payload,
      };
      return { ...state, threads: [t, ...state.threads],
        toast: { message: `Request ${id} submitted`, tone: 'success' } };
    }

    case 'APPROVE_REQUEST':
      return {
        ...updateThread(action.id, t => ({
          ...t, stage: 'approved',
          approvedBy: 'admin', approvedAt: new Date().toISOString().slice(0,10),
        })),
        toast: { message: `Approved ${action.id}`, tone: 'success' },
      };

    case 'REJECT_REQUEST':
      return {
        ...updateThread(action.id, t => ({
          ...t, stage: 'rejected', rejectedReason: action.reason,
        })),
        toast: { message: `Rejected ${action.id}`, tone: 'danger' },
      };

    case 'CREATE_PO': {
      const poId = 'PO-' + Date.now().toString(36).slice(-8).toUpperCase();
      const p = action.payload;
      return {
        ...updateThread(action.id, t => ({
          ...t, stage: 'ordered',
          kind: p.kind, advance: p.advance,
          po: {
            id: poId, vendor: p.vendor, amount: p.amount, qty: t.qty,
            expected: p.expected, status: 'ordered',
            payer: p.payer || t.site,
            ...(p.advance ? { advance: { totalPaid: p.amount, batches: [], nextBatch: p.expected } } : {}),
          },
          // Advance POs settle immediately (paid upfront)
          ...(p.advance ? { settlement: { status: 'settled', amount: p.amount, paidBy: p.payer || t.site, settledAt: new Date().toISOString().slice(0,10) }, stage: 'ordered' } : {}),
        })),
        toast: { message: `PO ${poId} placed${p.advance ? ' (advance · paid upfront)' : ''}`, tone: 'success' },
      };
    }

    case 'RECORD_DELIVERY': {
      const p = action.payload;
      return {
        ...updateThread(action.id, t => {
          const batchId = 'MAT-' + Date.now().toString(36).slice(-7).toUpperCase();
          // Advance POs were already settled at PO creation — preserve that.
          // Otherwise initialize a pending settlement record.
          const settlement = t.settlement && t.settlement.status === 'settled'
            ? t.settlement
            : { status: 'pending', amount: t.po.amount, paidBy: null };
          // Advance POs (already settled): jump straight to 'in-use' so the
          // next action becomes "Log usage" instead of falling into a gap.
          const stage = settlement.status === 'settled' ? 'in-use' : 'delivered';
          return {
            ...t, stage,
            delivery: {
              date: new Date().toISOString().slice(0,10),
              recordedBy: 'ajith', quality: p.quality, notes: p.notes,
              receivedQty: p.qty,
            },
            inventory: {
              batch: batchId, received: p.qty, used: 0, remaining: p.qty,
            },
            interSiteUsage: t.kind === 'group' ? [] : undefined,
            settlement,
            po: { ...t.po, status: 'delivered' },
          };
        }),
        toast: { message: `Delivery recorded · added to inventory`, tone: 'success' },
      };
    }

    case 'SETTLE_VENDOR':
      return {
        ...updateThread(action.id, t => ({
          ...t, stage: t.kind === 'own' ? 'in-use' : t.stage,
          settlement: {
            status: 'settled', amount: t.po.amount,
            paidBy: action.by, settledAt: new Date().toISOString().slice(0,10),
          },
        })),
        toast: { message: `Vendor settled via ${action.by === 'office' ? 'office' : action.by === 'wallet' ? 'wallet' : 'site funds'}`, tone: 'success' },
      };

    case 'LOG_USAGE': {
      const p = action.payload;
      return {
        ...updateThread(action.id, t => {
          const used = Math.min(t.inventory.remaining, p.qty);
          const usage = t.kind === 'group' ? (t.interSiteUsage || []) : [];
          // Append to that site's row
          const idx = usage.findIndex(u => u.site === p.bySite);
          let newUsage = usage;
          if (t.kind === 'group') {
            const unitPrice = t.po.amount / t.inventory.received;
            if (idx >= 0) {
              newUsage = usage.map((u,i) => i===idx ? { ...u, used: u.used + used, value: (u.used+used)*unitPrice } : u);
            } else {
              newUsage = [...usage, { site: p.bySite, used, value: used * unitPrice }];
            }
          }
          const newRemaining = t.inventory.remaining - used;
          return {
            ...t,
            stage: newRemaining <= 0 ? 'exhausted' : 'in-use',
            inventory: {
              ...t.inventory,
              used: t.inventory.used + used,
              remaining: newRemaining,
            },
            interSiteUsage: t.kind === 'group' ? newUsage : undefined,
          };
        }),
        toast: { message: `Logged ${action.payload.qty} ${state.threads.find(t=>t.id===action.id).unit} used`, tone: 'success' },
      };
    }

    case 'NET_SETTLE_INTERSITE':
      return { ...state,
        toast: { message: `Net-settled inter-site · ₹${action.amount.toLocaleString('en-IN')}`, tone: 'success' },
      };

    case 'RECORD_SPOT_PURCHASE': {
      const p = action.payload;
      const id = 'SP-' + Date.now().toString(36).slice(-8).toUpperCase();
      const total = p.items.reduce((a, it) => a + (it.qty * it.paidRate), 0);
      const stage = 'in-use';
      const spotStage = p.kind === 'group' && p.allocation ? 'provisional' : 'bought';
      // First-item material drives the thread's material field — most spot
      // purchases are single-line; multi-line shows the rest in detail.
      const primary = p.items[0];
      const totalQty = p.items.reduce((a, it) => a + it.qty, 0);
      const t = {
        id, purchaseType:'spot',
        site: 'srinivasan', section: p.section || 'On-site',
        kind: p.kind, advance: false, stage, spotStage,
        material: primary.material, qty: totalQty, unit: primary.unit,
        requestedBy: 'ajith', requestedAt: new Date().toISOString().slice(0,10), boughtAt: new Date().toISOString().slice(0,10),
        spot: {
          vendor: p.vendor, vendorName: p.vendorName, vendorIsDraft: p.vendorIsDraft,
          items: p.items, paidBy:'ajith', walletId:'ajith',
          paymentMode: p.paymentMode, amount: total,
          bill: p.bill || { attached: false },
          screenshot: p.screenshot || { attached: false },
          allocation: p.allocation,
          rateDiverged: p.items.some(it => it.lastRate && Math.abs(it.lastRate - it.paidRate) > 0.01),
        },
        inventory: { batch: id, received: totalQty, used: 0, remaining: totalQty },
      };
      return { ...state, threads: [t, ...state.threads],
        toast: { message: `Spot purchase ${id} recorded · ₹${total.toLocaleString('en-IN')} from wallet`, tone:'success' } };
    }

    case 'FINALIZE_SPOT_ALLOCATION':
      return {
        ...updateThread(action.id, t => {
          if (!t.spot || !t.spot.allocation) return t;
          const final = { ...t.spot.allocation, split: action.split, kind: 'final', finalizedAt: new Date().toISOString().slice(0,10) };
          // Compute interSiteUsage from the % split so the inter-site debt
          // math picks it up. Spot threads stay spot — no fake po row.
          const interSiteUsage = action.split.map(s => ({
            site: s.site,
            used: t.inventory.received * (s.pct / 100),
            value: t.spot.amount * (s.pct / 100),
          }));
          return {
            ...t, spotStage:'finalized',
            spot: { ...t.spot, allocation: final },
            interSiteUsage,
          };
        }),
        toast: { message: `Allocation finalized · inter-site updated`, tone: 'success' },
      };

    case 'SET_VIEW':       return { ...state, view: action.view, expandedId: null };
    case 'SET_EXPANDED':   return { ...state, expandedId: state.expandedId === action.id ? null : action.id };
    case 'OPEN_MODAL':     return { ...state, modal: action.modal };
    case 'CLOSE_MODAL':    return { ...state, modal: null };
    case 'CLEAR_TOAST':    return { ...state, toast: null };
    case 'SET_ROLE':       return { ...state, currentRole: action.role };
    case 'RESET':          return protoInitialState();
    default: return state;
  }
}

function protoInitialState() {
  return {
    threads: JSON.parse(JSON.stringify(PROTO_SEED_THREADS)),
    view: 'hub',
    expandedId: null,
    modal: null,
    toast: null,
    currentRole: 'admin', // 'admin' or 'engineer'
  };
}

// Derived helpers
function protoCounts(threads) {
  return {
    all: threads.length,
    pendingApproval: threads.filter(t => t.stage === 'requested').length,
    awaitingPO: threads.filter(t => t.stage === 'approved').length,
    awaitingDelivery: threads.filter(t => t.stage === 'ordered').length,
    pendingSettlement: threads.filter(t => t.stage === 'delivered' && t.settlement?.status === 'pending').length,
    inUse: threads.filter(t => t.stage === 'in-use').length,
    group: threads.filter(t => t.kind === 'group').length,
    own:  threads.filter(t => t.kind === 'own').length,
    advance: threads.filter(t => t.advance).length,
    spot: threads.filter(t => t.purchaseType === 'spot').length,
    spotNeedsAllocation: threads.filter(t => t.purchaseType === 'spot' && t.kind === 'group' && t.spotStage === 'provisional').length,
    needsAction: threads.filter(t => M.nextAction(t)).length,
  };
}

// Inter-site debt computation from threads (live)
function protoInterSiteDebt(threads, mySite='srinivasan') {
  let othersOwe = 0, iOwe = 0;
  const detail = []; // { from, to, thread, used, value }
  threads.forEach(t => {
    if (t.kind !== 'group' || !t.interSiteUsage) return;
    // Spot threads carry the payer on t.site; standard threads on t.po.payer.
    const payerId = t.po ? t.po.payer : t.site;
    t.interSiteUsage.forEach(u => {
      if (u.site === payerId) return; // payer doesn't owe themselves
      if (u.site === mySite) {
        iOwe += u.value;
        detail.push({ from: mySite, to: payerId, thread: t, used: u.used, value: u.value });
      }
      if (payerId === mySite) {
        othersOwe += u.value;
        detail.push({ from: u.site, to: mySite, thread: t, used: u.used, value: u.value });
      }
    });
  });
  return { othersOwe, iOwe, net: othersOwe - iOwe, detail };
}

window.protoReduce = protoReduce;
window.protoInitialState = protoInitialState;
window.protoCounts = protoCounts;
window.protoInterSiteDebt = protoInterSiteDebt;
