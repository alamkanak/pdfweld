# Third-party notices

PDFWeld is licensed under GNU AGPL version 3. The complete application source is included in deployed builds as `source.zip`.

- MuPDF / MuPDF.js 1.28.1, Artifex Software, Inc.: AGPL-3.0-or-later. Official C and JavaScript source: https://mupdf.com/ and https://github.com/ArtifexSoftware/mupdf.js . The npm package `mupdf@1.28.1` provides the WASM runtime. Retain its copyright and license notices. Commercial licensing is available directly from Artifex.
- React: MIT, https://github.com/facebook/react
- Tailwind CSS: MIT, https://github.com/tailwindlabs/tailwindcss
- Lucide icons: ISC, https://github.com/lucide-icons/lucide
- Dexie: Apache-2.0, https://github.com/dexie/Dexie.js
- Zustand: MIT, https://github.com/pmndrs/zustand
- @libpdf/core: MIT, https://github.com/LibPDF-js/core ; used for local certificate signing.
- pdf-lib: MIT, https://github.com/Hopding/pdf-lib
- fflate: MIT, https://github.com/101arrowz/fflate
- Tesseract.js and Tesseract OCR: Apache-2.0, https://github.com/naptha/tesseract.js and https://github.com/tesseract-ocr/tesseract
- English OCR model from https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz ; Tesseract tessdata is Apache-2.0.
- DM Sans and Manrope fonts: SIL Open Font License 1.1, distributed through Fontsource.
- Noto Sans Bengali: Copyright 2025 The Noto Project Authors (https://github.com/notofonts/bengali), SIL Open Font License 1.1. Bundled locally from the Google Fonts distribution; full license at `public/fonts/OFL-NotoSansBengali.txt`. MuPDF shapes and embeds Bengali glyphs in text annotations without contacting a font service.
- Vite, Vite PWA, Workbox, TypeScript, Playwright and Vitest: retain their respective dependency license files in the installed npm packages.

The Field Notes sample, architectural vector illustration, app icon, and benchmark fixture were created for this project. Procreate was studied as an interaction reference; its branding, icons, screenshots, and artwork are not included in the application. PDFCraft was researched as a feature reference; its code and branding are not incorporated into this implementation.

Use `npm ci` and `npm run prepare-assets` to reconstruct the runtime dependencies and OCR assets from the source bundle. No document data is sent to these upstream sources while using the built application.
