import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PDFEngine } from "../src/lib/engine";
const sample = new Uint8Array(readFileSync("public/field-notes.pdf"));
const fresh = () => {
  const e = new PDFEngine();
  e.open(sample, "Sample.pdf");
  return e;
};
it("preserves annotations and canonical form fields through extraction and merge", () => {
  const e = fresh();
  e.action({ type: "fill", page: 3, field: 0, value: "Saved field" });
  e.addMark({
    tool: "note",
    page: 3,
    rect: [80, 100, 104, 124],
    text: "A note to keep",
    color: "#29372f",
    width: 2,
    opacity: 1,
    author: "Tester",
  });
  const other = new PDFEngine();
  other.open(e.extract([3]), "Extracted.pdf");
  expect(other.details(0).annotations[0].text).toBe("A note to keep");
  expect(other.details(0).fields[0].value).toBe("Saved field");
  expect(
    other.require().getTrailer().get("Root", "AcroForm", "Fields").length,
  ).toBe(3);
  const merged = fresh();
  merged.merge(e.save());
  expect(merged.details(7).fields[0].value).toBe("Saved field");
  expect(merged.details(7).annotations[0].text).toBe("A note to keep");
});
it("supports cropping, page numbers, watermarks, and flattening", () => {
  const e = fresh();
  e.addMark({
    tool: "crop",
    page: 0,
    rect: [20, 20, 500, 800],
    color: "#29372f",
    width: 2,
    opacity: 1,
    author: "Tester",
  });
  expect(e.info().pages[0].width).toBe(480);
  e.action({ type: "page-numbers" });
  e.action({ type: "watermark", pages: [0], text: "DRAFT" });
  expect(e.details(0).annotations.length).toBe(2);
  e.action({ type: "flatten", forms: false });
  expect(e.details(0).annotations).toHaveLength(0);
  expect(e.text(0)).toContain("DRAFT");
});
it("preserves attachments while sanitizing document metadata and actions", () => {
  const e = fresh();
  e.action({
    type: "metadata",
    values: { Title: "Private title", Author: "A person" },
  });
  e.action({
    type: "attachment-add",
    name: "notes.txt",
    mime: "text/plain",
    data: new TextEncoder().encode("Notes"),
  });
  e.action({ type: "sanitize" });
  expect(e.info().title).toBe("");
  expect(e.info().attachments).toHaveLength(0);
});
it("does not retain stale passwords after an unsuccessful open", () => {
  const e = fresh();
  const encrypted = e.save({
    encrypt: "aes-256",
    "user-password": "secret",
    "owner-password": "owner",
  });
  expect(() => e.open(encrypted, "Protected.pdf", "wrong")).toThrow(
    "PASSWORD_REQUIRED",
  );
  expect(e.text(0)).toContain("Spaces for");
});
it("creates working internal and external page links", () => {
  const e = fresh();
  e.addMark({
    tool: "link",
    page: 0,
    rect: [20, 20, 80, 40],
    text: "https://example.com",
    color: "#29372f",
    width: 2,
    opacity: 1,
    author: "Tester",
  });
  const output = new PDFEngine();
  output.open(e.extract([0]), "Linked.pdf");
  expect(output.details(0).links[0].uri).toBe("https://example.com");
});
it("writes searchable OCR text as actual page content", () => {
  const e = fresh();
  e.addOcr(
    0,
    [{ text: "OCRPROOF", bbox: { x0: 40, y0: 200, x1: 160, y1: 224 } }],
    1190,
  );
  const output = new PDFEngine();
  output.open(e.save(), "OCR.pdf");
  expect(output.text(0)).toContain("OCRPROOF");
});
it("keeps encrypted documents encrypted during ordinary export", () => {
  const e = fresh();
  const encrypted = e.save({
    encrypt: "aes-256",
    "user-password": "reader",
    "owner-password": "owner",
  });
  const opened = new PDFEngine();
  opened.open(encrypted, "Protected.pdf", "reader");
  opened.action({ type: "fill", page: 3, field: 0, value: "Still protected" });
  const output = opened.save();
  const check = new PDFEngine();
  expect(() => check.open(output, "Output.pdf")).toThrow("PASSWORD_REQUIRED");
  check.open(output, "Output.pdf", "reader");
  expect(check.details(3).fields[0].value).toBe("Still protected");
});
it("preserves attachments and selected bookmarks when extracting or merging", () => {
  const e = fresh();
  e.action({
    type: "attachment-add",
    name: "notes.txt",
    mime: "text/plain",
    data: new TextEncoder().encode("Notes to keep"),
  });
  const output = new PDFEngine();
  output.open(e.extract([0, 3]), "Extracted.pdf");
  expect(output.info().outline.map((o) => o.title)).toEqual([
    "Spaces for tomorrow",
    "Your ideas",
  ]);
  expect(new TextDecoder().decode(output.attachment("notes.txt"))).toBe(
    "Notes to keep",
  );
  const combined = fresh();
  combined.merge(e.save());
  expect(combined.info().outline.at(-1)?.down).toHaveLength(4);
  expect(combined.info().attachments[0].name).toBe("notes.txt");
});
it("exports a vector SVG page", () => {
  const e = fresh();
  const svg = new TextDecoder().decode(e.image(0, "svg"));
  expect(svg).toContain("<svg");
  expect(svg).toContain("<path");
});
it("keeps a renamed filename consistent after later edits", () => {
  const e = fresh();
  e.rename("Renamed.pdf");
  e.action({ type: "rotate", pages: [0], angle: 90 });
  expect(e.info().name).toBe("Renamed.pdf");
});
it("keeps undo and redo usable after exporting a PDF", () => {
  const e = fresh();
  e.action({ type: "rotate", pages: [0], angle: 90 });
  e.save();
  e.action({ type: "undo" });
  expect(e.info().pages[0].width).toBe(595);
  e.action({ type: "redo" });
  expect(e.info().pages[0].width).toBe(842);
});
it("restores deleted pages and form values through undo after export", () => {
  const e = fresh();
  e.action({ type: "fill", page: 3, field: 0, value: "Before export" });
  e.action({ type: "delete-pages", pages: [0] });
  e.save();
  e.action({ type: "undo" });
  expect(e.info().pages).toHaveLength(4);
  e.action({ type: "undo" });
  expect(e.details(3).fields[0].value).toBe("");
});
it("removes intersecting vector content instead of only covering it", async () => {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const p = pdf.addPage([200, 200]);
  p.drawRectangle({
    x: 10,
    y: 10,
    width: 100,
    height: 100,
    color: rgb(1, 0, 0),
  });
  const e = new PDFEngine();
  e.open(await pdf.save(), "Vector.pdf");
  e.addMark({
    tool: "redact",
    page: 0,
    rect: [40, 120, 60, 140],
    color: "#000000",
    width: 1,
    opacity: 1,
    author: "Tester",
  });
  e.action({ type: "redact" });
  const restored = new PDFEngine();
  restored.open(e.save(), "Redacted vector.pdf");
  const image = restored.render(0, 1);
  const index = (100 * image.width + 20) * 4;
  expect([...image.pixels.slice(index, index + 3)]).toEqual([255, 255, 255]);
});
