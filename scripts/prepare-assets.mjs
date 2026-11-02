import { copyFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
mkdirSync("public/ocr", { recursive: true });
copyFileSync(
  "node_modules/tesseract.js/dist/worker.min.js",
  "public/ocr/worker.min.js",
);
for (const name of [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
])
  copyFileSync(`node_modules/tesseract.js-core/${name}`, `public/ocr/${name}`);
if (!existsSync("public/ocr/eng.traineddata.gz")) {
  console.log(
    "Fetching the bundled English OCR model from the Tesseract.js data distribution…",
  );
  const response = await fetch(
    "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz",
  );
  if (!response.ok)
    throw new Error(`OCR model download failed: ${response.status}`);
  writeFileSync(
    "public/ocr/eng.traineddata.gz",
    new Uint8Array(await response.arrayBuffer()),
  );
}
