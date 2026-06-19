// Per-payment reference for Task Work. The id is COMPUTED (not stored) so the
// same "PKG · #n" appears in the task drawer and the /site/expenses expand panel
// and they line up exactly. Number only the rows you pass (exclude soft-deleted).

export interface NumberablePayment {
  id: string;
  payment_date: string;
  created_at?: string | null;
}

/** Map<paymentId, lineNumber> numbered chronologically (oldest payment = 1). */
export function taskPaymentLineNumbers(
  payments: NumberablePayment[]
): Map<string, number> {
  const sorted = [...payments].sort((a, b) => {
    if (a.payment_date !== b.payment_date)
      return a.payment_date < b.payment_date ? -1 : 1;
    const ac = a.created_at ?? "";
    const bc = b.created_at ?? "";
    if (ac !== bc) return ac < bc ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const map = new Map<string, number>();
  sorted.forEach((p, i) => map.set(p.id, i + 1));
  return map;
}

/** "TW-260618-001 · #6" */
export function formatTaskPaymentRef(
  packageNumber: string,
  lineNumber: number
): string {
  return `${packageNumber} · #${lineNumber}`;
}
