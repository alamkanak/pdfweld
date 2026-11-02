import type { HomeToolId } from "../lib/home-tools.ts";

export const siteTitle = "PDFWeld — Private PDF Editor & PDF Tools";
export const siteDescription =
  "Edit, compress, combine, split, and sign PDFs in your browser. Free local PDF tools for desktop and phone, with no accounts or document uploads.";

type Guide = {
  slug: string;
  title: string;
  summary: string;
  steps: [string, string, string];
  note: string;
};
export const toolPages: Record<HomeToolId, Guide> = {
  "edit-pdf": {
    slug: "edit-pdf",
    title: "Edit PDF Online — Private Browser PDF Editor",
    summary:
      "Add text, images, notes, shapes, and annotations to a PDF in your browser. Select and move added elements, then download your edited PDF.",
    steps: [
      "Choose a PDF from your device or local library.",
      "Continue to the editor and choose text, image, drawing, or annotation tools.",
      "Review your changes and save a PDF copy to your device.",
    ],
    note: "Original text replacement uses Helvetica. Complex original typography and paragraph reflow are not preserved.",
  },
  compress: {
    slug: "compress-pdf",
    title: "Compress PDF Online — Lossless & Private",
    summary:
      "Reduce PDF file size with lossless stream and font compression and cleanup of unused objects. Process multiple files locally and download the results.",
    steps: [
      "Choose one or more PDF files.",
      "Run Compress files to optimize each PDF on your device.",
      "Check the actual size reduction and download individual PDFs or a ZIP.",
    ],
    note: "Images are not downsampled. Already optimized PDFs may stay the same size; the original is kept when it is smaller.",
  },
  combine: {
    slug: "combine-pdf",
    title: "Combine PDF Files & Images Online",
    summary:
      "Merge PDFs, PNGs, and JPEGs into one PDF. Reorder source files, choose page ranges, and create a combined document with source bookmarks.",
    steps: [
      "Add at least two PDFs or PNG/JPEG images.",
      "Arrange the files, choose any PDF page ranges, and set the output filename.",
      "Combine the files and download your new PDF.",
    ],
    note: "The result is a new, unencrypted PDF. Forms, compatible links, layers, attachments, and source bookmarks are carried over; existing certificate signatures may become invalid.",
  },
  "fill-sign": {
    slug: "fill-and-sign-pdf",
    title: "Fill & Sign PDF Online — Forms & Signatures",
    summary:
      "Fill PDF form fields, add text, and place drawn or uploaded signature images in a focused browser workspace. Save the completed PDF locally.",
    steps: [
      "Choose a PDF and continue to Fill & sign.",
      "Fill fields, add text, or draw or upload a PNG/JPEG signature.",
      "Select added elements to move them, then save the filled PDF.",
    ],
    note: "Drawn and image signatures are annotations. Use Certificate sign for a separate cryptographic signature workflow.",
  },
  organize: {
    slug: "organize-pdf",
    title: "Organize PDF Pages — Reorder, Insert & Delete",
    summary:
      "Arrange PDF pages using thumbnails. Reorder, rotate, duplicate, insert, and delete pages, then export the organized document.",
    steps: [
      "Choose a PDF and continue to Organize pages.",
      "Select thumbnails and use drag-and-drop or the page action buttons.",
      "Review the page order and save your PDF.",
    ],
    note: "Page changes apply to the working copy. Export a copy to keep the original file unchanged.",
  },
  "images-pdf": {
    slug: "images-to-pdf",
    title: "Convert JPG & PNG Images to PDF Online",
    summary:
      "Create one PDF from PNG and JPEG images. Choose A4, US Letter, or image-sized pages and arrange images before creating the file.",
    steps: [
      "Choose PNG or JPEG images from your device.",
      "Arrange the images and choose the page size and output filename.",
      "Create and download your PDF, or open it in the editor.",
    ],
    note: "One page is created per image. Image proportions and PNG transparency are preserved; other image formats need conversion first.",
  },
  split: {
    slug: "split-pdf",
    title: "Split PDF Online — Separate Pages into Files",
    summary:
      "Split a PDF into smaller files with a chosen number of pages per file. Process batches and download individual parts or a ZIP.",
    steps: [
      "Choose one or more PDF files.",
      "Set how many pages each output file should contain and run Split PDF.",
      "Download the separate PDF files or all results as a ZIP.",
    ],
    note: "The final part can contain fewer pages. Split creates new copies; use Extract pages to select nonconsecutive pages.",
  },
  extract: {
    slug: "extract-pdf-pages",
    title: "Extract PDF Pages Online — Choose Page Ranges",
    summary:
      "Copy selected PDF pages into a new file. Enter individual page numbers or ranges in your chosen order and download the extracted document.",
    steps: [
      "Choose PDF files from your device or local library.",
      "Enter page numbers or ranges, such as 1, 3-5, and run Extract pages.",
      "Download the extracted PDFs or a ZIP of all results.",
    ],
    note: "Page numbers start at 1. The requested order is preserved and duplicate page selections are removed.",
  },
  rotate: {
    slug: "rotate-pdf",
    title: "Rotate PDF Pages Online — 90°, 180° or 270°",
    summary:
      "Rotate all pages or selected page ranges in a PDF. Choose a rotation and process files locally without uploading documents.",
    steps: [
      "Choose one or more PDF files.",
      "Choose 90, 180, or 270 degrees and optionally enter a page range.",
      "Run Rotate PDF and download the rotated copies.",
    ],
    note: "Leaving Pages blank rotates every page. Source files on your device are unchanged.",
  },
  "pdf-images": {
    slug: "pdf-to-images",
    title: "Convert PDF to PNG, JPG or SVG Online",
    summary:
      "Export PDF pages as PNG, JPEG, or SVG images. Select pages and resolution, then download the images individually or in a ZIP.",
    steps: [
      "Choose PDFs and optionally specify a page range.",
      "Choose PNG, JPG, or SVG and the raster image resolution.",
      "Run PDF to images and download the output files.",
    ],
    note: "PNG and JPG support 72, 144, or 216 dpi. SVG is vector output. Higher resolution requires more device memory.",
  },
  "pdf-text": {
    slug: "pdf-to-text",
    title: "Extract PDF Text Online — TXT, HTML & JSON",
    summary:
      "Extract embedded PDF text as plain text, HTML, or structured-text JSON. Choose pages and download files processed in your browser.",
    steps: [
      "Choose PDFs and the pages to extract.",
      "Select Plain text, HTML, or JSON and run PDF to text.",
      "Download the text files or a ZIP.",
    ],
    note: "Scanned image-only PDFs need OCR first. Text extraction does not provide high-fidelity Word or Office document conversion.",
  },
  protect: {
    slug: "password-protect-pdf",
    title: "Password Protect PDF Online — AES-256 Encryption",
    summary:
      "Create password-protected PDF copies with AES-256 encryption. Set opening and owner passwords and encrypt files entirely on your device.",
    steps: [
      "Choose the PDF files to protect.",
      "Enter an opening password and an owner password.",
      "Run Protect PDF and download the encrypted copies.",
    ],
    note: "Passwords apply to every output in the batch and stay on your device. Keep them safely; PDFWeld does not provide password recovery.",
  },
  watermark: {
    slug: "watermark-pdf",
    title: "Add a Text Watermark to PDF Online",
    summary:
      "Add a text watermark to all pages or a selected range in a PDF. Process multiple files locally and download watermarked copies.",
    steps: [
      "Choose one or more PDFs.",
      "Enter the watermark text and optionally select pages.",
      "Run Watermark PDF and download the results.",
    ],
    note: "A watermark adds visible page content. It does not redact or remove the original content underneath it.",
  },
  numbers: {
    slug: "add-pdf-page-numbers",
    title: "Add Page Numbers to PDF Online",
    summary:
      "Number the pages in a PDF and download a new copy. Add page numbers to multiple documents with local browser processing.",
    steps: [
      "Choose PDF files from your device or library.",
      "Run Page numbers to number each document's pages.",
      "Download the numbered PDFs or all results as a ZIP.",
    ],
    note: "Page numbers are added to the page content. Existing printed numbers are not automatically removed.",
  },
  sanitize: {
    slug: "sanitize-pdf",
    title: "Sanitize PDF — Remove Metadata & Attachments",
    summary:
      "Remove PDF metadata, embedded attachments, and document-level actions. Create a cleaned copy using local browser processing.",
    steps: [
      "Choose the PDF files to clean.",
      "Run Sanitize PDF to remove supported metadata, attachments, and document-level actions.",
      "Download and review the sanitized copies.",
    ],
    note: "Sanitizing does not certify removal of every hidden-data type. Use applied redaction to remove selected page content.",
  },
  flatten: {
    slug: "flatten-pdf-annotations",
    title: "Flatten PDF Annotations Online",
    summary:
      "Make PDF annotations part of the page content. Flatten markup in your browser while keeping form fields interactive.",
    steps: [
      "Choose one or more annotated PDFs.",
      "Run Flatten markup to incorporate annotations into the pages.",
      "Download the flattened copies.",
    ],
    note: "Form fields remain interactive in this tool. Keep an editable original if you may need to change annotations later.",
  },
  compare: {
    slug: "compare-pdf",
    title: "Compare PDF Text Online — Local Document Comparison",
    summary:
      "Compare extracted text from two PDFs. Preview changed pages side by side and download the full comparison as JSON.",
    steps: [
      "Choose exactly two PDF files.",
      "Run Compare PDFs to compare their extracted text page by page.",
      "Review text differences and download the complete JSON comparison.",
    ],
    note: "Comparison checks text, not pixel, image, or layout differences. The preview limits long pages; the JSON contains the full extracted-text comparison.",
  },
  "certificate-sign": {
    slug: "digitally-sign-pdf",
    title: "Digitally Sign PDF with a Local P12 Certificate",
    summary:
      "Sign an exported PDF copy using a local PKCS#12 or PFX certificate. Create a cryptographic signature without uploading the PDF or certificate.",
    steps: [
      "Choose a PDF and your P12 or PFX certificate.",
      "Enter the certificate password and a reason for signing.",
      "Run Certificate sign and download the signed copy.",
    ],
    note: "This creates a basic invisible digital signature. Encrypted or already signed sources are rejected. No online timestamp, certificate validation, or revocation service is contacted.",
  },
  ocr: {
    slug: "ocr-pdf",
    title: "OCR PDF Online — Make Scanned PDFs Searchable",
    summary:
      "Recognize English text in scanned PDF pages using local OCR. Add an invisible searchable text layer while retaining the page image.",
    steps: [
      "Choose a scanned PDF and continue to OCR.",
      "Select the pages for English text recognition.",
      "Review the result and export your searchable PDF.",
    ],
    note: "The English OCR model loads from this site on demand. Recognition accuracy depends on scan quality; multilingual recognition is not included.",
  },
  redact: {
    slug: "redact-pdf",
    title: "Redact PDF Online — Permanently Remove Selected Content",
    summary:
      "Mark sensitive areas and apply real PDF redaction locally. Export a rewritten PDF that removes the selected content rather than covering it with a rectangle.",
    steps: [
      "Choose a PDF and continue to Redact PDF.",
      "Mark the sensitive areas, then apply redactions from the tools panel.",
      "Review the exported PDF and keep the original separately if needed.",
    ],
    note: "Applied redaction is destructive to selected content. Metadata and other occurrences elsewhere must be reviewed separately.",
  },
  crop: {
    slug: "crop-pdf",
    title: "Crop PDF Pages Online",
    summary:
      "Adjust the visible area of PDF pages in a browser workspace. Choose page crop boundaries and save a cropped PDF copy.",
    steps: [
      "Choose a PDF and continue to Crop PDF.",
      "Select the crop area on the page and review its boundaries.",
      "Save a copy of the cropped document.",
    ],
    note: "Cropping changes the visible page area; it does not securely remove hidden content. Use redaction for content removal.",
  },
};
export const toolIds = Object.keys(toolPages) as HomeToolId[];
export function toolPath(id: HomeToolId, base = import.meta.env.BASE_URL) {
  return `${base}tools/${toolPages[id].slug}/`;
}
export function publicRoute(
  pathname: string,
  base: string,
): HomeToolId | null | "not-found" {
  if (pathname === base || pathname === `${base}index.html`) return null;
  return (
    toolIds.find(
      (id) =>
        pathname === toolPath(id, base) ||
        pathname === `${toolPath(id, base)}index.html`,
    ) || "not-found"
  );
}
