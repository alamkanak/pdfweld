import { beforeEach, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PDFEngine } from "../src/lib/engine";
import { parsePages } from "../src/lib/files";
import type { Mark, Tool } from "../src/lib/types";
import { PDFDocument } from "pdf-lib";
const data = new Uint8Array(readFileSync("public/field-notes.pdf"));
let engine: PDFEngine;
beforeEach(() => {
  engine = new PDFEngine();
  engine.open(data, "Field Notes.pdf");
});
const mark = (tool: Tool, extra: Partial<Mark> = {}): Mark => ({
  tool,
  page: 0,
  rect: [42, 100, 250, 140],
  points: [
    [42, 100],
    [100, 120],
    [250, 140],
  ],
  text: "Test annotation",
  color: "#29372f",
  width: 2,
  opacity: 1,
  author: "Tester",
  ...extra,
});
describe("PDF engine round trips", () => {
  it("renders added and restyled text as visible glyphs on a transparent background", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 200]);
    engine.open(await doc.save(), "Blank.pdf");
    engine.addMark(
      mark("text", {
        text: "Visible text",
        rect: [20, 20, 260, 80],
        color: "#b8ce5d",
        width: 18,
      }),
    );
    const checkAppearance = (subject: PDFEngine) => {
      const rendered = subject.render(0, 1);
      let coloredPixels = 0;
      for (let y = 20; y < 80; y++)
        for (let x = 20; x < 260; x++) {
          const i = (y * rendered.width + x) * 4;
          if (rendered.pixels[i + 2] < 240) coloredPixels++;
          // Empty space inside the text box must remain white, not a fill.
          if (y >= 60)
            expect(Array.from(rendered.pixels.slice(i, i + 3))).toEqual([
              255, 255, 255,
            ]);
        }
      expect(coloredPixels).toBeGreaterThan(100);
      expect(coloredPixels).toBeLessThan(3000);
    };
    checkAppearance(engine);
    const id = engine.details(0).annotations[0].id;
    engine.action({ type: "annotation-style", page: 0, id, color: "#123456" });
    expect(engine.details(0).annotations[0].color).toEqual(
      [0x12, 0x34, 0x56].map((v) => expect.closeTo(v / 255, 4)),
    );
    checkAppearance(engine);
    const restored = new PDFEngine();
    restored.open(engine.save(), "Text.pdf");
    checkAppearance(restored);
  });
  it("preserves signature image pixels and transparent background through PDF export", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 200]);
    engine.open(await doc.save(), "Blank.pdf");
    engine.addMark(
      mark("image", {
        image: new Uint8Array(readFileSync("tests/fixtures/signature.png")),
        text: "Signature",
        rect: [20, 100, 260, 160],
      }),
    );
    const restored = new PDFEngine();
    restored.open(engine.save(), "Signed.pdf");
    expect(restored.details(0).annotations[0].text).toBe("Signature");
    const rendered = restored.render(0, 1);
    const pixel = (x: number, y: number) =>
      Array.from(
        rendered.pixels.slice(
          (y * rendered.width + x) * 4,
          (y * rendered.width + x) * 4 + 3,
        ),
      );
    expect(pixel(25, 105)).toEqual([255, 255, 255]);
    expect(pixel(100, 148).every((v) => v < 100)).toBe(true);
  });
  it("reads real pages, bookmarks, text, and interactive fields", () => {
    const info = engine.info();
    expect(info.pages).toHaveLength(4);
    expect(info.outline).toHaveLength(4);
    expect(engine.text(0)).toContain("Spaces for");
    expect(engine.details(3).fields).toHaveLength(3);
    expect(engine.render(0, 0.4).pixels.length).toBeGreaterThan(100000);
  });
  it.each([
    "ink",
    "highlight",
    "underline",
    "strike",
    "text",
    "note",
    "rectangle",
    "ellipse",
    "line",
    "arrow",
    "redact",
    "stamp",
    "signature",
  ] as Tool[])("saves %s as a real PDF annotation", (tool) => {
    engine.addMark(mark(tool));
    const restored = new PDFEngine();
    restored.open(engine.save(), "Saved.pdf");
    expect(restored.details(0).annotations.length).toBe(1);
    expect(restored.info().pages).toHaveLength(4);
  });
  it("undoes and redoes document edits", () => {
    engine.action({ type: "rotate", pages: [0], angle: 90 });
    expect(engine.info().pages[0].width).toBe(842);
    engine.action({ type: "undo" });
    expect(engine.info().pages[0].width).toBe(595);
    engine.action({ type: "redo" });
    expect(engine.info().pages[0].width).toBe(842);
  });
  it("reorders, duplicates, inserts, and deletes pages", () => {
    engine.action({ type: "reorder", order: [3, 0, 1, 2] });
    expect(engine.text(0)).toContain("YOUR NEXT CHAPTER");
    engine.action({ type: "duplicate", pages: [1] });
    expect(engine.info().pages).toHaveLength(5);
    engine.action({ type: "blank", at: 0 });
    expect(engine.info().pages).toHaveLength(6);
    engine.action({ type: "delete-pages", pages: [0] });
    expect(engine.info().pages).toHaveLength(5);
  });
  it("fills canonical form fields and preserves appearance after export", () => {
    engine.action({ type: "fill", page: 3, field: 0, value: "Ada Lovelace" });
    const restored = new PDFEngine();
    restored.open(engine.save(), "Filled.pdf");
    expect(restored.details(3).fields[0].value).toBe("Ada Lovelace");
    expect(
      restored
        .require()
        .getTrailer()
        .get("Root", "AcroForm", "Fields", 0, "V")
        .asString(),
    ).toBe("Ada Lovelace");
  });
  it("creates a new interactive form field", () => {
    engine.addMark(
      mark("field", { text: "New field", rect: [40, 400, 250, 430] }),
    );
    const restored = new PDFEngine();
    restored.open(engine.save(), "New field.pdf");
    expect(restored.details(0).fields.length).toBe(1);
    restored.action({ type: "fill", page: 0, field: 0, value: "New answer" });
    expect(restored.details(0).fields[0].value).toBe("New answer");
  });
  it("permanently removes redacted text from exported content", () => {
    const line = engine
      .details(0)
      .lines.find((l) => l.text.includes("Spaces for"))!;
    engine.addMark(mark("redact", { rect: line.rect }));
    engine.action({ type: "redact" });
    const saved = engine.save();
    const restored = new PDFEngine();
    restored.open(saved, "Redacted.pdf");
    expect(restored.text(0)).not.toContain("Spaces for");
    expect(
      restored.require().findPage(0).get("Contents").readStream().asString(),
    ).not.toContain("Spaces for");
    expect(new TextDecoder().decode(saved).match(/startxref/g)).toHaveLength(1);
  });
  it("replaces existing text and removes original searchable content", () => {
    const line = engine
      .details(0)
      .lines.find((l) => l.text.includes("Spaces for"))!;
    engine.addMark(
      mark("replace", { rect: line.rect, text: "A better place", width: 40 }),
    );
    const restored = new PDFEngine();
    restored.open(engine.save(), "Edited.pdf");
    expect(restored.text(0)).not.toContain("Spaces for");
    expect(restored.details(0).annotations[0].text).toBe("A better place");
  });
  it("exports AES-256 encrypted PDFs that require the specified password", () => {
    const data = engine.save({
      encrypt: "aes-256",
      "user-password": "reader",
      "owner-password": "owner",
    });
    const restored = new PDFEngine();
    expect(() => restored.open(data, "Protected.pdf")).toThrow(
      "PASSWORD_REQUIRED",
    );
    restored.open(data, "Protected.pdf", "reader");
    expect(restored.info().pages).toHaveLength(4);
    expect(restored.info().encrypted).toBe(true);
  });
  it("merges and extracts real pages", () => {
    engine.merge(data);
    expect(engine.info().pages).toHaveLength(8);
    const restored = new PDFEngine();
    restored.open(engine.extract([0, 3]), "Extracted.pdf");
    expect(restored.info().pages).toHaveLength(2);
    expect(restored.text(0)).toContain("Spaces for");
    expect(restored.details(1).fields.length).toBe(3);
  });
  it("embeds and retrieves attachment bytes", () => {
    engine.action({
      type: "attachment-add",
      name: "note.txt",
      mime: "text/plain",
      data: new TextEncoder().encode("Supporting notes"),
    });
    expect(new TextDecoder().decode(engine.attachment("note.txt"))).toBe(
      "Supporting notes",
    );
    const restored = new PDFEngine();
    restored.open(engine.save(), "Attachment.pdf");
    expect(restored.info().attachments[0].name).toBe("note.txt");
  });
  it("adds a bookmark with a resolvable page destination", () => {
    engine.action({ type: "bookmark", page: 2, title: "A new bookmark" });
    const restored = new PDFEngine();
    restored.open(engine.save(), "Bookmarked.pdf");
    expect(
      restored.info().outline.some((o) => o.title === "A new bookmark"),
    ).toBe(true);
  });
});
