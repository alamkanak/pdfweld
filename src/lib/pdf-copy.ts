import mupdf from "mupdf";
import type { PDFDocument, PDFObject } from "mupdf";
// Grafting a MuPDF page intentionally excludes annotations and the AcroForm tree.
// Copy those explicitly, rebuilding field ancestry and page references for the selected pages.
export function copyPages(
  target: PDFDocument,
  source: PDFDocument,
  indices: number[],
  at: number,
) {
  const following =
    at < target.countPages()
      ? (() => {
          const p = target.loadPage(at);
          try {
            return p.getLabel();
          } finally {
            p.destroy();
          }
        })()
      : null;
  const setLabel = (index: number, label: string) =>
    target.setPageLabels(
      index,
      /^\d+$/.test(label) ? "D" : "\0",
      /^\d+$/.test(label) ? "" : label,
      /^\d+$/.test(label) ? Number(label) : 1,
    );
  const map = target.newGraftMap();
  const held: PDFObject[] = [];
  const keep = (o: PDFObject) => {
    held.push(o);
    return o;
  };
  const pageMap = new Map<number, PDFObject>();
  const annotationMap = new Map<number, PDFObject>();
  const fieldMap = new Map<number, PDFObject>();
  const incoming: { src: PDFObject; dst: PDFObject; page: PDFObject }[] = [];
  const sourceForm = keep(source.getTrailer().get("Root", "AcroForm"));
  let form: PDFObject | null = null;
  const sourceFonts = sourceForm.isNull()
    ? mupdf.PDFObject.Null
    : sourceForm.get("DR", "Font");
  const fontNames = new Map<string, string>();
  const ensureForm = () => {
    if (form) return form;
    const root = keep(target.getTrailer().get("Root"));
    form = keep(root.get("AcroForm"));
    if (form.isNull()) {
      form = keep(target.newDictionary());
      form.put("Fields", []);
      form.put("DR", { Font: {} });
      root.put("AcroForm", form);
    }
    if (form.get("Fields").isNull()) form.put("Fields", []);
    if (form.get("DR").isNull()) form.put("DR", { Font: {} });
    if (form.get("DR", "Font").isNull()) form.get("DR").put("Font", {});
    sourceFonts.forEach((font, key) => {
      const name = `Weld${at}_${String(key)}`;
      form!.get("DR", "Font").put(name, map.graftObject(font));
      fontNames.set(String(key), name);
    });
    return form;
  };
  const rewriteDA = (value: string) => {
    for (const [before, after] of fontNames)
      value = value.replaceAll(`/${before} `, `/${after} `);
    return value;
  };
  const dictionary = (src: PDFObject, skip: Set<string>) => {
    const dst = keep(target.newDictionary());
    src.forEach((v, k) => {
      if (!skip.has(String(k))) dst.put(k, map.graftObject(v));
    });
    return dst;
  };
  try {
    for (let n = 0; n < indices.length; n++) {
      const i = indices[n];
      map.graftPage(at + n, source, i);
      pageMap.set(
        source.findPage(i).asIndirect(),
        keep(target.findPage(at + n)),
      );
    }
    for (let n = 0; n < indices.length; n++) {
      const srcPage = keep(source.findPage(indices[n])),
        dstPage = keep(target.findPage(at + n)),
        annots = srcPage.get("Annots");
      const refs: PDFObject[] = [];
      annots.forEach((src) => {
        const subtype = src.get("Subtype").asName();
        if (subtype === "Link") return;
        const dict = dictionary(
          src,
          new Set(["P", "Parent", "Kids", "IRT", "Popup"]),
        );
        dict.put("P", dstPage);
        const dst = keep(target.addObject(dict));
        annotationMap.set(src.asIndirect(), dst);
        incoming.push({ src: keep(src), dst, page: dstPage });
        refs.push(dst);
        if (subtype === "Widget") {
          ensureForm();
          fieldMap.set(src.asIndirect(), dst);
        }
      });
      if (refs.length) dstPage.put("Annots", refs);
    }
    const sourceOC = source.getTrailer().get("Root", "OCProperties");
    if (!sourceOC.isNull()) {
      const root = target.getTrailer().get("Root");
      let targetOC = root.get("OCProperties");
      if (targetOC.isNull()) {
        root.put("OCProperties", map.graftObject(sourceOC));
      } else {
        if (targetOC.get("OCGs").isNull()) targetOC.put("OCGs", []);
        if (targetOC.get("D").isNull()) targetOC.put("D", {});
        const config = targetOC.get("D");
        for (const key of ["ON", "OFF", "Order"])
          if (config.get(key).isNull()) config.put(key, []);
        sourceOC.get("OCGs").forEach((group, index) => {
          const copied = map.graftObject(group);
          targetOC.get("OCGs").push(copied);
          config
            .get(source.isLayerVisible(Number(index)) ? "ON" : "OFF")
            .push(copied);
          config.get("Order").push(copied);
          copied.destroy();
        });
      }
    }
    for (let n = 0; n < indices.length; n++) {
      const page = source.loadPage(indices[n]);
      try {
        setLabel(at + n, page.getLabel());
      } finally {
        page.destroy();
      }
    }
    if (following !== null) setLabel(at + indices.length, following);
    const added = new Set<number>();
    const connectField = (src: PDFObject, dst: PDFObject) => {
      const parent = src.get("Parent");
      if (!parent.isNull()) {
        let destParent = fieldMap.get(parent.asIndirect());
        if (!destParent) {
          const dict = dictionary(parent, new Set(["Kids", "Parent", "P"]));
          dict.put("Kids", []);
          destParent = keep(target.addObject(dict));
          fieldMap.set(parent.asIndirect(), destParent);
          connectField(parent, destParent);
        }
        dst.put("Parent", destParent);
        const kids = destParent.get("Kids");
        if (!added.has(dst.asIndirect())) {
          kids.push(dst);
          added.add(dst.asIndirect());
        }
      } else if (!added.has(dst.asIndirect())) {
        const roots = ensureForm().get("Fields");
        const names = new Set<string>();
        roots.forEach((o) => names.add(o.get("T").asString()));
        const original = dst.get("T").asString();
        let name = original,
          n = 2;
        while (names.has(name)) name = `${original} (${n++})`;
        if (name !== original) dst.put("T", target.newString(name));
        roots.push(dst);
        added.add(dst.asIndirect());
      }
      const da = src.getInheritable("DA");
      const value = da.isString()
        ? da.asString()
        : sourceForm.isNull()
          ? ""
          : sourceForm.get("DA").asString();
      if (value) dst.put("DA", target.newString(rewriteDA(value)));
    };
    for (const item of incoming) {
      if (item.src.get("Subtype").asName() === "Widget")
        connectField(item.src, item.dst);
      for (const key of ["IRT", "Popup"]) {
        const original = item.src.get(key);
        const replacement = annotationMap.get(original.asIndirect());
        if (replacement) item.dst.put(key, replacement);
      }
    }
    // Rebuild links using resolved destinations instead of retaining references to source pages.
    for (let n = 0; n < indices.length; n++) {
      const sp = source.loadPage(indices[n]),
        dp = target.loadPage(at + n);
      try {
        for (const link of sp.getLinks()) {
          try {
            const uri = link.getURI();
            if (link.isExternal()) {
              if (/^https?:\/\//i.test(uri)) {
                const l = dp.createLink(link.getBounds(), uri);
                l.destroy();
              }
            } else {
              const destination = source.resolveLinkDestination(uri);
              const index = indices.indexOf(destination.page);
              if (index >= 0) {
                const l = dp.createLink(
                  link.getBounds(),
                  `#page=${at + index + 1}`,
                );
                l.destroy();
              }
            }
          } finally {
            link.destroy();
          }
        }
      } finally {
        sp.destroy();
        dp.destroy();
      }
    }
  } finally {
    map.destroy();
    for (const o of held.reverse()) o.destroy();
  }
}
export function copyAttachments(target: PDFDocument, source: PDFDocument) {
  const existing = target.getEmbeddedFiles();
  const incoming = source.getEmbeddedFiles();
  try {
    for (const [original, ref] of Object.entries(incoming)) {
      let name = original,
        n = 2;
      while (name in existing) name = `${original} (${n++})`;
      const buffer = source.getEmbeddedFileContents(ref);
      if (!buffer) continue;
      try {
        const payload = new Uint8Array(buffer.asUint8Array());
        const params = source.getFilespecParams(ref);
        const stream = target.addStream(payload, {
          Type: "EmbeddedFile",
          Subtype: target.newName(
            params.mimetype || "application/octet-stream",
          ),
          Params: { Size: payload.length },
        });
        const filespec = target.addObject({
          Type: "Filespec",
          F: target.newString(name),
          UF: target.newString(name),
          EF: { F: stream },
        });
        target.insertEmbeddedFile(name, filespec);
        existing[name] = filespec;
        stream.destroy();
      } finally {
        buffer.destroy();
      }
    }
  } finally {
    Object.values(existing).forEach((o) => o.destroy());
    Object.values(incoming).forEach((o) => o.destroy());
  }
}
interface BookmarkNode {
  title?: string;
  page?: number;
  uri?: string;
  down?: BookmarkNode[];
}
export function writeBookmarks(doc: PDFDocument, items: BookmarkNode[]) {
  const root = doc.addObject({ Type: "Outlines" });
  const held: PDFObject[] = [root];
  const build = (nodes: BookmarkNode[], parent: PDFObject): number => {
    let previous: PDFObject | null = null,
      first: PDFObject | null = null,
      count = 0;
    for (const node of nodes) {
      if (
        node.page === undefined ||
        node.page < 0 ||
        node.page >= doc.countPages()
      )
        continue;
      const current = doc.addObject({
        Title: doc.newString(node.title || "Bookmark"),
        Parent: parent,
        Dest: [doc.findPage(node.page), "Fit"],
      });
      held.push(current);
      if (!first) first = current;
      if (previous) {
        previous.put("Next", current);
        current.put("Prev", previous);
      }
      previous = current;
      count++;
      if (node.down?.length) {
        const descendants = build(node.down, current);
        current.put("Count", -descendants);
        count += descendants;
      }
    }
    if (first) parent.put("First", first);
    if (previous) parent.put("Last", previous);
    return count;
  };
  try {
    root.put("Count", build(items, root));
    doc.getTrailer().get("Root").put("Outlines", root);
  } finally {
    held.forEach((o) => o.destroy());
  }
}
export function mappedBookmarks(
  items: BookmarkNode[],
  indices: number[],
  offset = 0,
): BookmarkNode[] {
  return items.flatMap((item) => {
    const original =
      item.page ?? Number(item.uri?.match(/page=(\d+)/)?.[1] || 0) - 1;
    const page = indices.indexOf(original);
    const down = item.down ? mappedBookmarks(item.down, indices, offset) : [];
    return page >= 0
      ? [{ title: item.title, page: offset + page, down }]
      : down;
  });
}
