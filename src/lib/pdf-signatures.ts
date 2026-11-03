import type { PDFDocument, PDFObject } from "mupdf";

/** Repair legacy unit-square image stamps without changing their rendered
 * geometry. PDFKit otherwise fits the square appearance into a narrow box. */
export function normalizeImageAppearances(document: PDFDocument) {
  for (let index = 0; index < document.countPages(); index++) {
    document
      .findPage(index)
      .get("Annots")
      .forEach((annotation) => {
        if (annotation.get("Subtype").asName() !== "Stamp") return;
        const appearance = annotation.get("AP", "N");
        if (
          !appearance.isStream() ||
          appearance.get("Resources", "XObject", "I", "Subtype").asName() !==
            "Image"
        )
          return;
        const bbox = appearance.get("BBox").asJS();
        if (JSON.stringify(bbox) !== "[0,0,1,1]") return;
        const stream = appearance.readStream();
        try {
          if (!/^\s*\/I\s+Do\s*$/.test(stream.asString())) return;
        } finally {
          stream.destroy();
        }
        const rect = annotation.get("Rect").asJS() as number[];
        const width = rect[2] - rect[0],
          height = rect[3] - rect[1];
        const normalized = document.addStream(
          `q ${width} 0 0 ${height} 0 0 cm /I Do Q\n`,
          {
            Type: document.newName("XObject"),
            Subtype: document.newName("Form"),
            BBox: [0, 0, width, height],
            Matrix: [1, 0, 0, 1, 0, 0],
            Resources: appearance.get("Resources"),
          },
        );
        annotation.get("AP").put("N", normalized);
      });
  }
}

function isSignature(object: PDFObject) {
  if (!["Stamp", "Ink"].includes(object.get("Subtype").asName())) return false;
  return (
    object.get("PDFWeldSignature").asBoolean() ||
    !!object.get("PDFWeldSignatureGroup").asString() ||
    object.get("Contents").asString() === "Signature"
  );
}

/** Burn signatures on a disposable export document, preserving other markup
 * and interactive form fields. MuPDF bakes the original vector appearance. */
export function burnSignatures(document: PDFDocument) {
  const pages: {
    page: PDFObject;
    signatures: PDFObject;
    retained: PDFObject;
  }[] = [];
  let count = 0;
  for (let index = 0; index < document.countPages(); index++) {
    const page = document.findPage(index);
    const annotations = page.get("Annots");
    if (!annotations.isArray()) continue;
    const signatures = document.newArray(),
      retained = document.newArray();
    annotations.forEach((annotation) => {
      if (isSignature(annotation)) {
        signatures.push(annotation);
        count++;
      } else retained.push(annotation);
    });
    pages.push({ page, signatures, retained });
  }
  if (!count) return;
  // Detach every other annotation before baking, including pages without a
  // signature. The AcroForm tree and its field/widget objects remain intact.
  for (const { page, signatures } of pages) page.put("Annots", signatures);
  document.bake(true, false);
  for (const { page, retained } of pages) {
    if (retained.length) page.put("Annots", retained);
    else page.delete("Annots");
  }
}
