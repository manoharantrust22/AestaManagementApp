// Rentals state — reducer + initial state for the rental hub prototype.
// Same shape as the materials prototype: useReducer-driven, every action
// advances an order through the lifecycle and writes the supporting record.

function rentalsReduce(state, action) {
  const updateOrder = (id, fn) => ({
    ...state,
    orders: state.orders.map(o => o.id === id ? fn(o) : o),
  });

  switch (action.type) {
    case 'CREATE_ORDER': {
      const id = 'RO-' + Date.now().toString(36).slice(-6).toUpperCase();
      const p = action.payload;
      const isHist = p.isHistorical;
      const o = {
        id, site: 'srinivasan',
        status: p.status || 'pending',
        kind: p.kind || 'own',
        requestedBy: 'ajith', requestedAt: new Date().toISOString().slice(0,10),
        ...p,
      };
      // Historical settled — auto-create a simple settlement record so the
      // order surfaces as 'settled' with proper totals on the Hub.
      if (isHist && p.status === 'settled') {
        const accrued = Math.round(R.accruedCost(o));
        o.settlements = {
          vendor: { status:'settled', ref:'RSET-' + id.slice(3) + '-001',
                    gross: accrued, advance: 0, negotiated: accrued, savings: 0,
                    mode:'cash', payer:'site',
                    settledAt: o.actualEnd || new Date().toISOString().slice(0,10),
                    receipts: { bill:false, payment:false } },
          ...((p.transportIn?.cost || 0) > 0 ? {
            transportIn: { status:'settled', ref:'RSET-' + id.slice(3) + '-002',
                           amount: p.transportIn.cost, mode:'cash', payer:'site',
                           settledAt: o.actualStart, receipts: {} },
          } : {}),
        };
      }
      return { ...state, orders: [o, ...state.orders],
        toast: { message: isHist ? `Historical rental ${id} recorded` : `Rental ${id} requested`, tone:'success' } };
    }

    case 'APPROVE_ORDER':
      return {
        ...updateOrder(action.id, o => ({
          ...o, status:'confirmed',
          approvedBy:'admin', approvedAt: new Date().toISOString().slice(0,10),
        })),
        toast: { message:`Approved ${action.id}`, tone:'success' },
      };

    case 'REJECT_ORDER':
      return {
        ...updateOrder(action.id, o => ({ ...o, status:'cancelled', rejectedReason: action.reason })),
        toast: { message:`Rejected ${action.id}`, tone:'danger' },
      };

    case 'VERIFY_DELIVERY':
      return {
        ...updateOrder(action.id, o => ({
          ...o, status:'active',
          actualStart: new Date().toISOString().slice(0,10),
        })),
        toast: { message:`Delivery verified · cost meter started`, tone:'success' },
      };

    case 'RECORD_RETURN': {
      const p = action.payload; // { items: [{ item, variant, qty, condition, damageCost }], date }
      return {
        ...updateOrder(action.id, o => {
          // Increment qtyReturned for each line item that matches
          const newItems = o.items.map(ln => {
            const matched = p.items.find(r => r.item === ln.item && r.variant === ln.variant);
            if (!matched) return ln;
            return { ...ln, qtyReturned: (ln.qtyReturned || 0) + matched.qty };
          });
          const fullyReturned = newItems.every(ln => (ln.qtyReturned || 0) >= ln.qty);
          const newReturns = [...(o.returns || []), { date: p.date || new Date().toISOString().slice(0,10), items: p.items }];
          const newStatus = fullyReturned ? 'completed' : 'partially_returned';
          const newSettlements = fullyReturned ? {
            ...(o.settlements || {}),
            vendor: o.settlements?.vendor || { status:'pending' },
            ...(o.transportOut && o.transportOut.cost > 0 && o.transportOut.by !== 'vendor' ? {
              transportOut: { status:'pending', amount: o.transportOut.cost },
            } : {}),
          } : (o.settlements || {});
          return {
            ...o, items: newItems, status: newStatus, returns: newReturns,
            settlements: newSettlements,
            actualEnd: fullyReturned ? (p.date || new Date().toISOString().slice(0,10)) : o.actualEnd,
          };
        }),
        toast: { message:`Return recorded`, tone:'success' },
      };
    }

    case 'ADD_ADVANCE':
      return {
        ...updateOrder(action.id, o => ({
          ...o, advances: [...(o.advances || []), action.payload],
        })),
        toast: { message:`Advance ₹${action.payload.amount.toLocaleString('en-IN')} added`, tone:'success' },
      };

    case 'SETTLE_VENDOR': {
      const p = action.payload; // { gross, advance, negotiated, mode, payer }
      const savings = p.gross - p.negotiated;
      return {
        ...updateOrder(action.id, o => {
          const s = {
            ...(o.settlements || {}),
            vendor: { status:'settled', gross: p.gross, advance: p.advance, negotiated: p.negotiated,
                      savings, mode: p.mode, payer: p.payer, settledAt: new Date().toISOString().slice(0,10) },
          };
          // If transport rows are all settled too, mark order as 'settled'.
          const allSettled = (!s.transportIn  || s.transportIn.status  === 'settled')
                          && (!s.transportOut || s.transportOut.status === 'settled');
          return { ...o, settlements: s, status: allSettled ? 'settled' : o.status };
        }),
        toast: { message:`Vendor settled · ${savings > 0 ? `₹${savings.toLocaleString('en-IN')} saved` : 'no discount'}`, tone:'success' },
      };
    }

    case 'SETTLE_TRANSPORT': {
      // payload: { which: 'in'|'out', amount, mode, payer }
      const key = action.payload.which === 'in' ? 'transportIn' : 'transportOut';
      return {
        ...updateOrder(action.id, o => {
          const s = { ...(o.settlements || {}) };
          s[key] = { status:'settled', amount: action.payload.amount, mode: action.payload.mode,
                     payer: action.payload.payer, settledAt: new Date().toISOString().slice(0,10) };
          const allSettled = s.vendor?.status === 'settled'
                          && (!s.transportIn  || s.transportIn.status  === 'settled')
                          && (!s.transportOut || s.transportOut.status === 'settled');
          return { ...o, settlements: s, status: allSettled ? 'settled' : o.status };
        }),
        toast: { message:`Transport settled`, tone:'success' },
      };
    }

    case 'EXTEND_DATE':
      return {
        ...updateOrder(action.id, o => ({ ...o, expectedEnd: action.newDate })),
        toast: { message:`Return date extended to ${action.newDate}`, tone:'success' },
      };

    case 'SET_VIEW':       return { ...state, view: action.view, expandedId: null };
    case 'SET_EXPANDED':   return { ...state, expandedId: state.expandedId === action.id ? null : action.id };
    case 'OPEN_MODAL':     return { ...state, modal: action.modal };
    case 'CLOSE_MODAL':    return { ...state, modal: null };
    case 'CLEAR_TOAST':    return { ...state, toast: null };
    case 'RESET':          return rentalsInitialState();
    default: return state;
  }
}

