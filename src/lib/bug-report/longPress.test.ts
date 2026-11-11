import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createLongPressDetector } from "./longPress";

describe("createLongPressDetector", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const press = { clientX: 100, clientY: 100, target: null, button: 0, isPrimary: true };

  it("fires after the delay when the pointer stays still", () => {
    const onLongPress = vi.fn();
    const d = createLongPressDetector({ delay: 800, onLongPress });
    d.down(press);
    vi.advanceTimersByTime(799);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress.mock.calls[0][0]).toMatchObject({ x: 100, y: 100 });
    expect(d.justFired()).toBe(true);
  });

  it("tolerates small jitter but cancels on real movement", () => {
    const onLongPress = vi.fn();
    const d = createLongPressDetector({ delay: 800, moveTolerance: 10, onLongPress });
    d.down(press);
    d.move({ clientX: 106, clientY: 95 });
    vi.advanceTimersByTime(800);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    d.down(press);
    d.move({ clientX: 125, clientY: 100 });
    vi.advanceTimersByTime(1000);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("cancels on release and on scroll (cancel)", () => {
    const onLongPress = vi.fn();
    const d = createLongPressDetector({ delay: 800, onLongPress });
    d.down(press);
    vi.advanceTimersByTime(400);
    d.up();
    vi.advanceTimersByTime(1000);
    d.down(press);
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("ignores secondary buttons, non-primary pointers and filtered targets", () => {
    const onLongPress = vi.fn();
    const d = createLongPressDetector({ delay: 100, onLongPress, shouldStart: () => false });
    d.down(press);
    vi.advanceTimersByTime(200);
    const d2 = createLongPressDetector({ delay: 100, onLongPress });
    d2.down({ ...press, button: 2 });
    d2.down({ ...press, isPrimary: false });
    vi.advanceTimersByTime(200);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
