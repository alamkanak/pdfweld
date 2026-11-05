import { beforeAll, expect, test } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { PDFEngine } from "../src/lib/engine";
import { registerSelectedFont, registerTextFont } from "../src/lib/text-font";
import {
  findFont,
  matchesFont,
  googleFonts,
  fontPreviewText,
  fontLanguages,
} from "../src/lib/font-catalog";

beforeAll(() => {
  registerTextFont(
    new Uint8Array(readFileSync("public/fonts/NotoSansBengali.ttf")),
  );
});

test("preview specimens match the font's script when document text is English", () => {
  expect(fontPreviewText("notosansbengali", "English document")).toBe(
    "বাংলা ভাষায় লিখুন",
  );
  expect(fontPreviewText("notonaskharabic", "English document")).toBe(
    "مرحبا بالعالم",
  );
  expect(fontPreviewText("notosansjp", "English document")).toBe(
    "日本語で美しい文字を",
  );
  expect(fontPreviewText("roboto", "My document text")).toBe(
    "My document text",
  );
  expect(fontPreviewText("notosansbengali", "আমার লেখা")).toBe("আমার লেখা");
});

test("every language filter has a native specimen independent of the current font", () => {
  for (const language of fontLanguages) {
    const sample = fontPreviewText("helvetica", "", language.id);
    expect(sample.length).toBeGreaterThan(3);
    if (language.id !== "latin") expect(sample).toMatch(/[^\u0000-\u007f]/u);
  }
  expect(fontPreviewText("roboto", "English document", "devanagari")).toBe(
    "हिन्दी में लिखें",
  );
  expect(fontPreviewText("roboto", "Русский текст", "cyrillic")).toBe(
    "Русский текст",
  );
});

test("language filters and search return compatible families", () => {
  expect(
    googleFonts
      .filter((font) => matchesFont(font, "bangla", "bengali"))
      .map((font) => font.family),
  ).toEqual(["Noto Sans Bengali", "Noto Serif Bengali"]);
  expect(matchesFont(findFont("roboto")!, "", "bengali")).toBe(false);
  expect(matchesFont(findFont("notosansdevanagari")!, "nepali", "")).toBe(true);
  expect(matchesFont(findFont("notosansjp")!, "日本語", "japanese")).toBe(true);
});

test.each([
  ["roboto", 'A <b>tag</b> & "text"'],
  ["montserrat", "Regular weight text"],
  ["notosansbengali", "বাংলা ভাষায় লিখুন"],
  ["notonaskharabic", "مرحبا بالعالم"],
  ["notosansdevanagari", "हिन्दी में लिखें"],
  ["notosanssc", "中文字体测试"],
])(
  "%s embeds real glyphs and survives restyle, undo, movement and export",
  async (fontFamily, text) => {
    const font = findFont(fontFamily)!;
    registerSelectedFont(
      fontFamily,
      new Uint8Array(readFileSync(`public/fonts/google/${font.file}`)),
    );
    const pdf = await PDFDocument.create();
    pdf.addPage([600, 400]);
    const engine = new PDFEngine();
    engine.open(await pdf.save(), "Fonts.pdf");
    engine.addMark({
      tool: "text",
      page: 0,
      rect: [40, 40, 550, 170],
      text,
      fontFamily,
      width: 28,
      color: "#202123",
      opacity: 1,
      author: "Test",
    });
    const original = engine.details(0).annotations[0];
    expect(original.fontFamily).toBe(fontFamily);
    expect((await engine.prepareTextFont(fontFamily, text)).missing).toEqual(
      [],
    );
    engine.action({
      type: "annotation-style",
      page: 0,
      id: original.id,
      color: "#123456",
      fontSize: 30,
    });
    expect(engine.details(0).annotations[0].fontFamily).toBe(fontFamily);
    engine.action({ type: "undo" });
    expect(engine.details(0).annotations[0].fontSize).toBe(28);
    engine.action({
      type: "annotation-transform",
      page: 0,
      id: original.id,
      rect: [50, 60, 560, 190],
    });
    const saved = engine.save();
    mkdirSync(".cache/google-fonts", { recursive: true });
    writeFileSync(`.cache/google-fonts/${fontFamily}.pdf`, saved);
    const restored = new PDFEngine();
    restored.open(saved, "Exported.pdf");
    expect(restored.details(0).annotations[0]).toMatchObject({
      fontFamily,
      text,
      fontSize: 28,
      rect: [50, 60, 560, 190],
    });
    const render = restored.render(0, 1);
    let ink = 0;
    for (let i = 0; i < render.pixels.length; i += 4)
      if (render.pixels[i] < 180) ink++;
    expect(ink).toBeGreaterThan(300);
    const page = restored.require().loadPage(0);
    try {
      let chosenFontEmbedded = false;
      page
        .getAnnotations()[0]
        .getObject()
        .get("AP", "N", "Resources", "Font")
        .forEach((resource) => {
          if (
            resource
              .get("BaseFont")
              .asName()
              .includes(`PDFWeldFont${fontFamily}`)
          ) {
            expect(
              resource
                .get("DescendantFonts", 0, "FontDescriptor", "FontFile2")
                .isStream(),
            ).toBe(true);
            chosenFontEmbedded = true;
          }
        });
      expect(chosenFontEmbedded).toBe(true);
      if (fontFamily === "roboto") {
        const list = page.toDisplayList(true);
        const structured = list.toStructuredText("");
        try {
          expect(structured.asText()).toContain('<b>tag</b> & "text"');
        } finally {
          structured.destroy();
          list.destroy();
        }
      }
    } finally {
      page.destroy();
    }
    if (fontFamily === "roboto") {
      engine.action({
        type: "annotation-style",
        page: 0,
        id: original.id,
        fontFamily: "helvetica",
      });
      expect(engine.details(0).annotations[0].fontFamily).toBe("helvetica");
      engine.action({ type: "undo" });
      expect(engine.details(0).annotations[0].fontFamily).toBe("roboto");
    }
  },
);
