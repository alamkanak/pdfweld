import mupdf from "mupdf";
import { parsePages } from "./page-ranges";
import {
  coversTextQuad,
  isTextMarkup,
  mergeTextQuads,
  validTextQuad,
} from "./text-markup";
import { burnSignatures, normalizeImageAppearances } from "./pdf-signatures";
import {
  inspectTaskFile,
  executeTask,
  archiveOutputs,
} from "./tool-operations";
import type { TaskFile, TaskRequest, TaskOutput } from "./home-tools";
import {
  copyPages,
  copyAttachments,
  writeBookmarks,
  mappedBookmarks,
} from "./pdf-copy";
import type {
  PDFAnnotation,
  PDFDocument,
  PDFObject,
  PDFPage,
  Quad,
  Rect as MRect,
} from "mupdf";
import type {
  AnnotationInfo,
  DocumentInfo,
  Mark,
  Operation,
  PageDetails,
  Point,
  Rect,
  RenderResult,
  SearchHit,
  TextLine,
} from "./types";

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
const bytes = (b: ReturnType<PDFDocument["saveToBuffer"]>) => {
  try {
    return new Uint8Array(b.asUint8Array());
  } finally {
    b.destroy();
  }
};
function usePage<T>(doc: PDFDocument, index: number, fn: (p: PDFPage) => T): T {
  const p = doc.loadPage(index);
  try {
    return fn(p);
  } finally {
    p.destroy();
  }
}
export class PDFEngine {
  doc: PDFDocument | null = null;
  name = "Untitled.pdf";
  private geometry: DocumentInfo["pages"] | null = null;
  private originalData: Uint8Array = new Uint8Array();
  private originalSigned = false;
  private edited = false;
  private password = "";
  open(data: Uint8Array, name: string, password = "") {
    const next = new mupdf.PDFDocument(data);
    if (next.needsPassword() && !next.authenticatePassword(password)) {
      next.destroy();
      throw new Error("PASSWORD_REQUIRED");
    }
    next.disableJS();
    this.doc?.destroy();
    this.doc = next;
    this.name = name;
    this.password = password;
    this.originalData = data;
    this.originalSigned = this.signatureCount() > 0;
    this.edited = false;
    this.geometry = null;
    next.enableJournal();
    return this.info();
  }
  require() {
    if (!this.doc) throw new Error("Open a document first.");
    return this.doc;
  }
  info(): DocumentInfo {
    const d = this.require();
    if (!this.geometry)
      this.geometry = Array.from({ length: d.countPages() }, (_, i) =>
        usePage(d, i, (p) => {
          const b = p.getBounds();
          return {
            width: b[2] - b[0],
            height: b[3] - b[1],
            label: p.getLabel(),
          };
        }),
      );
    const attachments = Object.entries(d.getEmbeddedFiles()).map(
      ([name, o]) => {
        const p = d.getFilespecParams(o);
        const size = o.get("EF", "F", "Params", "Size").asNumber() || 0;
        o.destroy();
        return {
          name,
          size,
          mime: p.mimetype,
        };
      },
    );
    const permissions = {
      edit: d.hasPermission("edit"),
      copy: d.hasPermission("copy"),
      print: d.hasPermission("print"),
      annotate: d.hasPermission("annotate"),
      form: d.hasPermission("form"),
    };
    return {
      name: this.name,
      pages: this.geometry,
      title: d.getMetaData("info:Title") || "",
      author: d.getMetaData("info:Author") || "",
      subject: d.getMetaData("info:Subject") || "",
      keywords: d.getMetaData("info:Keywords") || "",
      version: d.getVersion(),
      encrypted:
        !!d.getMetaData("encryption") &&
        !/none/i.test(d.getMetaData("encryption") || ""),
      repaired: d.wasRepaired(),
      signedFields: this.signatureCount(),
      canUndo: d.canUndo(),
      canRedo: d.canRedo(),
      layers: Array.from({ length: d.countLayers() }, (_, i) => ({
        name: d.getLayerName(i),
        visible: d.isLayerVisible(i),
      })),
      attachments,
      outline: d.loadOutline() || [],
      permissions,
    };
  }
  private signatureCount() {
    let count = 0,
      nodes = 0;
    const visited = new Set<number>();
    const walk = (fields: PDFObject, depth = 0) => {
      if (depth > 64 || nodes > 10000) return;
      fields.forEach((field) => {
        if (++nodes > 10000) return;
        const id = field.asIndirect();
        if (id && visited.has(id)) return;
        if (id) visited.add(id);
        if (field.get("FT").asName() === "Sig" && !field.get("V").isNull())
          count++;
        walk(field.get("Kids"), depth + 1);
      });
    };
    walk(this.require().getTrailer().get("Root", "AcroForm", "Fields"));
    return count;
  }
  original() {
    return new Uint8Array(this.originalData);
  }
  rename(name: string) {
    this.name = name;
    return this.info();
  }
  render(
    index: number,
    scale: number,
    clip?: Rect,
    omitAnnotation?: number,
  ): RenderResult {
    const started = performance.now();
    return usePage(this.require(), index, (p) => {
      const bounds = p.getBounds();
      const r = clip || [0, 0, bounds[2] - bounds[0], bounds[3] - bounds[1]];
      const width = Math.max(1, Math.ceil((r[2] - r[0]) * scale)),
        height = Math.max(1, Math.ceil((r[3] - r[1]) * scale));
      if (width * height > 16_777_216)
        throw new Error("Render exceeds the 64 MB tile budget.");
      const pix = new mupdf.Pixmap(
        mupdf.ColorSpace.DeviceRGB,
        [0, 0, width, height],
        true,
      );
      pix.clear(255);
      const device = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
      try {
        const transform: import("mupdf").Matrix = [
          scale,
          0,
          0,
          scale,
          -(bounds[0] + r[0]) * scale,
          -(bounds[1] + r[1]) * scale,
        ];
        if (omitAnnotation === undefined) p.run(device, transform);
        else {
          p.runPageContents(device, transform);
          for (const annotation of p.getAnnotations())
            if (annotation.getObject().asIndirect() !== omitAnnotation)
              annotation.run(device, transform);
          p.runPageWidgets(device, transform);
        }
        device.close();
        return {
          pixels: new Uint8ClampedArray(pix.getPixels()),
          width,
          height,
          ms: performance.now() - started,
        };
      } finally {
        device.destroy();
        pix.destroy();
      }
    });
  }
  details(index: number): PageDetails {
    return usePage(this.require(), index, (p) => {
      const b = p.getBounds();
      const offset = (r: MRect): Rect => [
        r[0] - b[0],
        r[1] - b[1],
        r[2] - b[0],
        r[3] - b[1],
      ];
      const annotations: AnnotationInfo[] = p.getAnnotations().map((a) => ({
        id: a.getObject().asIndirect(),
        type: a.getType(),
        rect: offset(a.getBounds()),
        text: a.getContents(),
        signatureGroup:
          a.getObject().get("PDFWeldSignatureGroup").asString() || undefined,
        author: a.getAuthor(),
        fontSize:
          a.getType() === "FreeText"
            ? a.getDefaultAppearance().size
            : undefined,
        opacity: a.getOpacity(),
        width: a.hasBorder() ? a.getBorderWidth() : undefined,
        color:
          a.getType() === "FreeText"
            ? a.getDefaultAppearance().color
            : a.getColor(),
        created: a.getCreationDate().toISOString(),
        replyTo: a.getObject().get("IRT").asIndirect() || undefined,
        locked: Boolean(
          a.getFlags() &
          (mupdf.PDFAnnotation.IS_LOCKED | mupdf.PDFAnnotation.IS_READ_ONLY),
        ),
      }));
      const fields = p.getWidgets().map((w, id) => ({
        id,
        name: w.getName(),
        label: w.getLabel() || w.getName(),
        type: w.getFieldType(),
        value: w.getValue(),
        rect: offset(w.getBounds()),
        options: w.isChoice() ? w.getOptions() : [],
        readOnly: w.isReadOnly(),
      }));
      const text = p.toStructuredText("preserve-whitespace");
      const lines: TextLine[] = [];
      let line: TextLine | null = null;
      try {
        text.walk({
          beginLine: (bbox) => {
            line = { text: "", rect: offset(bbox), size: 12, chars: [] };
          },
          onChar: (c, origin, _f, size, q) => {
            if (line) {
              line.text += c;
              line.size = size;
              line.chars.push({
                text: c,
                size,
                origin: [origin[0] - b[0], origin[1] - b[1]],
                quad: q.map((v, i) => v - (i % 2 ? b[1] : b[0])),
              });
            }
          },
          endLine: () => {
            if (line?.text.trim()) lines.push(line);
            line = null;
          },
        });
      } finally {
        text.destroy();
      }
      const links = p.getLinks().map((l) => {
        const item = { rect: offset(l.getBounds()), uri: l.getURI() };
        l.destroy();
        return item;
      });
      return { annotations, fields, lines, links };
    });
  }
  renderAnnotation(index: number, id: number, scale: number): RenderResult {
    const started = performance.now();
    return usePage(this.require(), index, (p) => {
      const a = p
        .getAnnotations()
        .find((a) => a.getObject().asIndirect() === id);
      if (!a) throw new Error("Annotation no longer exists.");
      const rect = a.getBounds();
      scale = Math.max(
        0.0001,
        Math.min(
          scale,
          Math.sqrt(
            2_500_000 / Math.max(1, (rect[2] - rect[0]) * (rect[3] - rect[1])),
          ),
        ),
      );
      const width = Math.max(1, Math.ceil((rect[2] - rect[0]) * scale));
      const height = Math.max(1, Math.ceil((rect[3] - rect[1]) * scale));
      const pix = new mupdf.Pixmap(
        mupdf.ColorSpace.DeviceRGB,
        [0, 0, width, height],
        true,
      );
      pix.clear();
      const device = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
      try {
        a.run(device, [scale, 0, 0, scale, -rect[0] * scale, -rect[1] * scale]);
        device.close();
        const pixels = new Uint8ClampedArray(pix.getPixels());
        // MuPDF's transparent pixmaps are premultiplied; ImageData isn't.
        for (let i = 0; i < pixels.length; i += 4) {
          const alpha = pixels[i + 3];
          if (alpha > 0 && alpha < 255)
            for (let c = 0; c < 3; c++)
              pixels[i + c] = (pixels[i + c] * 255) / alpha;
        }
        return { pixels, width, height, ms: performance.now() - started };
      } finally {
        device.destroy();
        pix.destroy();
      }
    });
  }
  search(query: string, page: number): SearchHit[] {
    if (!query || !this.require().hasPermission("copy")) return [];
    return usePage(this.require(), page, (p) => {
      const b = p.getBounds();
      return p.search(query, {}).map((quads) => ({
        page,
        quads: quads.map((q) => q.map((v, i) => v - (i % 2 ? b[1] : b[0]))),
        text: query,
      }));
    });
  }
  mutate(label: string, fn: () => void, geometry = false) {
    const d = this.require();
    d.beginOperation(label);
    try {
      fn();
      d.endOperation();
      this.edited = true;
    } catch (e) {
      d.abandonOperation();
      throw e;
    }
    if (geometry) this.geometry = null;
    return this.info();
  }
  addMark(m: Mark) {
    const d = this.require();
    if (
      !d.hasPermission(
        m.tool === "field"
          ? "form"
          : m.tool === "replace" || m.tool === "crop"
            ? "edit"
            : "annotate",
      )
    )
      throw new Error("This document restricts this operation.");
    let markupQuads: Quad[] = [];
    if (isTextMarkup(m.tool)) {
      markupQuads = usePage(d, m.page, (page) => {
        const bounds = page.getBounds();
        const type =
          m.tool === "highlight"
            ? "Highlight"
            : m.tool === "underline"
              ? "Underline"
              : "StrikeOut";
        const covered = page
          .getAnnotations()
          .filter((a) => a.getType() === type)
          .flatMap((a) => a.getQuadPoints());
        const selected = (m.quads || [])
          .filter(validTextQuad)
          .map(
            (q) => q.map((v, i) => v + (i % 2 ? bounds[1] : bounds[0])) as Quad,
          );
        const fresh: Quad[] = [],
          seen = new Set<string>();
        for (const quad of selected)
          if (
            !seen.has(quad.join(",")) &&
            !covered.some((existing) => coversTextQuad(existing, quad))
          ) {
            fresh.push(quad);
            seen.add(quad.join(","));
          }
        return mergeTextQuads(fresh);
      });
      if (!markupQuads.length) return { ...this.info(), unchanged: true };
    }
    return this.mutate(`Add ${m.tool}`, () =>
      usePage(d, m.page, (p) => {
        const b = p.getBounds();
        const rect = m.rect.map((v, i) => v + (i % 2 ? b[1] : b[0])) as Rect;
        const pt = (v: Point): Point => [v[0] + b[0], v[1] + b[1]];
        if (m.tool === "crop") {
          p.setPageBox("CropBox", rect);
          this.geometry = null;
          return;
        }
        if (m.tool === "link") {
          const uri = m.text || "";
          if (!/^https?:\/\//i.test(uri))
            throw new Error("Links must start with https:// or http://.");
          const l = p.createLink(rect, uri);
          l.destroy();
          return;
        }
        if (m.tool === "field") {
          this.createField(p, rect, m.text || "Text field");
          return;
        }
        if (m.tool === "replace") {
          const a = p.createAnnotation("Redact");
          a.setRect(
            m.replaceRect
              ? (m.replaceRect.map((v, i) => v + (i % 2 ? b[1] : b[0])) as Rect)
              : rect,
          );
          a.update();
          p.applyRedactions(false, 0, 0, 0);
          p.update();
        }
        const type = (
          {
            ink: "Ink",
            signature: "Ink",
            highlight: "Highlight",
            underline: "Underline",
            strike: "StrikeOut",
            text: "FreeText",
            replace: "FreeText",
            note: "Text",
            rectangle: "Square",
            ellipse: "Circle",
            line: "Line",
            arrow: "Line",
            redact: "Redact",
            stamp: "Stamp",
            image: "Stamp",
          } as const
        )[
          m.tool as Exclude<
            Mark["tool"],
            "select" | "hand" | "eraser" | "link" | "crop" | "field"
          >
        ];
        if (!type) throw new Error("Unsupported annotation.");
        const existing =
          m.tool === "signature" && m.signatureGroup
            ? p
                .getAnnotations()
                .find(
                  (a) =>
                    a.getType() === "Ink" &&
                    a.getObject().get("PDFWeldSignatureGroup").asString() ===
                      m.signatureGroup,
                )
            : undefined;
        const a = existing || p.createAnnotation(type);
        a.setAuthor(m.author);
        if (!existing) a.setCreationDate(new Date());
        a.setModificationDate(new Date());
        a.setContents(m.tool === "signature" ? "Signature" : m.text || "");
        if (
          m.tool === "signature" ||
          (m.tool === "image" && m.text === "Signature")
        )
          a.getObject().put("PDFWeldSignature", true);
        if (m.tool === "signature" && m.signatureGroup)
          a.getObject().put(
            "PDFWeldSignatureGroup",
            d.newString(m.signatureGroup),
          );
        // FreeText's /C is its background, while /DA controls the glyphs.
        // Giving both the same color makes the text disappear in a solid box.
        if (type !== "FreeText") a.setColor(rgb(m.color));
        // FreeText uses width as its font size, never as a border width.
        // Changing that border after setRect insets the rectangle in MuPDF.
        if (type !== "FreeText" && a.hasBorder()) a.setBorderWidth(m.width);
        a.setOpacity(m.opacity);
        a.setFlags(mupdf.PDFAnnotation.IS_PRINT);
        if (type === "Ink")
          a.setInkList([
            ...(existing ? existing.getInkList() : []),
            (m.points || []).map(pt),
          ]);
        else if (type === "Line") {
          a.setLine(
            pt(m.points?.[0] || [m.rect[0], m.rect[1]]),
            pt(m.points?.[m.points.length - 1] || [m.rect[2], m.rect[3]]),
          );
          if (m.tool === "arrow") a.setLineEndingStyles("None", "ClosedArrow");
        } else if (["Highlight", "Underline", "StrikeOut"].includes(type)) {
          a.setQuadPoints(markupQuads);
        } else a.setRect(rect);
        if (type === "FreeText") {
          a.setDefaultAppearance(
            "Helv",
            Number.isFinite(m.width) && m.width >= 6 ? m.width : 14,
            rgb(m.color),
          );
          a.setBorderWidth(0);
          a.setRect(rect);
        }
        if (type === "Text") a.setIcon("Comment");
        if (type === "Redact") a.getObject().put("IC", [0, 0, 0]);
        if (type === "Stamp") {
          if (m.image) {
            const image = new mupdf.Image(m.image);
            try {
              // Square, unit-sized stamp appearances are squeezed by PDFKit.
              // Use the actual PDF rectangle and counter the page rotation so
              // the image matches the editor in every PDF renderer.
              a.getObject().put("PDFWeldImage", true);
              this.imageAppearance(p, a, d.addImage(image));
            } finally {
              image.destroy();
            }
          } else a.setName(m.text || "Approved");
        }
        a.update();
        p.update();
      }),
    );
  }
  private imageAppearance(
    page: PDFPage,
    annotation: PDFAnnotation,
    image?: PDFObject,
  ) {
    if (!annotation.getObject().get("PDFWeldImage").asBoolean()) return;
    const resources = annotation
      .getObject()
      .get("AP", "N", "Resources", "XObject");
    image ||= resources.get("Image");
    if (image.isNull()) image = resources.get("I");
    if (image.isNull()) return;
    const raw = annotation.getObject().get("Rect").asJS() as Rect;
    const rect = annotation.getRect(),
      inverse = mupdf.Matrix.invert(page.getTransform());
    const w = rect[2] - rect[0],
      h = rect[3] - rect[1];
    const matrix = [
      inverse[0] * w,
      inverse[1] * w,
      -inverse[2] * h,
      -inverse[3] * h,
      rect[0] * inverse[0] + rect[3] * inverse[2] + inverse[4] - raw[0],
      rect[0] * inverse[1] + rect[3] * inverse[3] + inverse[5] - raw[1],
    ];
    annotation.setAppearance(
      null,
      null,
      mupdf.Matrix.identity,
      [0, 0, raw[2] - raw[0], raw[3] - raw[1]],
      { XObject: { Image: image } },
      `q ${matrix.join(" ")} cm /Image Do Q\n`,
    );
  }
  private createField(p: PDFPage, rect: Rect, name: string) {
    const d = this.require(),
      root = d.getTrailer().get("Root");
    let form = root.get("AcroForm");
    if (form.isNull()) {
      root.put("AcroForm", {
        Fields: [],
        DA: d.newString("/Helv 12 Tf 0 g"),
        DR: { Font: { Helv: d.addSimpleFont(new mupdf.Font("Helvetica")) } },
      });
      form = root.get("AcroForm");
    }
    const a = p.createAnnotation("Widget"),
      o = a.getObject();
    o.put("FT", d.newName("Tx"));
    o.put("T", d.newString(`${name}-${o.asIndirect()}`));
    o.put("V", d.newString(""));
    o.put("DA", d.newString("/Helv 12 Tf 0 g"));
    a.setRect(rect);
    a.setFlags(4);
    a.setBorderWidth(1);
    a.setColor([0.5, 0.6, 0.7]);
    form.get("Fields").push(o);
    a.update();
    p.update();
  }
  action(op: Operation): DocumentInfo {
    const d = this.require();
    if (op.type === "undo" || op.type === "redo") {
      if (op.type === "undo") d.undo();
      else d.redo();
      this.edited = d.getJournal().position > 0;
      this.geometry = null;
      return this.info();
    }
    if (
      !d.hasPermission(
        op.type === "fill"
          ? "form"
          : op.type.startsWith("annotation")
            ? "annotate"
            : "edit",
      )
    )
      throw new Error("The document permissions restrict this operation.");
    return this.mutate(op.type, () => {
      const indices = (op.pages as number[] | undefined) || [];
      switch (op.type) {
        case "rotate":
          for (const i of indices)
            usePage(d, i, (p) => {
              const o = p.getObject();
              o.put(
                "Rotate",
                ((o.getInheritable("Rotate").asNumber() || 0) +
                  Number(op.angle)) %
                  360,
              );
            });
          this.geometry = null;
          break;
        case "delete-pages": {
          if (indices.length >= d.countPages())
            throw new Error("Keep at least one page.");
          for (const i of [...indices].sort((a, b) => b - a)) d.deletePage(i);
          this.geometry = null;
          break;
        }
        case "reorder":
          d.rearrangePages(op.order as number[]);
          this.geometry = null;
          break;
        case "duplicate": {
          const clone = new mupdf.PDFDocument(this.saveEditable());
          try {
            for (const i of [...indices].sort((a, b) => b - a))
              copyPages(d, clone, [i], i + 1);
          } finally {
            clone.destroy();
          }
          this.geometry = null;
          break;
        }
        case "blank": {
          const page = d.addPage(
            [0, 0, Number(op.width) || 595, Number(op.height) || 842],
            0,
            {},
            "",
          );
          d.insertPage(Number(op.at), page);
          page.destroy();
          this.geometry = null;
          break;
        }
        case "metadata":
          for (const key of ["Title", "Author", "Subject", "Keywords"])
            d.setMetaData(
              `info:${key}`,
              String((op.values as Record<string, string>)[key] || ""),
            );
          break;
        case "labels":
          d.setPageLabels(
            Number(op.page),
            "D",
            String(op.prefix || ""),
            Number(op.start) || 1,
          );
          this.geometry = null;
          break;
        case "layer":
          d.setLayerVisible(Number(op.index), Boolean(op.visible));
          break;
        case "annotation-delete":
          usePage(d, Number(op.page), (p) => {
            const a = p
              .getAnnotations()
              .find((a) => a.getObject().asIndirect() === op.id);
            if (a) {
              if (
                a.getFlags() &
                (mupdf.PDFAnnotation.IS_LOCKED |
                  mupdf.PDFAnnotation.IS_READ_ONLY)
              )
                throw new Error("This annotation is locked.");
              p.deleteAnnotation(a);
            }
            p.update();
          });
          break;
        case "annotation-transform":
          usePage(d, Number(op.page), (p) => {
            const a = p
              .getAnnotations()
              .find((a) => a.getObject().asIndirect() === op.id);
            if (!a) throw new Error("Annotation no longer exists.");
            if (
              a.getFlags() &
              (mupdf.PDFAnnotation.IS_LOCKED | mupdf.PDFAnnotation.IS_READ_ONLY)
            )
              throw new Error("This annotation is locked.");
            const r = op.rect as Rect;
            const b = p.getBounds(),
              old = a.getBounds();
            if (
              !Array.isArray(r) ||
              r.length !== 4 ||
              !r.every(Number.isFinite) ||
              r[2] <= r[0] ||
              r[3] <= r[1]
            )
              throw new Error("Choose a valid annotation rectangle.");
            const rect: Rect = [
              r[0] + b[0],
              r[1] + b[1],
              r[2] + b[0],
              r[3] + b[1],
            ];
            const sx = (rect[2] - rect[0]) / Math.max(0.001, old[2] - old[0]);
            const sy = (rect[3] - rect[1]) / Math.max(0.001, old[3] - old[1]);
            const point = ([x, y]: Point): Point => [
              rect[0] + (x - old[0]) * sx,
              rect[1] + (y - old[1]) * sy,
            ];
            if (a.hasInkList())
              a.setInkList(a.getInkList().map((path) => path.map(point)));
            else if (a.hasQuadPoints())
              a.setQuadPoints(
                a
                  .getQuadPoints()
                  .map(
                    (q) =>
                      q.map((v, i) =>
                        i % 2
                          ? rect[1] + (v - old[1]) * sy
                          : rect[0] + (v - old[0]) * sx,
                      ) as Quad,
                  ),
              );
            else if (a.hasLine()) {
              const ends = a.getLine();
              a.setLine(point(ends[0]), point(ends[1]));
            } else if (a.hasVertices())
              a.setVertices(a.getVertices().map(point));
            else a.setRect(rect);
            a.setModificationDate(new Date());
            a.update();
            p.update();
            // MuPDF regenerates image-stamp appearances when geometry changes.
            // Restore a proportioned appearance after that regeneration.
            this.imageAppearance(p, a);
          });
          break;
        case "annotation-style":
          usePage(d, Number(op.page), (p) => {
            const a = p
              .getAnnotations()
              .find((a) => a.getObject().asIndirect() === op.id);
            if (!a) throw new Error("Annotation no longer exists.");
            if (typeof op.text === "string") a.setContents(op.text);
            const freeText = a.getType() === "FreeText";
            const b = p.getBounds();
            const targetRect = Array.isArray(op.rect)
              ? ((op.rect as Rect).map(
                  (v, i) => v + (i % 2 ? b[1] : b[0]),
                ) as Rect)
              : freeText
                ? a.getBounds()
                : undefined;
            if (typeof op.color === "string" && !freeText)
              a.setColor(rgb(op.color));
            if (typeof op.opacity === "number")
              a.setOpacity(Math.max(0.05, Math.min(1, op.opacity)));
            if (typeof op.width === "number" && a.hasBorder())
              a.setBorderWidth(Math.max(0.1, op.width));
            if (freeText) {
              const old = a.getDefaultAppearance();
              a.setDefaultAppearance(
                old.font,
                typeof op.fontSize === "number"
                  ? Math.max(4, op.fontSize)
                  : old.size,
                typeof op.color === "string" ? rgb(op.color) : old.color,
              );
              a.getObject().delete("C");
              a.setBorderWidth(0);
            }
            // Set geometry last: removing a legacy FreeText border must not
            // shrink or move the box when finishing an edit or restyling it.
            if (targetRect) a.setRect(targetRect);
            a.setModificationDate(new Date());
            a.update();
            p.update();
            this.imageAppearance(p, a);
          });
          break;
        case "annotation-edit":
          usePage(d, Number(op.page), (p) => {
            const a = p
              .getAnnotations()
              .find((a) => a.getObject().asIndirect() === op.id);
            if (a) {
              a.setContents(String(op.text));
              a.setModificationDate(new Date());
              a.update();
            }
            p.update();
          });
          break;
        case "annotation-reply":
          usePage(d, Number(op.page), (p) => {
            const parent = p
              .getAnnotations()
              .find((a) => a.getObject().asIndirect() === op.id);
            if (!parent) throw new Error("Comment no longer exists.");
            const a = p.createAnnotation("Text");
            a.setRect(parent.getBounds());
            a.setContents(String(op.text));
            a.setAuthor(String(op.author || "You"));
            a.getObject().put("IRT", parent.getObject());
            a.getObject().put("RT", d.newName("R"));
            a.setFlags(2);
            a.update();
            p.update();
          });
          break;
        case "fill":
          usePage(d, Number(op.page), (p) => {
            const w = p.getWidgets()[Number(op.field)];
            if (!w || w.isReadOnly())
              throw new Error("This field cannot be edited.");
            if (w.isCheckbox() || w.isRadioButton()) w.toggle();
            else if (w.isChoice()) w.setChoiceValue(String(op.value));
            else w.setTextValue(String(op.value));
            w.update();
            p.update();
          });
          break;
        case "reset-forms":
          d.resetForm(d.getTrailer().get("Root", "AcroForm", "Fields"), false);
          break;
        case "flatten":
          d.bake(true, Boolean(op.forms));
          break;
        case "redact":
          for (let i = 0; i < d.countPages(); i++)
            usePage(d, i, (p) => {
              p.applyRedactions(true, 2, 2, 0);
              p.update();
            });
          break;
        case "sanitize": {
          const root = d.getTrailer().get("Root");
          root.delete("OpenAction");
          root.delete("AA");
          root.get("Names").delete("JavaScript");
          root.delete("Metadata");
          for (const k of [
            "Title",
            "Author",
            "Subject",
            "Keywords",
            "Creator",
            "Producer",
          ])
            d.setMetaData(`info:${k}`, "");
          for (const name of Object.keys(d.getEmbeddedFiles()))
            d.deleteEmbeddedFile(name);
          break;
        }
        case "attachment-add": {
          const stream = d.addStream(op.data as Uint8Array, {
            Type: "EmbeddedFile",
            Subtype: d.newName(String(op.mime || "application/octet-stream")),
            Params: { Size: (op.data as Uint8Array).length },
          });
          const ref = d.addObject({
            Type: "Filespec",
            F: d.newString(String(op.name)),
            UF: d.newString(String(op.name)),
            EF: { F: stream },
          });
          d.insertEmbeddedFile(String(op.name), ref);
          ref.destroy();
          stream.destroy();
          break;
        }
        case "attachment-delete":
          d.deleteEmbeddedFile(String(op.name));
          break;
        case "bookmark": {
          const it = d.outlineIterator();
          try {
            while (it.next() === 0) {
              /* reach the end */
            }
            it.insert({
              title: String(op.title),
              uri: `#page=${Number(op.page) + 1}`,
              open: false,
            });
          } finally {
            it.destroy();
          }
          break;
        }
        case "watermark":
          for (const i of indices)
            usePage(d, i, (p) => {
              const b = p.getBounds();
              const a = p.createAnnotation("FreeText");
              a.setRect([
                b[0] + 20,
                (b[3] - b[1]) / 2 + b[1] - 35,
                b[2] - 20,
                (b[3] - b[1]) / 2 + b[1] + 35,
              ]);
              a.setContents(String(op.text));
              a.setDefaultAppearance("Helv", 36, [0.4, 0.4, 0.4]);
              a.setQuadding(1);
              a.setOpacity(0.2);
              a.setFlags(4);
              a.update();
              p.update();
            });
          break;
        case "page-numbers":
          for (let i = 0; i < d.countPages(); i++)
            usePage(d, i, (p) => {
              const b = p.getBounds(),
                a = p.createAnnotation("FreeText");
              a.setRect([b[0] + 20, b[3] - 35, b[2] - 20, b[3] - 12]);
              a.setContents(`${i + 1} / ${d.countPages()}`);
              a.setDefaultAppearance("Helv", 10, [0.3, 0.3, 0.3]);
              a.setQuadding(1);
              a.setFlags(4);
              a.update();
            });
          break;
        default:
          throw new Error("Unknown document operation.");
      }
    });
  }
  saveEditable(): Uint8Array {
    return this.save({}, false);
  }
  save(
    options: Record<string, string | number> = {},
    signatures = true,
  ): Uint8Array {
    if (
      this.originalSigned &&
      !this.edited &&
      Object.keys(options).length === 0
    )
      return this.original();
    // MuPDF's xref compaction renumbers objects in place and invalidates the
    // live journal. Snapshot without compaction, then optimize a disposable
    // document so export/autosave cannot corrupt Undo or Redo.
    const snapshot = bytes(
      this.require().saveToBuffer({ garbage: 0, compress: false }),
    );
    const output = new mupdf.PDFDocument(snapshot);
    try {
      if (output.needsPassword() && !output.authenticatePassword(this.password))
        throw new Error("The encrypted export snapshot could not be unlocked.");
      normalizeImageAppearances(output);
      if (signatures) burnSignatures(output);
      return bytes(
        output.saveToBuffer({ garbage: 4, compress: true, ...options }),
      );
    } finally {
      output.destroy();
    }
  }
  merge(
    data: Uint8Array,
    password = "",
    at?: number,
    pages?: number[] | string,
    title?: string,
  ) {
    const src = new mupdf.PDFDocument(data);
    try {
      if (src.needsPassword() && !src.authenticatePassword(password))
        throw new Error("PASSWORD_REQUIRED");
      if (!src.hasPermission("copy"))
        throw new Error("Copying is restricted. Enter the owner password.");
      return this.mutate("Insert pages", () => {
        const d = this.require();
        const offset = at ?? d.countPages();
        const previous = d.loadOutline() || [];
        const indices =
          typeof pages === "string"
            ? parsePages(pages, src.countPages())
            : pages || Array.from({ length: src.countPages() }, (_, i) => i);
        if (
          !indices.length ||
          indices.some(
            (i) => !Number.isInteger(i) || i < 0 || i >= src.countPages(),
          )
        )
          throw new Error("Choose a valid page range.");
        copyPages(d, src, indices, offset);
        copyAttachments(d, src);
        writeBookmarks(d, [
          ...previous,
          {
            title:
              title || src.getMetaData("info:Title") || "Inserted document",
            page: offset,
            down: mappedBookmarks(src.loadOutline() || [], indices, offset),
          },
        ]);
        this.geometry = null;
      });
    } finally {
      src.destroy();
    }
  }
  extract(indices: number[]) {
    const out = new mupdf.PDFDocument();
    try {
      copyPages(out, this.require(), indices, 0);
      copyAttachments(out, this.require());
      writeBookmarks(
        out,
        mappedBookmarks(this.require().loadOutline() || [], indices),
      );
      normalizeImageAppearances(out);
      burnSignatures(out);
      return bytes(out.saveToBuffer({ garbage: 4, compress: true }));
    } finally {
      out.destroy();
    }
  }
  text(index: number, format = "text") {
    if (!this.require().hasPermission("copy"))
      throw new Error("Copying text is restricted.");
    return usePage(this.require(), index, (p) => {
      const t = p.toStructuredText("");
      try {
        return format === "json"
          ? t.asJSON()
          : format === "html"
            ? t.asHTML(index)
            : t.asText();
      } finally {
        t.destroy();
      }
    });
  }
  thumbnail(width = 320) {
    const scale = usePage(this.require(), 0, (p) => {
      const b = p.getBounds(),
        w = b[2] - b[0],
        h = b[3] - b[1];
      return Math.min(
        Math.max(1, Math.min(640, width)) / w,
        Math.sqrt(180_000 / (w * h)),
      );
    });
    return this.image(0, "png", scale);
  }
  inspectTaskFile(file: TaskFile) {
    return inspectTaskFile(this, file);
  }
  runTask(request: TaskRequest) {
    return executeTask(this, request);
  }
  archiveOutputs(files: TaskOutput[]) {
    return archiveOutputs(files);
  }
  firstFormPage() {
    for (let i = 0; i < this.require().countPages(); i++)
      if (usePage(this.require(), i, (p) => p.getWidgets().length > 0))
        return i;
    return 0;
  }
  image(index: number, format = "png", scale = 2) {
    if (format === "svg") {
      const buffer = new mupdf.Buffer();
      const writer = new mupdf.DocumentWriter(buffer, "svg", {});
      try {
        usePage(this.require(), index, (p) => {
          const device = writer.beginPage(p.getBounds());
          try {
            p.run(device, mupdf.Matrix.identity);
            writer.endPage();
          } finally {
            device.destroy();
          }
        });
        writer.close();
        return new Uint8Array(buffer.asUint8Array());
      } finally {
        writer.destroy();
        buffer.destroy();
      }
    }
    return usePage(this.require(), index, (p) => {
      const b = p.getBounds();
      const safe = Math.min(
        scale,
        Math.sqrt(12_000_000 / ((b[2] - b[0]) * (b[3] - b[1]))),
      );
      const pix = p.toPixmap(
        mupdf.Matrix.scale(safe, safe),
        mupdf.ColorSpace.DeviceRGB,
        false,
        true,
      );
      try {
        return new Uint8Array(format === "jpg" ? pix.asJPEG(90) : pix.asPNG());
      } finally {
        pix.destroy();
      }
    });
  }
  attachment(name: string) {
    const refs = this.require().getEmbeddedFiles();
    try {
      const b = this.require().getEmbeddedFileContents(refs[name]);
      if (!b) throw new Error("Attachment has no data.");
      return bytes(b);
    } finally {
      Object.values(refs).forEach((o) => o.destroy());
    }
  }
  addOcr(
    page: number,
    words: {
      text: string;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }[],
    imageWidth: number,
  ) {
    return this.mutate("OCR text layer", () =>
      usePage(this.require(), page, (p) => {
        const d = this.require(),
          b = p.getBounds(),
          s = (b[2] - b[0]) / imageWidth;
        const font = d.addSimpleFont(new mupdf.Font("Helvetica"));
        const obj = p.getObject();
        let resources = obj.getInheritable("Resources");
        if (resources.isNull()) {
          obj.put("Resources", {});
          resources = obj.get("Resources");
        }
        if (resources.get("Font").isNull()) resources.put("Font", {});
        resources.get("Font").put("WeldOCR", font);
        const text = words
          .filter((w) => /^[\x20-\x7e]+$/.test(w.text))
          .map((w) => {
            const box = w.bbox;
            const size = Math.max(3, (box.y1 - box.y0) * s);
            const escaped = w.text.replace(/[\\()]/g, "\\$&");
            return `BT /WeldOCR ${size.toFixed(2)} Tf 3 Tr 1 0 0 1 ${(b[0] + box.x0 * s).toFixed(2)} ${(b[3] - box.y1 * s).toFixed(2)} Tm (${escaped}) Tj ET`;
          })
          .join("\n");
        const stream = d.addStream(text, {}),
          contents = obj.get("Contents");
        if (contents.isArray()) contents.push(stream);
        else
          obj.put(
            "Contents",
            contents.isNull() ? [stream] : [contents, stream],
          );
        font.destroy();
        stream.destroy();
        p.update();
      }),
    );
  }
  async sign(certificate: Uint8Array, password: string, reason = "") {
    if (this.info().encrypted)
      throw new Error(
        "Certificate signing of encrypted documents is not supported.",
      );
    const { PDF, P12Signer } = await import("@libpdf/core");
    const pdf = await PDF.load(this.save());
    if (
      pdf
        .getForm()
        ?.getSignatureFields()
        .some((f) => f.isSigned())
    )
      throw new Error(
        "This document already contains a certificate signature. This workflow cannot preserve existing signatures; the original file is unchanged.",
      );
    const signer = await P12Signer.create(certificate, password, {
      buildChain: false,
    });
    const signed = await pdf.sign({ signer, level: "B-B", reason });
    return new Uint8Array(signed.bytes);
  }
  check() {
    const d = this.require();
    const warnings: string[] = [];
    let images = 0,
      fonts = 0,
      unembedded = 0,
      fields = 0,
      annotations = 0;
    for (let i = 0; i < d.countPages(); i++)
      usePage(d, i, (p) => {
        fields += p.getWidgets().length;
        annotations += p.getAnnotations().length;
        const r = p.getObject().getInheritable("Resources");
        r.get("Font").forEach((font) => {
          fonts++;
          let fd = font.get("FontDescriptor");
          if (fd.isNull())
            fd = font.get("DescendantFonts", 0, "FontDescriptor");
          if (
            fd.get("FontFile").isNull() &&
            fd.get("FontFile2").isNull() &&
            fd.get("FontFile3").isNull()
          )
            unembedded++;
        });
        r.get("XObject").forEach((o) => {
          if (o.get("Subtype").asName() === "Image") images++;
        });
      });
    if (!d.getMetaData("info:Title"))
      warnings.push("Document title is missing.");
    if (d.getTrailer().get("Root", "StructTreeRoot").isNull())
      warnings.push("No accessibility structure tree.");
    if (unembedded)
      warnings.push(`${unembedded} font references are not embedded.`);
    if (d.wasRepaired())
      warnings.push("MuPDF repaired the original file structure.");
    return {
      pages: d.countPages(),
      fonts,
      unembedded,
      images,
      fields,
      annotations,
      warnings,
      note: "Structural diagnostics only. This is not a PDF/A, PDF/X, or PDF/UA conformance certification.",
    };
  }
}
