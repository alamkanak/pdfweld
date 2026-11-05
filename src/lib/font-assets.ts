import { findFont, fontURL, googleFonts } from "./font-catalog";

const CACHE = "pdfweld-fonts-v1";
const pending = new Map<string, Promise<ArrayBuffer>>();

async function cache() {
  try {
    return typeof caches !== "undefined" ? await caches.open(CACHE) : null;
  } catch {
    return null;
  }
}

export async function cachedFontIds() {
  const storage = await cache();
  if (!storage) return new Set<string>();
  try {
    const requests = await storage.keys();
    return new Set(
      googleFonts
        .filter((font) =>
          requests.some((request) =>
            request.url.endsWith(`/fonts/google/${font.file}`),
          ),
        )
        .map((font) => font.id),
    );
  } catch {
    return new Set<string>();
  }
}

export function loadFontData(id: string): Promise<ArrayBuffer> {
  const previous = pending.get(id);
  if (previous) return previous;
  const request = (async () => {
    const font = findFont(id);
    if (!font) throw new Error("This font is not available.");
    const url = fontURL(id);
    const storage = await cache();
    let saved: Response | undefined;
    try {
      saved = await storage?.match(url);
    } catch {
      /* Storage is optional. */
    }
    const response = saved || (await fetch(url));
    if (!response.ok)
      throw new Error(
        "Could not download this font. Check your connection and try again.",
      );
    const data = await response.arrayBuffer();
    // Pinned files must never be confused with an HTML offline fallback or a
    // truncated download. Use the same verified bytes for editing and export.
    const signature =
      data.byteLength >= 4 ? new DataView(data).getUint32(0) : 0;
    if (
      data.byteLength !== font.bytes ||
      ![0x00010000, 0x4f54544f].includes(signature)
    ) {
      try {
        await storage?.delete(url);
      } catch {
        /* Best effort. */
      }
      throw new Error("The font download is incomplete. Please try again.");
    }
    if (globalThis.crypto?.subtle) {
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== font.sha256) {
        try {
          await storage?.delete(url);
        } catch {
          /* Best effort. */
        }
        throw new Error(
          "The font download could not be verified. Please try again.",
        );
      }
    }
    if (!saved) {
      try {
        await storage?.put(
          url,
          new Response(data, { headers: { "Content-Type": "font/ttf" } }),
        );
      } catch {
        /* A full cache must not block editing. */
      }
    }
    return data;
  })();
  pending.set(id, request);
  void request.finally(() => pending.delete(id)).catch(() => {});
  return request;
}