function rentalsInitialState() {
  return {
    orders: JSON.parse(JSON.stringify(R_SEED_ORDERS)),
    view: 'hub',
    expandedId: null,
    modal: null,
    toast: null,
  };
}

function rentalsCounts(orders) {
  return {
    all: orders.length,
    pending:    orders.filter(o => o.status === 'pending').length,
    confirmed:  orders.filter(o => o.status === 'confirmed').length,
    active:     orders.filter(o => ['active','partially_returned'].includes(o.status)).length,
    overdue:    orders.filter(R.isOverdue).length,
    completed:  orders.filter(o => o.status === 'completed').length,
    settled:    orders.filter(o => o.status === 'settled').length,
    cancelled:  orders.filter(o => o.status === 'cancelled').length,
    needsAction: orders.filter(o => R.nextAction(o)).length,
    toReturn:    orders.filter(o => ['active','partially_returned'].includes(o.status)).length,
    toSettle:    orders.filter(o => o.status === 'completed').length,
  };
}

function rentalsTotals(orders) {
  const accrued  = orders.filter(o => ['active','partially_returned'].includes(o.status))
                          .reduce((a,o) => a + R.accruedCost(o), 0);
  const balance  = orders.filter(o => o.status !== 'cancelled' && o.status !== 'settled')
                          .reduce((a,o) => a + R.balanceDue(o), 0);
  const advances = orders.reduce((a,o) => a + R.totalAdvances(o), 0);
  const settled  = orders.filter(o => o.settlements?.vendor?.status === 'settled')
                          .reduce((a,o) => a + (o.settlements.vendor.negotiated || 0), 0);
  return { accrued, balance, advances, settled };
}

window.rentalsReduce = rentalsReduce;
window.rentalsInitialState = rentalsInitialState;
window.rentalsCounts = rentalsCounts;
window.rentalsTotals = rentalsTotals;
