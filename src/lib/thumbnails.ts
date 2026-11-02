import { EngineClient } from "./client";
import { library } from "./files";
import type { RecentFile } from "./types";
export const thumbnailBlob = (data: NonNullable<RecentFile["thumbnail"]>) =>
  data instanceof Blob
    ? data
    : new Blob([new Uint8Array(data)], { type: "image/png" });

export type ThumbnailResult = {
  blob?: Blob;
  status: "ready" | "locked" | "unavailable" | "cancelled";
};
type Job = {
  key: string;
  file: RecentFile;
  wanted: (() => boolean)[];
  resolve: (value: ThumbnailResult) => void;
  promise: Promise<ThumbnailResult>;
};

/** Only visible library entries are queued; one disposable worker serves them. */
class ThumbnailQueue {
  private client: EngineClient | null = null;
  private jobs: Job[] = [];
  private pending = new Map<string, Job>();
  private running = false;
  private epoch = 0;
  private idle: ReturnType<typeof setTimeout> | undefined;

  request(file: RecentFile, wanted: () => boolean): Promise<ThumbnailResult> {
    if (file.thumbnail)
      return Promise.resolve({
        blob: thumbnailBlob(file.thumbnail),
        status: "ready",
      });
    clearTimeout(this.idle);
    const key = `${file.id}:${file.updated}`;
    const existing = this.pending.get(key);
    if (existing) {
      existing.wanted.push(wanted);
      return existing.promise;
    }
    let resolve!: Job["resolve"];
    const promise = new Promise<ThumbnailResult>((done) => {
      resolve = done;
    });
    const job = { key, file, resolve, promise, wanted: [wanted] };
    this.pending.set(key, job);
    this.jobs.push(job);
    void this.pump();
    return promise;
  }
  cancel() {
    this.epoch++;
    clearTimeout(this.idle);
    this.client?.dispose();
    this.client = null;
    for (const job of this.pending.values())
      job.resolve({ status: "cancelled" });
    this.pending.clear();
    this.jobs = [];
  }
  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.jobs.length) {
        const job = this.jobs.shift()!,
          epoch = this.epoch;
        try {
          if (!job.wanted.some((wanted) => wanted())) {
            job.resolve({ status: "cancelled" });
            continue;
          }
          const stored = await library.files.get(job.file.id);
          if (epoch !== this.epoch) continue;
          if (stored?.thumbnail && stored.updated === job.file.updated) {
            job.resolve({
              blob: thumbnailBlob(stored.thumbnail),
              status: "ready",
            });
            continue;
          }
          this.client ||= new EngineClient();
          await this.client.call("open", job.file.bytes, job.file.name);
          const data = await this.client.call("thumbnail");
          if (epoch !== this.epoch) continue;
          const blob = new Blob([new Uint8Array(data)], { type: "image/png" });
          await library
            .transaction("rw", library.files, async () => {
              const current = await library.files.get(job.file.id);
              if (
                current &&
                current.updated === job.file.updated &&
                !current.thumbnail
              )
                await library.files.update(current.id, { thumbnail: data });
            })
            .catch(() => {
              /* Display the rendered preview even if cache storage is unavailable. */
            });
          job.resolve({ blob, status: "ready" });
        } catch (e) {
          job.resolve({
            status:
              epoch !== this.epoch
                ? "cancelled"
                : (e as Error).message === "PASSWORD_REQUIRED"
                  ? "locked"
                  : "unavailable",
          });
        } finally {
          if (this.pending.get(job.key) === job) this.pending.delete(job.key);
        }
      }
    } finally {
      this.running = false;
      if (this.pending.size === 0)
        this.idle = setTimeout(() => {
          this.client?.dispose();
          this.client = null;
        }, 1500);
    }
  }
}
export const thumbnails = new ThumbnailQueue();
