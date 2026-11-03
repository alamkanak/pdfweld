import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PDFEngine } from "../src/lib/engine";

test("download burns signatures while the working document and saved recovery retain editable originals", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(
    async (image) => {
      await window.pdfweld.openSample();
      await window.pdfweld.action({ type: "blank", at: 0 });
      const state = window.pdfweld.state();
      await state.mark({
        tool: "image",
        page: 0,
        rect: [40, 80, 280, 140],
        image: new Uint8Array(image),
        text: "Signature",
        color: "#29372f",
        width: 2,
        opacity: 1,
        author: "Test",
      });
      await state.mark({
        tool: "signature",
        page: 0,
        rect: [40, 180, 280, 240],
        points: [
          [50, 220],
          [100, 190],
          [160, 225],
          [260, 195],
        ],
        signatureGroup: "download-test",
        color: "#29372f",
        width: 2,
        opacity: 1,
        author: "Test",
      });
    },
    Array.from(readFileSync("tests/fixtures/signature.png")),
  );
  const download = page.waitForEvent("download");
  await page.keyboard.press("ControlOrMeta+s");
  const file = await download;
  const exported = new PDFEngine();
  exported.open(
    new Uint8Array(readFileSync((await file.path())!)),
    "Downloaded.pdf",
  );
  expect(exported.details(0).annotations).toHaveLength(0);
  const raster = exported.render(0, 1);
  let ink = 0;
  for (let y = 80; y < 240; y++)
    for (let x = 40; x < 280; x++)
      if (raster.pixels[(y * raster.width + x) * 4] < 180) ink++;
  expect(ink).toBeGreaterThan(200);
  await expect
    .poll(() => page.evaluate(() => window.pdfweld.state().busy))
    .toBe("");
  expect(
    await page.evaluate(
      async () => (await window.pdfweld.engine.call("details", 0)).annotations,
    ),
  ).toHaveLength(2);
  const recovery = await page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const request = indexedDB.open("pdfweld-library");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const record = database
            .transaction("files", "readonly")
            .objectStore("files")
            .get(window.pdfweld.state().id);
          record.onsuccess = () => {
            resolve(Array.from(record.result.bytes));
            database.close();
          };
          record.onerror = () => {
            reject(record.error);
            database.close();
          };
        };
      }),
  );
  const local = new PDFEngine();
  local.open(new Uint8Array(recovery), "Recovery.pdf");
  expect(local.details(0).annotations).toHaveLength(2);
});
