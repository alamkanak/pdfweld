import { it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { PDFEngine } from "../src/lib/engine";
it.skipIf(spawnSync("openssl", ["version"]).status !== 0)(
  "exports a certificate signature independently verified by OpenSSL CMS",
  async () => {
    const e = new PDFEngine();
    e.open(
      new Uint8Array(readFileSync("public/field-notes.pdf")),
      "Sample.pdf",
    );
    const signed = await e.sign(
      new Uint8Array(readFileSync("tests/fixtures/test-only.p12")),
      "pdfweld-test",
      "Synthetic test approval",
    );
    const text = new TextDecoder("latin1").decode(signed);
    const range = text.match(
      /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/,
    );
    expect(range).toBeTruthy();
    const [, a, b, c, d] = range!.map(Number);
    const dir = mkdtempSync(join(tmpdir(), "pdfweld-signature-"));
    const signedData = new Uint8Array(b + d);
    signedData.set(signed.slice(a, a + b));
    signedData.set(signed.slice(c, c + d), b);
    const hex = new TextDecoder()
      .decode(signed.slice(b, c))
      .replace(/[<>\s]/g, "");
    const cms = Uint8Array.from(hex.match(/../g)!.map((v) => parseInt(v, 16)));
    writeFileSync(join(dir, "content.bin"), signedData);
    writeFileSync(join(dir, "signature.der"), cms);
    execFileSync(
      "openssl",
      [
        "cms",
        "-verify",
        "-inform",
        "DER",
        "-in",
        join(dir, "signature.der"),
        "-content",
        join(dir, "content.bin"),
        "-noverify",
        "-binary",
        "-out",
        join(dir, "verified.bin"),
      ],
      { stdio: "pipe" },
    );
    expect(readFileSync(join(dir, "verified.bin")).length).toBe(
      signedData.length,
    );
    const restored = new PDFEngine();
    restored.open(signed, "Signed.pdf");
    expect(restored.info().pages).toHaveLength(4);
  },
);
it("detects signatures and preserves original signed bytes when unedited", async () => {
  const e = new PDFEngine();
  e.open(new Uint8Array(readFileSync("public/field-notes.pdf")), "Sample.pdf");
  const signed = await e.sign(
    new Uint8Array(readFileSync("tests/fixtures/test-only.p12")),
    "pdfweld-test",
  );
  const reader = new PDFEngine();
  reader.open(signed, "Signed.pdf");
  expect(reader.info().signedFields).toBe(1);
  reader.rename("Renamed signed file.pdf");
  expect(reader.save()).toEqual(signed);
});
