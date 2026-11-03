import mupdf from "mupdf";
import type { Font } from "mupdf";

let bengali: Font | undefined;
let loading: Promise<void> | undefined;

// Keep the font alive for the worker lifetime. MuPDF's built-in shaping engine
// needs a real fallback font for Bengali; Helvetica has none of these glyphs.
export function registerTextFont(data: Uint8Array) {
  if (bengali) return;
  bengali = new mupdf.Font("Noto Sans Bengali", data);
  mupdf.installLoadFontFunction((name, script) =>
    script === "Bengali" || name === "Noto Sans Bengali" ? bengali! : null,
  );
}

export function ensureTextFont() {
  if (bengali) return Promise.resolve();
  return (loading ||= fetch(
    `${import.meta.env.BASE_URL}fonts/NotoSansBengali.ttf`,
  )
    .then(async (response) => {
      if (!response.ok)
        throw new Error("The text font could not be loaded. Please try again.");
      registerTextFont(new Uint8Array(await response.arrayBuffer()));
    })
    .catch((error) => {
      loading = undefined;
      throw error;
    }));
}
