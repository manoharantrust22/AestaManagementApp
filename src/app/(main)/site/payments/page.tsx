import PaymentsContent from "./payments-content";

export default function PaymentsPage() {
  // The new ledger fetches its own data via React Query (usePaymentSummary
  // + usePaymentsLedger). Server-side prefetch was removed in the
  // /site/payments rewrite (Task 3.6) to keep the page surface thin.
  return <PaymentsContent />;
}
