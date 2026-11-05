import { DEFAULT_FONT, fontAlias } from "./font-catalog";
import { loadFontData } from "./font-assets";

let font: Promise<void> | undefined;
export let editorFontsReady = false;
const custom = new Map<string, Promise<void>>();
export async function loadEditorFont(id = DEFAULT_FONT): Promise<void> {
  await loadDefaultFonts();
  if (id === DEFAULT_FONT) return;
  let pending = custom.get(id);
  if (!pending) {
    pending = loadFontData(id)
      .then(async (data) => {
        const face = await new FontFace(fontAlias(id), data).load();
        document.fonts.add(face);
      })
      .catch((error) => {
        custom.delete(id);
        throw error;
      });
    custom.set(id, pending);
  }
  await pending;
}

function loadDefaultFonts() {
  return (font ||= Promise.all([
    new FontFace(
      "PDFWeld Helvetica",
      `url(${import.meta.env.BASE_URL}fonts/NimbusSans-Regular.otf)`,
    ).load(),
    new FontFace(
      "Noto Sans Bengali",
      `url(${import.meta.env.BASE_URL}fonts/NotoSansBengali.ttf)`,
      { unicodeRange: "U+0980-09FF,U+200C-200D" },
    ).load(),
  ])
    .then((loaded) => {
      loaded.forEach((face) => document.fonts.add(face));
      editorFontsReady = true;
    })
    .catch((error) => {
      font = undefined;
      editorFontsReady = false;
      throw error;
    }));
}
