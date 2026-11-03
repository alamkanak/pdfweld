import { beforeAll, test, expect } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { PDFEngine } from "../src/lib/engine";
import type { RenderResult } from "../src/lib/types";

const folder = resolve(".cache/export-viewers");
const pdfkit =
  process.platform === "darwin" &&
  spawnSync("swiftc", ["--version"]).status === 0;
const poppler = spawnSync("pdftoppm", ["-v"]).status === 0;
beforeAll(() => {
  mkdirSync(folder, { recursive: true });
  if (pdfkit)
    execFileSync("swiftc", [
      "tests/helpers/render-pdfkit.swift",
      "-o",
      `${folder}/render-pdfkit`,
    ]);
}, 60000);

function ink(
  { pixels, width, height }: Pick<RenderResult, "pixels" | "width" | "height">,
  channels = 4,
) {
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) < 180) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  return { left, top, right, bottom };
}
for (const rotation of [0, 90])
  for (const kind of ["image", "image-signature", "pen-signature"] as const) {
    test(`${kind} retains the editor's ink dimensions in independent viewers at ${rotation} degrees`, async () => {
      const pdf = await PDFDocument.create();
      pdf.addPage([600, 800]).setRotation(degrees(rotation));
      const engine = new PDFEngine();
      engine.open(await pdf.save(), "Visual.pdf");
      engine.addMark({
        tool: kind === "pen-signature" ? "signature" : "image",
        page: 0,
        rect: [40, 100, 280, 160],
        text: kind === "image" ? "Photo" : "Signature",
        points: [
          [50, 140],
          [80, 110],
          [120, 150],
          [170, 105],
          [230, 130],
        ],
        ...(kind !== "pen-signature"
          ? {
              image: new Uint8Array(
                readFileSync("tests/fixtures/signature.png"),
              ),
            }
          : {}),
        color: "#29372f",
        width: 2,
        opacity: 1,
        author: "Test",
      });
      const id = engine.details(0).annotations[0].id;
      engine.action({
        type: "annotation-transform",
        page: 0,
        id,
        rect: [60, 200, 420, 290],
      });
      const expected = ink(engine.render(0, 1));
      expect(expected.right - expected.left).toBeGreaterThan(200);
      const path = `${folder}/${kind}-${rotation}.pdf`;
      writeFileSync(path, engine.save());
      const check = (actual: typeof expected) => {
        for (const edge of ["left", "top", "right", "bottom"] as const)
          expect(
            Math.abs(actual[edge] - expected[edge]),
            `${kind}/${rotation}/${edge}`,
          ).toBeLessThanOrEqual(2);
      };
      if (pdfkit)
        check(
          JSON.parse(
            execFileSync(
              `${folder}/render-pdfkit`,
              [path, path.replace(".pdf", "-pdfkit.png")],
              { encoding: "utf8" },
            ),
          ),
        );
      if (poppler) {
        const ppm = execFileSync(
          "pdftoppm",
          ["-r", "72", "-singlefile", path],
          { maxBuffer: 8 * 1024 * 1024 },
        );
        const header = ppm
          .subarray(0, 100)
          .toString("ascii")
          .match(/^P6\s+(\d+)\s+(\d+)\s+255\s/)!;
        expect(header).toBeTruthy();
        check(
          ink(
            {
              width: Number(header[1]),
              height: Number(header[2]),
              pixels: new Uint8ClampedArray(ppm.subarray(header[0].length)),
            },
            3,
          ),
        );
      }
      const reopened = new PDFEngine();
      reopened.open(new Uint8Array(readFileSync(path)), "Export.pdf");
      expect(reopened.details(0).annotations).toHaveLength(
        kind === "image" ? 1 : 0,
      );
      check(ink(reopened.render(0, 1)));
    });
  }
