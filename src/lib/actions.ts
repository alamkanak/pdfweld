import { useApp, ask, confirmAction, persist } from "./store";
import { engine } from "./client";
import { baseName, download, downloadZip, parsePages, pickFile } from "./files";
import { drawingTools } from "./tools";
import type { Tool } from "./types";
import { homeToolForAction, type HomeToolId } from "./home-tools";
import { thumbnails } from "./thumbnails";
import { commitTextDraft } from "./text-editing";
export function startHomeTool(id: HomeToolId, action?: string) {
  if (useApp.getState().busy) return;
  thumbnails.cancel();
  useApp.setState({ homeTool: id, homeAction: action || null, dialog: null });
}
export async function chooseTool(tool: Tool) {
  await commitTextDraft();
  if (useApp.getState().textDraft) return;
  const s = useApp.getState();
  if (!s.info) {
    s.notify("Open a PDF to use the editing tools.");
    return;
  }
  if (s.busy) return;
  if (tool === "signature") {
    s.set({ dialog: "signature" });
    return;
  }
  if (tool === "image") {
    await chooseImage();
    return;
  }
  useApp.setState({
    tool,
    panel: innerWidth < 768 ? null : s.panel,
    dialog: null,
  });
}
export async function chooseImage(signature = false) {
  const session = useApp.getState().id;
  const [file] = await pickFile("image/png,image/jpeg");
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Choose a valid PNG or JPEG image."));
    });
    image.src = url;
    await loaded;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const s = useApp.getState();
    if (s.id !== session || !s.info || s.busy) return;
    s.set({
      image: bytes,
      imageAspectRatio: image.naturalWidth / image.naturalHeight,
      imageLabel: signature ? "Signature" : file.name,
      tool: "image",
      panel: innerWidth < 768 ? null : s.panel,
      dialog: null,
    });
    s.notify(
      `Tap to place your ${signature ? "signature" : "image"}, or drag to choose its size.`,
    );
  } catch (error) {
    useApp.getState().fail(error);
  } finally {
    URL.revokeObjectURL(url);
  }
}
const selected = () => {
  const s = useApp.getState();
  return s.selection.length ? s.selection : [s.page];
};
export async function newDocument() {
  const answer = await ask({
    title: "A fresh document",
    fields: [
      { key: "name", label: "Document name", value: "Untitled" },
      {
        key: "size",
        label: "Page size",
        value: "A4",
        options: ["A4", "US Letter", "Square"],
      },
    ],
    submit: "Create document",
  });
  if (!answer) return;
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.addPage(
    answer.size === "US Letter"
      ? [612, 792]
      : answer.size === "Square"
        ? [700, 700]
        : [595, 842],
  );
  await useApp
    .getState()
    .open(await doc.save(), `${answer.name || "Untitled"}.pdf`);
}
export async function imagesToPDF(files?: File[]) {
  const images = files || (await pickFile("image/png,image/jpeg", true));
  if (!images.length) return;
  const s = useApp.getState();
  s.set({ busy: "Creating PDF from images…" });
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    for (const file of images) {
      const data = new Uint8Array(await file.arrayBuffer());
      const image =
        file.type === "image/png"
          ? await doc.embedPng(data)
          : await doc.embedJpg(data);
      const p = doc.addPage([image.width, image.height]);
      p.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }
    const bytes = await doc.save();
    s.set({ busy: "" });
    await s.open(bytes, `${baseName(images[0].name)}.pdf`);
  } catch (e) {
    s.fail(e);
  }
}
export async function runAction(id: string) {
  await commitTextDraft();
  if (useApp.getState().textDraft) return;
  const s = useApp.getState();
  if (s.busy) return;
  if (!s.info) {
    const tool = homeToolForAction(id);
    if (tool) startHomeTool(tool, id);
    else s.notify("Choose a tool from the home page.");
    return;
  }
  if (drawingTools.some((t) => t.id === id)) {
    await chooseTool(id as Tool);
    return;
  }
  const info = s.info;
  try {
    switch (id) {
      case "organize":
        s.set({ dialog: "organize" });
        break;
      case "comments":
      case "forms":
      case "properties":
      case "attachments":
      case "layers":
      case "search":
        s.set({ panel: id as typeof s.panel, dialog: null });
        break;
      case "benchmark":
      case "check":
      case "compare":
        s.set({ dialog: id });
        break;
      case "rotate":
        await s.act({ type: "rotate", pages: selected(), angle: 90 });
        break;
      case "blank":
        await s.act({ type: "blank", at: s.page + 1 });
        break;
      case "duplicate":
        await s.act({ type: "duplicate", pages: selected() });
        break;
      case "delete":
        if (
          await confirmAction(
            "Delete selected pages?",
            `${selected().length} page(s) will be removed. You can undo this change.`,
            "Delete pages",
          )
        )
          await s.act({ type: "delete-pages", pages: selected() });
        s.set({ selection: [] });
        break;
      case "merge": {
        const files = await pickFile(".pdf", true);
        if (!files.length) return;
        s.set({ busy: "Combining documents…" });
        for (const file of files) {
          s.update(
            await engine.call(
              "merge",
              new Uint8Array(await file.arrayBuffer()),
            ),
          );
        }
        s.set({ busy: "" });
        s.notify(`${files.length} document(s) added.`);
        break;
      }
      case "extract": {
        const answer = await ask({
          title: "Extract pages",
          fields: [
            {
              key: "pages",
              label: "Pages and ranges",
              value: selected()
                .map((i) => i + 1)
                .join(", "),
              required: true,
            },
          ],
          submit: "Export pages",
        });
        if (!answer) return;
        download(
          await engine.call(
            "extract",
            parsePages(answer.pages, info.pages.length),
          ),
          `${baseName(info.name)}-extracted.pdf`,
        );
        break;
      }
      case "split": {
        const answer = await ask({
          title: "Split document",
          description: "Each part is saved together in a ZIP file.",
          fields: [
            {
              key: "every",
              label: "Pages per file",
              type: "number",
              value: "1",
              required: true,
            },
          ],
          submit: "Split and download",
        });
        if (!answer) return;
        const n = Number(answer.every);
        if (!Number.isInteger(n) || n < 1)
          throw new Error("Enter a whole number of pages greater than zero.");
        s.set({ busy: "Splitting document…" });
        const files: Record<string, Uint8Array> = {};
        for (let i = 0; i < info.pages.length; i += n)
          files[
            `${baseName(info.name)}-${i + 1}-${Math.min(info.pages.length, i + n)}.pdf`
          ] = await engine.call(
            "extract",
            Array.from(
              { length: Math.min(n, info.pages.length - i) },
              (_, j) => i + j,
            ),
          );
        downloadZip(files, `${baseName(info.name)}-split.zip`);
        s.set({ busy: "" });
        break;
      }
      case "labels": {
        const answer = await ask({
          title: "Page labels",
          fields: [
            { key: "prefix", label: "Label prefix", value: "Page " },
            {
              key: "start",
              label: "Starting number",
              value: "1",
              type: "number",
            },
          ],
        });
        if (answer)
          await s.act({
            type: "labels",
            page: s.page,
            prefix: answer.prefix,
            start: Number(answer.start) || 1,
          });
        break;
      }
      case "certificate-sign": {
        const [file] = await pickFile(".p12,.pfx");
        if (!file) return;
        const answer = await ask({
          title: "Sign a copy with your certificate",
          description:
            "The certificate and password stay on this device. This creates an invisible basic digital signature, without a trusted timestamp or online validation. Encrypted and already-signed documents are excluded.",
          fields: [
            {
              key: "password",
              label: "Certificate password",
              type: "password",
            },
            {
              key: "reason",
              label: "Reason for signing",
              value: "Document approval",
            },
          ],
          submit: "Sign and export",
        });
        if (!answer) return;
        const certificate = new Uint8Array(await file.arrayBuffer());
        s.set({ busy: "Signing locally…" });
        try {
          const bytes = await engine.call(
            "sign",
            certificate,
            answer.password,
            answer.reason,
          );
          download(bytes, `${baseName(info.name)}-signed.pdf`);
          s.set({ busy: "" });
          s.notify(
            "Certificate-signed copy exported. Verify it in your PDF reader.",
          );
        } finally {
          certificate.fill(0);
          answer.password = "";
        }
        break;
      }
      case "protect": {
        const answer = await ask({
          title: "Protect a copy",
          description:
            "Export an AES-256 encrypted copy. Keep the owner password somewhere safe.",
          fields: [
            {
              key: "user",
              label: "Password to open the file",
              type: "password",
              required: true,
            },
            {
              key: "owner",
              label: "Owner password",
              type: "password",
              required: true,
            },
          ],
          submit: "Encrypt and export",
        });
        if (answer) {
          const data = await engine.call("save", {
            encrypt: "aes-256",
            "user-password": answer.user,
            "owner-password": answer.owner,
          });
          download(data, `${baseName(info.name)}-protected.pdf`);
        }
        break;
      }
      case "redactions":
        if (
          await confirmAction(
            "Permanently redact marked areas?",
            "Marked text and overlapping image pixels will be removed. Overlapping vector graphics may be removed completely. Exported PDFs are fully rewritten to discard earlier revisions. Keep your original file.",
            "Apply redactions",
          )
        ) {
          await s.act({ type: "redact" });
          s.notify("Redactions applied. Export the PDF to save the result.");
        }
        break;
      case "sanitize":
        if (
          await confirmAction(
            "Sanitize this document?",
            "This removes document metadata, embedded attachments, and document-level JavaScript and actions. It does not certify removal of every possible hidden data type.",
            "Sanitize",
          )
        )
          await s.act({ type: "sanitize" });
        break;
      case "flatten":
        if (
          await confirmAction(
            "Flatten annotations?",
            "Markup will become permanent page content. Form fields stay interactive.",
            "Flatten markup",
          )
        )
          await s.act({ type: "flatten", forms: false });
        break;
      case "reset":
        if (
          await confirmAction(
            "Reset all form fields?",
            "Restore all form fields to their default values.",
            "Reset form",
          )
        )
          await s.act({ type: "reset-forms" });
        break;
      case "watermark": {
        const answer = await ask({
          title: "Add watermark",
          fields: [
            {
              key: "text",
              label: "Watermark text",
              value: "DRAFT",
              required: true,
            },
            {
              key: "scope",
              label: "Apply to",
              value: "All pages",
              options: ["All pages", "Selected pages"],
            },
          ],
        });
        if (answer)
          await s.act({
            type: "watermark",
            text: answer.text,
            pages:
              answer.scope === "All pages"
                ? info.pages.map((_, i) => i)
                : selected(),
          });
        break;
      }
      case "numbers":
        await s.act({ type: "page-numbers" });
        break;
      case "bookmark": {
        const answer = await ask({
          title: "Bookmark this page",
          fields: [
            {
              key: "title",
              label: "Bookmark title",
              value: `Page ${s.page + 1}`,
              required: true,
            },
          ],
        });
        if (answer)
          await s.act({ type: "bookmark", page: s.page, title: answer.title });
        break;
      }
      case "export-pdf":
        await s.save();
        break;
      case "compress": {
        s.set({ busy: "Optimizing PDF…" });
        const bytes = await engine.call("save", {
          garbage: 4,
          compress: 1,
          "compress-images": 1,
          "compress-fonts": 1,
        });
        download(bytes, `${baseName(info.name)}-optimized.pdf`);
        s.set({ busy: "" });
        s.notify("Optimized copy exported. Image quality was preserved.");
        break;
      }
      case "export-images": {
        const answer = await ask({
          title: "Export page images",
          fields: [
            {
              key: "pages",
              label: "Pages",
              value: selected()
                .map((i) => i + 1)
                .join(", "),
              required: true,
            },
            {
              key: "format",
              label: "Format",
              value: "PNG",
              options: ["PNG", "JPG", "SVG"],
            },
            {
              key: "scale",
              label: "Resolution",
              value: "2×",
              options: ["1×", "2×", "3×"],
            },
          ],
          submit: "Export images",
        });
        if (!answer) return;
        s.set({ busy: "Rendering images…" });
        const pages = parsePages(answer.pages, info.pages.length),
          files: Record<string, Uint8Array> = {};
        for (const page of pages) {
          const format = answer.format.toLowerCase();
          files[`${baseName(info.name)}-${page + 1}.${format}`] =
            await engine.call("image", page, format, parseInt(answer.scale));
        }
        if (pages.length === 1) {
          const [name, data] = Object.entries(files)[0];
          download(
            data,
            name,
            answer.format === "PNG"
              ? "image/png"
              : answer.format === "SVG"
                ? "image/svg+xml"
                : "image/jpeg",
          );
        } else downloadZip(files, `${baseName(info.name)}-images.zip`);
        s.set({ busy: "" });
        break;
      }
      case "export-text": {
        const answer = await ask({
          title: "Export document text",
          fields: [
            {
              key: "format",
              label: "Format",
              value: "Plain text",
              options: ["Plain text", "HTML", "JSON"],
            },
          ],
          submit: "Export text",
        });
        if (!answer) return;
        s.set({ busy: "Extracting text…" });
        const format =
            answer.format === "JSON"
              ? "json"
              : answer.format === "HTML"
                ? "html"
                : "text",
          parts: string[] = [];
        for (let i = 0; i < info.pages.length; i++)
          parts.push(await engine.call("text", i, format));
        const text =
          format === "json"
            ? `[${parts.join(",")}]`
            : format === "html"
              ? `<!doctype html><html lang="en"><meta charset="utf-8"><title>PDF text</title><body>${parts.join("\n")}</body></html>`
              : parts.join("\n\n");
        download(
          text,
          `${baseName(info.name)}.${format === "text" ? "txt" : format}`,
          format === "json"
            ? "application/json"
            : format === "html"
              ? "text/html"
              : "text/plain",
        );
        s.set({ busy: "" });
        break;
      }
      case "ocr":
        await runOCR();
        break;
      case "print": {
        if (!info.permissions.print)
          throw new Error("Printing is restricted by this document.");
        const data = await engine.call("save");
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(data)], { type: "application/pdf" }),
        );
        const frame = document.createElement("iframe");
        frame.className = "fixed -left-[9999px] h-px w-px";
        frame.src = url;
        document.body.append(frame);
        frame.onload = () =>
          setTimeout(() => {
            try {
              frame.contentWindow?.focus();
              frame.contentWindow?.print();
            } catch {
              download(data, info.name);
            }
            setTimeout(() => {
              frame.remove();
              URL.revokeObjectURL(url);
            }, 120000);
          }, 500);
        s.notify(
          "Opening the system print dialog. On mobile, export and use Share → Print.",
        );
        break;
      }
    }
  } catch (e) {
    s.fail(e);
  }
}
async function runOCR() {
  const s = useApp.getState();
  const answer = await ask({
    title: "Recognize text locally",
    description:
      "English OCR runs entirely on your device. The included language model is loaded on demand. Existing page images are preserved.",
    fields: [
      {
        key: "pages",
        label: "Pages to recognize",
        value: String(s.page + 1),
        required: true,
      },
    ],
    submit: "Recognize text",
  });
  if (!answer) return;
  const pages = parsePages(answer.pages, s.info!.pages.length);
  s.set({ busy: "Loading local OCR engine…" });
  let worker:
    | Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>
    | undefined;
  try {
    const { createWorker } = await import("tesseract.js");
    const root = new URL(`${import.meta.env.BASE_URL}ocr/`, location.href).href;
    worker = await createWorker("eng", 1, {
      workerPath: `${root}worker.min.js`,
      corePath: root,
      langPath: root,
      workerBlobURL: false,
      logger: (m) => {
        if (m.status === "recognizing text")
          useApp.setState({
            busy: `Recognizing text… ${Math.round(m.progress * 100)}%`,
          });
      },
    });
    for (const page of pages) {
      const png = await engine.call("image", page, "png", 2);
      const result = await worker.recognize(
        new Blob([new Uint8Array(png)]),
        {},
        { blocks: true },
      );
      const words =
        result.data.blocks?.flatMap((b) =>
          b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
        ) || [];
      if (!words.length) {
        s.notify(`No text found on page ${page + 1}.`);
        continue;
      }
      const imageWidth = Math.ceil(s.info!.pages[page].width * 2);
      s.update(
        await engine.call(
          "addOcr",
          page,
          words.map((w) => ({ text: w.text, bbox: w.bbox })),
          imageWidth,
        ),
      );
    }
    s.set({ busy: "" });
    s.notify("Searchable text added. Export your PDF to keep it.");
    await persist();
  } catch (e) {
    s.fail(e);
  } finally {
    await worker?.terminate();
  }
}
