import {
  FilePenLine,
  Minimize2,
  Files,
  Signature,
  Grid2X2,
  Scissors,
  FileOutput,
  RotateCw,
  Image,
  FileText,
  LockKeyhole,
  Droplets,
  ListOrdered,
  ScanText,
  ScanLine,
  Crop,
  Layers,
  Columns2,
  BadgeCheck,
} from "lucide-react";
import type { DocumentInfo } from "./types";

export const homeTools = [
  {
    id: "edit-pdf",
    label: "Edit PDF",
    description: "Edit text, images, and annotations.",
    icon: FilePenLine,
    category: "Edit",
    kind: "interactive",
    accept: "pdf",
    multiple: false,
  },
  {
    id: "compress",
    label: "Compress PDF",
    description: "Reduce file size with lossless cleanup.",
    icon: Minimize2,
    category: "Optimize",
    kind: "process",
    accept: "pdf",
    multiple: true,
  },
  {
    id: "combine",
    label: "Combine files",
    description: "Reorder and merge PDFs and images.",
    icon: Files,
    category: "Organize",
    kind: "process",
    accept: "mixed",
    multiple: true,
    minFiles: 2,
  },
  {
    id: "fill-sign",
    label: "Fill & sign",
    description: "Fill forms, add text, and place signatures.",
    icon: Signature,
    category: "Edit",
    kind: "interactive",
    accept: "pdf",
    multiple: false,
  },
  {
    id: "organize",
    label: "Organize pages",
    description: "Reorder, insert, duplicate, or delete pages.",
    icon: Grid2X2,
    category: "Organize",
    kind: "interactive",
    accept: "pdf",
    multiple: false,
    action: "organize",
  },
  {
    id: "images-pdf",
    label: "Images to PDF",
    description: "Create one PDF from PNG or JPEG images.",
    icon: Image,
    category: "Convert",
    kind: "process",
    accept: "images",
    multiple: true,
  },
  {
    id: "split",
    label: "Split PDF",
    description: "Split into files of a chosen page count.",
    icon: Scissors,
    category: "Organize",
    kind: "process",
    accept: "pdf",
    multiple: true,
  },
  {
    id: "extract",
    label: "Extract pages",
    description: "Copy selected pages to a new PDF.",
    icon: FileOutput,
    category: "Organize",
    kind: "process",
    accept: "pdf",
    multiple: true,
  },
  {
    id: "rotate",
    label: "Rotate PDF",
    description: "Rotate all pages or a page range.",
    icon: RotateCw,
    category: "Organize",
    kind: "process",
    accept: "pdf",
    multiple: true,
  },
  {
    id: "pdf-images",
    label: "PDF to images",
    description: "Export pages as PNG, JPEG, or SVG.",
    icon: Image,
    category: "Convert",
    kind: "process",
    accept: "pdf",
    multiple: true,
  },
  {
    id: "pdf-text",
    label: "PDF to text",
    description: "Extract plain text, HTML, or JSON.",
    icon: FileText,
    category: "Convert",
    kind: "process",
    accept: "pdf",
    multiple: true,
  },
  {
    id: "protect",
    label: "Protect PDF",
    description: "Create an AES-256 password-protected copy.",
    icon: LockKeyhole,
    category: "Protect",
    kind: "process",
    accept: "pdf",
    multiple: true,
  },
  {
    id: "watermark",
    label: "Watermark PDF",
    description: "Add a text watermark to your pages.",
    icon: Droplets,
    category: "Edit",
    kind: "process",
    accept: "pdf",
    multiple: true,
  },
  {
    id: "numbers",
    label: "Page numbers",
    description: "Number every page in a PDF.",
    icon: ListOrdered,
    category: "Edit",
    kind: "process",
    accept: "pdf",
    multiple: true,
  },
  {
    id: "sanitize",
    label: "Sanitize PDF",
    description: "Remove metadata, attachments, and document actions.",
    icon: Droplets,
    category: "Protect",
    kind: "process",
    accept: "pdf",
    multiple: true,
  },
  {
    id: "flatten",
    label: "Flatten markup",
    description: "Make annotations part of the page.",
    icon: Layers,
    category: "Edit",
    kind: "process",
    accept: "pdf",
    multiple: true,
  },
  {
    id: "compare",
    label: "Compare PDFs",
    description: "Compare the extracted text of two PDFs.",
    icon: Columns2,
    category: "Inspect",
    kind: "process",
    accept: "pdf",
    multiple: true,
    minFiles: 2,
    maxFiles: 2,
  },
  {
    id: "certificate-sign",
    label: "Sign with certificate",
    description: "Sign locally with a P12 or PFX certificate.",
    icon: BadgeCheck,
    category: "Protect",
    kind: "process",
    accept: "pdf",
    multiple: false,
  },
  {
    id: "ocr",
    label: "Recognize text",
    description: "Add searchable English text with local OCR.",
    icon: ScanText,
    category: "Convert",
    kind: "interactive",
    accept: "pdf",
    multiple: false,
    action: "ocr",
  },
  {
    id: "redact",
    label: "Redact PDF",
    description: "Mark and permanently remove selected content.",
    icon: ScanLine,
    category: "Protect",
    kind: "interactive",
    accept: "pdf",
    multiple: false,
    action: "redact",
  },
  {
    id: "crop",
    label: "Crop PDF",
    description: "Choose the visible area of each page.",
    icon: Crop,
    category: "Edit",
    kind: "interactive",
    accept: "pdf",
    multiple: false,
    action: "crop",
  },
] as const;
export type HomeToolId = (typeof homeTools)[number]["id"];
export type HomeTool = (typeof homeTools)[number];
export const getHomeTool = (id: HomeToolId) =>
  homeTools.find((tool) => tool.id === id)!;
