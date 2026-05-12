import type { RentalReturn } from "@/types/rental.types";

interface CostItem {
  id: string;
  quantity: number;
  daily_rate_actual: number;
  quantity_returned: number;
  quantity_outstanding: number;
}

function daysBetween(from: string, to: Date = new Date()): number {
  const fromDate = new Date(from);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(to);
  toDate.setHours(0, 0, 0, 0);
  return Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
}

export function calculateSpentToDate(
  items: CostItem[],
  returns: RentalReturn[],
  startDate: string,
  today: Date = new Date()
): number {
  const daysElapsed = Math.max(0, daysBetween(startDate, today));

  return items.reduce((total, item) => {
    const itemReturns = returns.filter((r) => r.rental_order_item_id === item.id);

    const returnedCost = itemReturns.reduce((sum, r) => {
      const daysUsed = Math.max(0, daysBetween(startDate, new Date(r.return_date)));
      return sum + r.quantity_returned * item.daily_rate_actual * daysUsed;
    }, 0);

    const outstandingCost = item.quantity_outstanding * item.daily_rate_actual * daysElapsed;
    return total + returnedCost + outstandingCost;
  }, 0);
}

export function calculateExpectedRemaining(
  items: CostItem[],
  startDate: string,
  expectedReturnDate: string,
  today: Date = new Date()
): number {
  const todayStr = today.toISOString().split("T")[0];
  const daysRemaining = Math.max(0, daysBetween(todayStr, new Date(expectedReturnDate)));

  return items.reduce((total, item) => {
    return total + item.quantity_outstanding * item.daily_rate_actual * daysRemaining;
  }, 0);
}

export function calculateDailyBurnRate(spentToDate: number, daysElapsed: number): number {
  if (daysElapsed === 0) return 0;
  return Math.round(spentToDate / daysElapsed);
}
