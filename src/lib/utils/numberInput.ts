import type React from "react";

/**
 * Stop a focused `<input type="number">` from changing its value when the user
 * scrolls the mouse wheel over it. Native number inputs step the value by the
 * field's `step` (default 1) on wheel, so an accidental scroll silently turns
 * e.g. 45000 into 44999. Blurring the input on wheel lets the page scroll
 * instead and leaves the value untouched.
 *
 * Usage: `<TextField type="number" onWheel={blurOnWheel} … />`
 */
export const blurOnWheel = (
  e: React.WheelEvent<HTMLElement>
): void => {
  const target = e.target as HTMLElement & { blur?: () => void };
  target.blur?.();
};
