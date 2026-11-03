let font: Promise<FontFace> | undefined;
export function loadEditorFont() {
  return (font ||= new FontFace(
    "Noto Sans Bengali",
    `url(${import.meta.env.BASE_URL}fonts/NotoSansBengali.ttf)`,
  )
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
      return loaded;
    })
    .catch((error) => {
      font = undefined;
      throw error;
    }));
}
