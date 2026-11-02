import { engine } from "./client";
import type { Rect, RenderResult } from "./types";
interface Job {
  key: string;
  epoch: string;
  page: number;
  scale: number;
  clip?: Rect;
  priority: number;
  resolve: (r: RenderResult) => void;
  reject: (e: Error) => void;
}
class RenderQueue {
  private epoch = "";
  private jobs: Job[] = [];
  private running = false;
  private cache = new Map<string, RenderResult>();
  private size = 0;
  private waiting = new Map<string, Promise<RenderResult>>();
  setEpoch(epoch: string) {
    if (epoch === this.epoch) return;
    this.epoch = epoch;
    for (const j of this.jobs) j.reject(new Error("STALE_RENDER"));
    this.jobs = [];
    for (const r of this.cache.values()) r.bitmap?.close();
    this.cache.clear();
    this.waiting.clear();
    this.size = 0;
  }
  render(page: number, scale: number, clip?: Rect, priority = 10) {
    const epoch = this.epoch,
      key = `${epoch}:${page}:${scale.toFixed(3)}:${clip?.join(",") || "all"}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    const existing = this.waiting.get(key);
    if (existing) return existing;
    const promise = new Promise<RenderResult>((resolve, reject) => {
      this.jobs.push({
        key,
        epoch,
        page,
        scale,
        clip,
        priority,
        resolve,
        reject,
      });
      this.jobs.sort((a, b) => b.priority - a.priority);
      void this.pump();
    });
    this.waiting.set(key, promise);
    return promise;
  }
  private async pump() {
    if (this.running) return;
    this.running = true;
    while (this.jobs.length) {
      const job = this.jobs.shift()!;
      if (job.epoch !== this.epoch) {
        job.reject(new Error("STALE_RENDER"));
        continue;
      }
      try {
        const result = await engine.call(
          "render",
          job.page,
          job.scale,
          job.clip,
        );
        if (job.epoch !== this.epoch) {
          result.bitmap?.close();
          job.reject(new Error("STALE_RENDER"));
          continue;
        }
        this.cache.set(job.key, result);
        this.size += result.width * result.height * 4;
        while (this.size > 48 * 1024 * 1024 && this.cache.size > 1) {
          const first = this.cache.keys().next().value!;
          const value = this.cache.get(first)!;
          this.size -= value.width * value.height * 4;
          value.bitmap?.close();
          this.cache.delete(first);
        }
        job.resolve(result);
      } catch (e) {
        job.reject(e as Error);
      } finally {
        this.waiting.delete(job.key);
      }
    }
    this.running = false;
  }
  stats() {
    return {
      cachedBytes: this.size,
      cachedTiles: this.cache.size,
      queued: this.jobs.length,
      running: this.running,
    };
  }
}
export const renderQueue = new RenderQueue();
