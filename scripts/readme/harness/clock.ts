// A fixed, fictional "now" that keeps running in real time. The desktop page picks the offset;
// every app window (iframe) reuses it so all clocks agree.
type Top = { __twOffset?: number };

/** Thursday, November 12 2026, 15:41:20 local time. */
export const DEMO_START = new Date(2026, 10, 12, 15, 41, 20).getTime();

export function installClock() {
  const top = window.top as unknown as Top;
  const RealDate = Date;
  if (top === (window as unknown as Top)) top.__twOffset = DEMO_START - RealDate.now();
  const offset = () => top.__twOffset ?? 0;
  class FakeDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + offset());
      // @ts-expect-error forwarding Date's overloads
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset();
    }
  }
  (window as unknown as { Date: DateConstructor }).Date = FakeDate as unknown as DateConstructor;
}
