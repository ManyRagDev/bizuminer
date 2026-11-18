export type CaptureLeaseState = { phase: string; leaseUntil: Date | string };

/** A timer is only a wake-up. The durable state, re-read by the listener,
 * decides whether an old process lost its lease; a delayed signal cannot
 * make the original deadline override a valid extension. */
export class CaptureLeaseMonitor {
  readonly controller = new AbortController();
  private claimed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly wake: () => void;
  private readonly clock: { now: () => number; setTimeout: (run: () => void, delay: number) => ReturnType<typeof setTimeout>; clearTimeout: (timer: ReturnType<typeof setTimeout> | undefined) => void };

  constructor(wake: () => void, clock = {
    now: () => Date.now(),
    setTimeout: (run: () => void, delay: number) => setTimeout(run, delay),
    clearTimeout: (timer: ReturnType<typeof setTimeout> | undefined) => clearTimeout(timer),
  }) { this.wake=wake;this.clock=clock; }

  update(state: CaptureLeaseState | null) {
    this.stop();
    if (this.controller.signal.aborted) return;
    if (!state || state.phase === "retry_wait" || (state.phase === "queued" && this.claimed)) {
      // Terminal/waiting state or a recovered queue record no longer belongs
      // to the old subprocess. Its database writes are already fenced.
      this.controller.abort();
      return;
    }
    if (state.phase !== "queued") this.claimed = true;
    const deadline = +new Date(state.leaseUntil);
    if (!Number.isFinite(deadline)) {
      this.controller.abort();
      return;
    }
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      this.wake();
    }, Math.max(1000, deadline - this.clock.now()));
  }

  stop() {
    this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }
}
