import mupdf from "mupdf";
import type { Font } from "mupdf";
import { DEFAULT_FONT, findFont, fontAlias } from "./font-catalog";
import { loadFontData } from "./font-assets";

let bengali: Font | undefined;
let loading: Promise<void> | undefined;
const fonts = new Map<string, Font>();
const pending = new Map<string, Promise<void>>();

function installLoader() {
  mupdf.installLoadFontFunction(
    (name, script) =>
      fonts.get(name) ||
      (script === "Bengali" || name === "Noto Sans Bengali"
        ? bengali || null
        : null),
  );
}

export function registerSelectedFont(id: string, data: Uint8Array) {
  if (!findFont(id)) throw new Error("Unknown text font.");
  const alias = fontAlias(id);
  if (!fonts.has(alias)) fonts.set(alias, new mupdf.Font(alias, data));
  installLoader();
}

export async function ensureSelectedFont(id = DEFAULT_FONT) {
  await ensureTextFont();
  if (id === DEFAULT_FONT || fonts.has(fontAlias(id))) return;
  let request = pending.get(id);
  if (!request) {
    request = loadFontData(id)
      .then((data) => registerSelectedFont(id, new Uint8Array(data)))
      .finally(() => pending.delete(id));
    pending.set(id, request);
  }
  await request;
}

export function missingFontCharacters(id: string, text: string) {
  const font = fonts.get(fontAlias(id));
  if (!font) return [];
  return [...new Set(Array.from(text))]
    .filter(
      (char) =>
        !/[\s\u200c\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069\ufe00-\ufe0f]/u.test(
          char,
        ) && font.encodeCharacter(char.codePointAt(0)!) === 0,
    )
    .slice(0, 12);
}

// Keep the font alive for the worker lifetime. MuPDF's built-in shaping engine
// needs a real fallback font for Bengali; Helvetica has none of these glyphs.
export function registerTextFont(data: Uint8Array) {
  if (bengali) return;
  bengali = new mupdf.Font("Noto Sans Bengali", data);
  installLoader();
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
