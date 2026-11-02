import type { PDFEngine } from "./engine";
import type {
  TaskFile,
  TaskOptions,
  TaskOutput,
  TaskRequest,
  TaskResult,
} from "./home-tools";
import { fileProblem } from "./home-tool-policy";
import { parsePages } from "./page-ranges";

const safeName = (name: string) =>
  name.replace(/[\\/\x00-\x1f]/g, "_") || "Document";
const stem = (name: string) => safeName(name).replace(/\.[^.]+$/, "");
const selection = (spec: string | undefined, total: number) =>
  spec?.trim()
    ? parsePages(spec, total)
    : Array.from({ length: total }, (_, i) => i);
const textBytes = (text: string) => new TextEncoder().encode(text);
const pdfMime = "application/pdf";
export function isImageInput(file: TaskFile) {
  return (
    (file.bytes[0] === 137 && file.bytes[1] === 80) ||
    (file.bytes[0] === 255 && file.bytes[1] === 216)
  );
}
export async function inputPdf(file: TaskFile, pageSize = "A4") {
  if (!isImageInput(file)) return file.bytes;
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const image =
    file.bytes[0] === 137
      ? await doc.embedPng(file.bytes)
      : await doc.embedJpg(file.bytes);
  const size: [number, number] =
    pageSize === "Fit image"
      ? [image.width, image.height]
      : pageSize === "US Letter"
        ? [612, 792]
        : [595, 842];
  const scale = Math.min(size[0] / image.width, size[1] / image.height);
  const page = doc.addPage(size);
  page.drawImage(image, {
    x: (size[0] - image.width * scale) / 2,
    y: (size[1] - image.height * scale) / 2,
    width: image.width * scale,
    height: image.height * scale,
  });
  return doc.save();
}
export async function inspectTaskFile(engine: PDFEngine, file: TaskFile) {
  const info = engine.open(
    await inputPdf(file),
    file.name,
    file.password || "",
  );
  if (!info.pages.length) throw new Error("This PDF contains no pages.");
  return info;
}
export async function executeTask(
  engine: PDFEngine,
  request: TaskRequest,
): Promise<TaskResult> {
  const { tool, files, options } = request;
  if (!files.length) throw new Error("Choose a file first.");
  if (tool === "combine" && files.length < 2)
    throw new Error("Choose at least two files to combine.");
  if (tool === "compare" && files.length !== 2)
    throw new Error("Choose exactly two PDFs to compare.");
  if (tool === "protect" && (!options.userPassword || !options.ownerPassword))
    throw new Error("Enter both an opening password and an owner password.");
  if (tool === "watermark" && !options.text?.trim())
    throw new Error("Enter watermark text.");
  if (tool === "certificate-sign" && !request.certificate?.length)
    throw new Error("Choose a P12 or PFX certificate.");
  const result: TaskResult = { outputs: [], errors: [] };
  const used = new Set<string>();
  const output = (
    name: string,
    bytes: Uint8Array,
    mime = pdfMime,
    extra: Partial<TaskOutput> = {},
  ) => {
    name = safeName(name);
    const base = name;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const match = base.match(/^(.*?)(\.[^.]+)?$/)!;
      name = `${match[1]} (${n++})${match[2] || ""}`;
    }
    used.add(name.toLowerCase());
    result.outputs.push({ name, bytes, mime, ...extra });
  };
  if (tool === "combine" || tool === "images-pdf") {
    const { PDFDocument } = await import("pdf-lib");
    engine.open(
      await (await PDFDocument.create()).save({ addDefaultPage: false }),
      "Combined.pdf",
    );
    for (const file of files) {
      if (tool === "images-pdf" && !isImageInput(file))
        throw new Error(`${file.name}: choose a PNG or JPEG image.`);
      const bytes = await inputPdf(file, options.pageSize || "A4");
      try {
        engine.merge(
          bytes,
          file.password || "",
          undefined,
          file.pages?.trim() || undefined,
          file.name,
        );
      } catch (e) {
        throw new Error(`${file.name}: ${(e as Error).message}`);
      }
    }
    let name = safeName(
      options.name?.trim() ||
        (tool === "combine" ? "Combined.pdf" : "Images.pdf"),
    );
    if (!/\.pdf$/i.test(name)) name += ".pdf";
    output(name, engine.save(), pdfMime, {
      inputBytes: files.reduce((n, file) => n + file.bytes.length, 0),
      note: `${engine.info().pages.length} pages. A new, unencrypted PDF; source files are unchanged.`,
    });
    return result;
  }
  if (tool === "compare") {
    const content: string[][] = [];
    for (const file of files) {
      const info = engine.open(file.bytes, file.name, file.password || "");
      const problem = fileProblem(tool, info);
      if (problem) throw new Error(`${file.name}: ${problem}`);
      content.push(
        Array.from({ length: info.pages.length }, (_, i) => engine.text(i)),
      );
    }
    result.comparison = Array.from(
      { length: Math.max(content[0].length, content[1].length) },
      (_, i) => ({
        page: i + 1,
        before: content[0][i] || "",
        after: content[1][i] || "",
        same:
          i < content[0].length &&
          i < content[1].length &&
          content[0][i].trim() === content[1][i].trim(),
      }),
    );
    output(
      "comparison.json",
      textBytes(
        JSON.stringify(
          { files: files.map((file) => file.name), pages: result.comparison },
          null,
          2,
        ),
      ),
      "application/json",
      {
        note: `${result.comparison.filter((p) => !p.same).length} pages have text differences. Layout and images are not compared.`,
      },
    );
    return result;
  }
  for (const file of files) {
    try {
      const info = engine.open(file.bytes, file.name, file.password || "");
      const problem = fileProblem(tool, info);
      if (problem) throw new Error(problem);
      const pages = selection(options.pages, info.pages.length),
        base = stem(file.name);
      switch (tool) {
        case "compress": {
          const compressed = engine.save({
            garbage: 4,
            compress: 1,
            "compress-images": 1,
            "compress-fonts": 1,
          });
          const smaller = compressed.length < file.bytes.length;
          output(
            `${base}-compressed.pdf`,
            smaller ? compressed : file.bytes,
            pdfMime,
            {
              inputBytes: file.bytes.length,
              note: smaller
                ? "Lossless cleanup; image quality preserved."
                : "Already optimized: the original was smaller and has been kept unchanged.",
            },
          );
          break;
        }
        case "split": {
          const every = Number(options.every || "1");
          if (!Number.isInteger(every) || every < 1)
            throw new Error(
              "Pages per file must be a whole number greater than zero.",
            );
          for (let i = 0; i < info.pages.length; i += every) {
            const part = Array.from(
              { length: Math.min(every, info.pages.length - i) },
              (_, j) => i + j,
            );
            output(
              `${base}-${i + 1}-${i + part.length}.pdf`,
              engine.extract(part),
            );
          }
          break;
        }
        case "extract":
          output(`${base}-extracted.pdf`, engine.extract(pages));
          break;
        case "rotate":
          if (![90, 180, 270].includes(Number(options.angle || 90)))
            throw new Error("Choose a rotation of 90, 180, or 270 degrees.");
          engine.action({
            type: "rotate",
            pages,
            angle: Number(options.angle || 90),
          });
          output(`${base}-rotated.pdf`, engine.save());
          break;
        case "protect":
          output(
            `${base}-protected.pdf`,
            engine.save({
              encrypt: "aes-256",
              "user-password": options.userPassword,
              "owner-password": options.ownerPassword,
            }),
            pdfMime,
            {
              note: "AES-256 encryption. Use the opening password to read this copy.",
            },
          );
          break;
        case "watermark":
          engine.action({ type: "watermark", pages, text: options.text });
          output(`${base}-watermarked.pdf`, engine.save());
          break;
        case "numbers":
          engine.action({ type: "page-numbers" });
          output(`${base}-numbered.pdf`, engine.save());
          break;
        case "sanitize":
          engine.action({ type: "sanitize" });
          output(`${base}-sanitized.pdf`, engine.save(), pdfMime, {
            note: "Metadata, attachments, and document-level actions removed. This is not a certificate of complete hidden-data removal.",
          });
          break;
        case "flatten":
          engine.action({ type: "flatten", forms: false });
          output(`${base}-flattened.pdf`, engine.save(), pdfMime, {
            note: "Annotations flattened. Form fields remain interactive.",
          });
          break;
        case "pdf-images": {
          const format = (options.format || "PNG").toLowerCase(),
            scale = Number(options.scale || "2");
          if (
            !["png", "jpg", "svg"].includes(format) ||
            ![1, 2, 3].includes(scale)
          )
            throw new Error("Choose a supported image format and resolution.");
          for (const page of pages)
            output(
              `${base}-${page + 1}.${format}`,
              engine.image(page, format, scale),
              format === "svg"
                ? "image/svg+xml"
                : format === "jpg"
                  ? "image/jpeg"
                  : "image/png",
            );
          break;
        }
        case "pdf-text": {
          const format = options.textFormat || "Plain text";
          const parts = pages.map((page) =>
            engine.text(
              page,
              format === "JSON" ? "json" : format === "HTML" ? "html" : "text",
            ),
          );
          output(
            `${base}.${format === "JSON" ? "json" : format === "HTML" ? "html" : "txt"}`,
            textBytes(
              format === "JSON"
                ? `[${parts.join(",")}]`
                : format === "HTML"
                  ? `<!doctype html><html lang="en"><meta charset="utf-8"><title>PDF text</title><body>${parts.join("\n")}</body></html>`
                  : parts.join("\n\n"),
            ),
            format === "JSON"
              ? "application/json"
              : format === "HTML"
                ? "text/html"
                : "text/plain",
          );
          break;
        }
        case "certificate-sign":
          output(
            `${base}-signed.pdf`,
            await engine.sign(
              request.certificate!,
              options.certificatePassword || "",
              options.reason || "Document approval",
            ),
          );
          break;
        default:
          throw new Error("This tool uses an interactive document workspace.");
      }
    } catch (e) {
      result.errors.push({
        id: file.id,
        name: file.name,
        message: (e as Error).message,
      });
    }
  }
  return result;
}
export async function archiveOutputs(files: TaskOutput[]) {
  const { zipSync } = await import("fflate");
  return zipSync(
    Object.fromEntries(files.map((file) => [file.name, file.bytes])),
    { level: 0 },
  );
}
