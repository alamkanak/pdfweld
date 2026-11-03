let font: Promise<void> | undefined;
export let editorFontsReady = false;
export function loadEditorFont() {
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
