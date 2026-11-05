import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

// Only build-time downloads contact upstream. Browsers fetch these pinned
// original fonts from PDFWeld's own origin, after a font is selected.
const { revision, fonts } = JSON.parse(
  readFileSync(
    new URL("../src/lib/google-fonts.json", import.meta.url),
    "utf8",
  ),
);
const directory = new URL("../public/fonts/google/", import.meta.url);
mkdirSync(directory, { recursive: true });
const digest = (data) => createHash("sha256").update(data).digest("hex");
for (let i = 0; i < fonts.length; i += 4) {
  await Promise.all(
    fonts.slice(i, i + 4).map(async (font) => {
      const target = new URL(font.file, directory);
      const source = `https://raw.githubusercontent.com/google/fonts/${revision}/`;
      if (!existsSync(target) || digest(readFileSync(target)) !== font.sha256) {
        const response = await fetch(font.download);
        if (!response.ok)
          throw new Error(
            `Could not prepare ${font.family}: ${response.status}`,
          );
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length !== font.bytes || digest(bytes) !== font.sha256)
          throw new Error(`Font checksum mismatch: ${font.family}`);
        writeFileSync(target, bytes);
        console.log(`Prepared ${font.family}`);
      }
      const license = new URL(`${font.id}-OFL.txt`, directory);
      if (!existsSync(license)) {
        const response = await fetch(
          source +
            font.source.slice(0, font.source.lastIndexOf("/")) +
            "/OFL.txt",
        );
        if (!response.ok)
          throw new Error(`Could not prepare the license for ${font.family}`);
        writeFileSync(license, await response.text());
      }
    }),
  );
}
