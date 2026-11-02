import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { PDFEngine } from "../src/lib/engine";
import type { HomeToolId, TaskFile, TaskOptions } from "../src/lib/home-tools";
const sample = new Uint8Array(readFileSync("public/field-notes.pdf"));
const source = (id = "one", extra: Partial<TaskFile> = {}): TaskFile => ({
  id,
  name: `${id}.pdf`,
  bytes: new Uint8Array(sample),
  mime: "application/pdf",
  ...extra,
});
const execute = (
  tool: HomeToolId,
  files = [source()],
  options: TaskOptions = {},
) => new PDFEngine().runTask({ tool, files, options });
function inspect(bytes: Uint8Array) {
  const engine = new PDFEngine();
  engine.open(bytes, "Output.pdf");
  return engine;
}
function uncompressedPDF() {
  const content = `BT /F1 12 Tf 20 700 Td (${"Compress Me ".repeat(12000)}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.7\n",
    offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

test("standalone compression reduces real uncompressed PDF streams and preserves text", async () => {
  const input = source("large", { bytes: uncompressedPDF() }),
    original = new Uint8Array(input.bytes);
  const result = await execute("compress", [input]);
  expect(result.errors).toEqual([]);
  expect(result.outputs[0].bytes.length).toBeLessThan(input.bytes.length / 5);
  expect(inspect(result.outputs[0].bytes).text(0)).toContain("Compress Me");
  expect(input.bytes).toEqual(original);
});
test("compression never returns a larger file than the input", async () => {
  const result = await execute("compress");
  expect(result.outputs[0].bytes.length).toBeLessThanOrEqual(sample.length);
});
test("combine creates a new PDF in requested file/page order with fields and source bookmarks", async () => {
  const files = [
    source("forms", { pages: "4" }),
    source("cover", { pages: "1-2" }),
  ];
  const result = await execute("combine", files, { name: "Together" });
  expect(result.errors).toEqual([]);
  expect(result.outputs[0].name).toBe("Together.pdf");
  const output = inspect(result.outputs[0].bytes);
  expect(output.info().pages).toHaveLength(3);
  expect(output.details(0).fields).toHaveLength(3);
  expect(output.text(1)).toContain("Spaces for");
  expect(output.info().outline.map((b) => b.title)).toEqual([
    "forms.pdf",
    "cover.pdf",
  ]);
  expect(files[0].bytes).toEqual(sample);
});
test("combine also imports PNG images and images-to-PDF preserves one page per input", async () => {
  const photo = source("photo", {
    name: "signature.png",
    mime: "image/png",
    bytes: new Uint8Array(readFileSync("tests/fixtures/signature.png")),
  });
  const mixed = await execute("combine", [source(), photo]);
  expect(inspect(mixed.outputs[0].bytes).info().pages).toHaveLength(5);
  const images = await execute("images-pdf", [photo, { ...photo, id: "two" }], {
    pageSize: "US Letter",
  });
  const doc = inspect(images.outputs[0].bytes);
  expect(doc.info().pages).toHaveLength(2);
  expect(doc.info().pages[0].width).toBe(612);
});
test("split outputs and the worker ZIP contain real PDFs with retained interactive fields", async () => {
  const engine = new PDFEngine(),
    result = await engine.runTask({
      tool: "split",
      files: [source()],
      options: { every: "2" },
    });
  expect(result.outputs).toHaveLength(2);
  expect(inspect(result.outputs[1].bytes).details(1).fields).toHaveLength(3);
  const zip = unzipSync(await engine.archiveOutputs(result.outputs));
  expect(Object.keys(zip)).toEqual(["one-1-2.pdf", "one-3-4.pdf"]);
  expect(inspect(zip["one-3-4.pdf"]).info().pages).toHaveLength(2);
});
test("extract preserves requested page order and rotate only changes selected pages", async () => {
  const extracted = inspect(
    (await execute("extract", [source()], { pages: "4,1" })).outputs[0].bytes,
  );
  expect(extracted.details(0).fields).toHaveLength(3);
  expect(extracted.text(1)).toContain("Spaces for");
  const rotated = inspect(
    (await execute("rotate", [source()], { pages: "1", angle: "90" }))
      .outputs[0].bytes,
  );
  expect(rotated.info().pages[0].width).toBe(842);
  expect(rotated.info().pages[1].width).toBe(595);
});
test("standalone protection produces AES-256 output that needs the supplied password", async () => {
  const result = await execute("protect", [source()], {
    userPassword: "reader",
    ownerPassword: "owner",
  });
  const doc = new PDFEngine();
  expect(() => doc.open(result.outputs[0].bytes, "Protected.pdf")).toThrow(
    "PASSWORD_REQUIRED",
  );
  doc.open(result.outputs[0].bytes, "Protected.pdf", "reader");
  expect(doc.info().encrypted).toBe(true);
});
test("page exports are actual PNGs and text exports contain document content", async () => {
  const image = await execute("pdf-images", [source()], {
    pages: "1",
    format: "PNG",
    scale: "1",
  });
  expect(Array.from(image.outputs[0].bytes.slice(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  const text = await execute("pdf-text", [source()], {
    pages: "1",
    textFormat: "Plain text",
  });
  expect(new TextDecoder().decode(text.outputs[0].bytes)).toContain(
    "Spaces for",
  );
});
test("batch errors retain successful results and duplicate output names are disambiguated", async () => {
  const result = await execute("extract", [
    source("a"),
    source("b", { name: "a.pdf" }),
    source("broken", { bytes: new Uint8Array([1, 2, 3]) }),
  ]);
  expect(result.outputs.map((file) => file.name)).toEqual([
    "a-extracted.pdf",
    "a-extracted (2).pdf",
  ]);
  expect(result.errors).toHaveLength(1);
});
test("text comparison reports identical documents and real differences", async () => {
  const same = await execute("compare", [source("a"), source("b")]);
  expect(same.comparison!.every((page) => page.same)).toBe(true);
  const engine = inspect(sample),
    shorter = engine.extract([3]);
  const changed = await execute("compare", [
    source(),
    source("short", { bytes: shorter }),
  ]);
  expect(changed.comparison!.some((page) => !page.same)).toBe(true);
});
test("source copy restrictions are enforced and the owner password enables combining", async () => {
  const sourceDoc = inspect(sample);
  const locked = source("locked", {
    bytes: sourceDoc.save({
      encrypt: "aes-256",
      "user-password": "reader",
      "owner-password": "owner",
      permissions: 0,
    }),
    password: "reader",
  });
  await expect(execute("combine", [locked, source()])).rejects.toThrow(
    /Copying is restricted/,
  );
  const result = await execute("combine", [
    { ...locked, password: "owner" },
    source(),
  ]);
  expect(inspect(result.outputs[0].bytes).info().pages).toHaveLength(8);
});
