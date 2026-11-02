import PDFWorker from "../workers/pdf.worker?worker";
import type { PDFEngine } from "./engine";
import { metrics } from "./performance";
type Method = {
  [K in keyof PDFEngine]: PDFEngine[K] extends (...args: never[]) => unknown
    ? K
    : never;
}[keyof PDFEngine];
export class EngineClient {
  private worker: Worker | null = null;
  private ready = false;
  private outbound: unknown[] = [];
  private next = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      started: number;
      method: string;
    }
  >();
  private init() {
    if (this.worker) return;
    this.worker = new PDFWorker();
    this.worker.onmessage = ({ data }) => {
      if (data.ready) {
        this.ready = true;
        for (const message of this.outbound) this.worker!.postMessage(message);
        this.outbound = [];
        return;
      }
      const item = this.pending.get(data.id);
      if (!item) return;
      this.pending.delete(data.id);
      metrics.record(item.method, performance.now() - item.started);
      if (data.error) item.reject(new Error(data.error));
      else item.resolve(data.result);
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values())
        p.reject(new Error(e.message || "PDF engine could not start."));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
      this.ready = false;
      this.outbound = [];
    };
  }
  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.outbound = [];
    for (const p of this.pending.values())
      p.reject(new Error("Engine closed."));
    this.pending.clear();
  }
  call<K extends Method>(
    method: K,
    ...args: Parameters<Extract<PDFEngine[K], (...args: any[]) => any>>
  ): Promise<
    Awaited<ReturnType<Extract<PDFEngine[K], (...args: any[]) => any>>>
  > {
    this.init();
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      this.pending.set(id, {
        resolve,
        reject,
        started: performance.now(),
        method,
      });
      const message = { id, method, args };
      if (this.ready) this.worker!.postMessage(message);
      else this.outbound.push(message);
    });
  }
}
export const engine = new EngineClient();