export const recommendedTools = homeTools.slice(0, 6);
export type TaskFile = {
  id: string;
  name: string;
  bytes: Uint8Array;
  mime: string;
  password?: string;
  pages?: string;
  libraryId?: string;
};
export type TaskOptions = Record<string, string>;
export type TaskOutput = {
  name: string;
  bytes: Uint8Array;
  mime: string;
  inputBytes?: number;
  note?: string;
};
export type ComparedPage = {
  page: number;
  same: boolean;
  before: string;
  after: string;
};
export type TaskResult = {
  outputs: TaskOutput[];
  errors: { id: string; name: string; message: string }[];
  comparison?: ComparedPage[];
};
export type TaskRequest = {
  tool: HomeToolId;
  files: TaskFile[];
  options: TaskOptions;
  certificate?: Uint8Array;
};
export const homeToolForAction = (id: string): HomeToolId | undefined => {
  const mapped: Record<string, HomeToolId> = {
    merge: "combine",
    forms: "fill-sign",
    signature: "fill-sign",
    "export-images": "pdf-images",
    "export-text": "pdf-text",
    "page-numbers": "numbers",
    properties: "edit-pdf",
    check: "edit-pdf",
    reset: "fill-sign",
    "certificate-sign": "certificate-sign",
    redactions: "redact",
  };
  if (mapped[id]) return mapped[id];
  if (homeTools.some((tool) => tool.id === id)) return id as HomeToolId;
  if (
    [
      "select",
      "hand",
      "ink",
      "highlight",
      "underline",
      "strike",
      "text",
      "note",
      "rectangle",
      "ellipse",
      "line",
      "arrow",
      "eraser",
      "stamp",
      "image",
      "link",
      "replace",
      "field",
      "delete",
      "duplicate",
      "blank",
      "labels",
      "bookmark",
      "comments",
      "attachments",
      "layers",
      "search",
    ].includes(id)
  )
    return "edit-pdf";
};
export { fileProblem } from "./home-tool-policy";
