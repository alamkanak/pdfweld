import { PDFEngine } from "../lib/engine";
const engine = new PDFEngine();
self.onmessage = async ({ data: { id, method, args } }) => {
  try {
    const fn = (
      engine as unknown as Record<string, (...args: unknown[]) => unknown>
    )[method];
    if (typeof fn !== "function") throw new Error("Unknown engine method.");
    const result = await fn.apply(engine, args);
    if (
      method === "render" &&
      typeof createImageBitmap === "function" &&
      result &&
      typeof result === "object" &&
      "pixels" in result
    ) {
      const render = result as {
        pixels?: Uint8ClampedArray<ArrayBuffer>;
        width: number;
        height: number;
        bitmap?: ImageBitmap;
      };
      try {
        render.bitmap = await createImageBitmap(
          new ImageData(render.pixels!, render.width, render.height),
        );
        delete render.pixels;
      } catch {
        /* transferable pixels remain the compatibility fallback */
      }
    }
    const transfer: Transferable[] = [],
      seen = new Set<Transferable>();
    const collect = (value: unknown) => {
      if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
        if (!seen.has(value.buffer)) {
          seen.add(value.buffer);
          transfer.push(value.buffer);
        }
      } else if (
        typeof ImageBitmap !== "undefined" &&
        value instanceof ImageBitmap
      ) {
        if (!seen.has(value)) {
          seen.add(value);
          transfer.push(value);
        }
      } else if (Array.isArray(value)) value.forEach(collect);
      else if (
        value &&
        typeof value === "object" &&
        Object.getPrototypeOf(value) === Object.prototype
      )
        Object.values(value).forEach(collect);
    };
    collect(result);
    self.postMessage({ id, result }, transfer);
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};

self.postMessage({ ready: true });
