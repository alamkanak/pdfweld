import type { BenchmarkReport } from "./types";
const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
};
class Metrics {
  samples = new Map<string, number[]>();
  input: number[] = [];
  frameTimes: number[] = [];
  longTasks: number[] = [];
  private active = false;
  private raf = 0;
  private observer: PerformanceObserver | null = null;
  private started = 0;
  private longTasksSupported = false;
  record(type: string, ms: number) {
    const a = this.samples.get(type) || [];
    a.push(ms);
    if (a.length > 300) a.shift();
    this.samples.set(type, a);
  }
  recordInput(ms: number) {
    this.input.push(ms);
    if (this.input.length > 1000) this.input.shift();
  }
  start() {
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.samples.clear();
    this.input = [];
    this.frameTimes = [];
    this.longTasks = [];
    this.active = true;
    this.started = performance.now();
    let previous = 0;
    const tick = (now: number) => {
      if (!this.active) return;
      if (previous) this.frameTimes.push(now - previous);
      previous = now;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.longTasksSupported =
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("longtask") === true;
    if (this.longTasksSupported)
      try {
        this.observer = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) this.longTasks.push(e.duration);
        });
        this.observer.observe({ entryTypes: ["longtask"] });
      } catch {
        this.longTasksSupported = false;
      }
  }
  stop(scenario = "document interaction"): BenchmarkReport {
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    const frames = this.frameTimes.filter((t) => t > 0),
      median = percentile(frames, 0.5),
      hz = median ? Math.round(1000 / median) : 0;
    const expected = hz ? 1000 / Math.min(120, hz) : median;
    const p95 = percentile(frames, 0.95),
      renders = this.samples.get("render") || [];
    return {
      version: "1",
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      viewport: `${innerWidth}×${innerHeight}`,
      devicePixelRatio,
      scenario,
      durationMs: performance.now() - this.started,
      displayHz: hz,
      fps: frames.length
        ? 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)
        : 0,
      frameP50: median,
      frameP95: p95,
      frameP99: percentile(frames, 0.99),
      droppedFrames: frames.reduce(
        (n, t) => n + Math.max(0, Math.round(t / expected) - 1),
        0,
      ),
      longTasks: this.longTasksSupported ? this.longTasks.length : null,
      longTaskMs: this.longTasksSupported
        ? this.longTasks.reduce((a, b) => a + b, 0)
        : null,
      longTasksSupported: this.longTasksSupported,
      inputP95: percentile(this.input, 0.95),
      inputSamples: this.input.length,
      renderP95: percentile(renders, 0.95),
      renders: renders.length,
      targetFps: 120,
      targetMet: hz >= 110 && p95 <= 9.2,
      notes: [
        ...(!this.longTasksSupported
          ? [
              "The long-task API is unavailable in this browser; no long-task count is reported.",
            ]
          : []),
        "Timer precision can round sub-millisecond handler work to zero.",
        ...(hz < 110
          ? [
              "The measured browser cadence is below 120 Hz. A 120 FPS result cannot be established on this display/session.",
            ]
          : []),
        "Frame intervals measure browser presentation cadence, not GPU execution time. Input samples measure handler CPU time, not end-to-end stylus latency.",
      ],
    };
  }
}
export const metrics = new Metrics();
export { percentile };
