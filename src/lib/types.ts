export type Rect = [number, number, number, number];
export type Point = [number, number];
export type Tool =
  | "select"
  | "hand"
  | "ink"
  | "highlight"
  | "underline"
  | "strike"
  | "text"
  | "note"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "redact"
  | "eraser"
  | "stamp"
  | "signature"
  | "link"
  | "crop"
  | "replace"
  | "field"
  | "image";
export type Panel =
  | "pages"
  | "outline"
  | "comments"
  | "search"
  | "tools"
  | "properties"
  | "forms"
  | "layers"
  | "attachments"
  | null;
export interface PageInfo {
  width: number;
  height: number;
  label: string;
}
export interface DocumentInfo {
  name: string;
  pages: PageInfo[];
  title: string;
  author: string;
  subject: string;
  keywords: string;
  version: number;
  encrypted: boolean;
  repaired: boolean;
  signedFields: number;
  canUndo: boolean;
  canRedo: boolean;
  layers: { name: string; visible: boolean }[];
  attachments: { name: string; size: number; mime: string }[];
  outline: Outline[];
  permissions: {
    edit: boolean;
    copy: boolean;
    print: boolean;
    annotate: boolean;
    form: boolean;
  };
}
export interface Outline {
  title?: string;
  uri?: string;
  page?: number;
  down?: Outline[];
}
export interface AnnotationInfo {
  id: number;
  type: string;
  rect: Rect;
  text: string;
  author: string;
  color: number[];
  created: string;
  replyTo?: number;
  locked: boolean;
  fontSize?: number;
  opacity?: number;
  width?: number;
  signatureGroup?: string;
}
export interface TextDraft {
  page: number;
  id?: number;
  rect: Rect;
  text: string;
  kind: "text" | "replace";
  color: string;
  fontSize: number;
  opacity: number;
  replaceRect?: Rect;
  fixedSize?: boolean;
}
export interface FieldInfo {
  id: number;
  name: string;
  label: string;
  type: string;
  value: string;
  rect: Rect;
  options: string[];
  readOnly: boolean;
}
export interface TextChar {
  text: string;
  quad: number[];
  size: number;
}
export interface TextLine {
  text: string;
  rect: Rect;
  size: number;
  chars: TextChar[];
}
export interface PageDetails {
  annotations: AnnotationInfo[];
  fields: FieldInfo[];
  lines: TextLine[];
  links: { rect: Rect; uri: string }[];
}
export interface Mark {
  tool: Tool;
  page: number;
  rect: Rect;
  points?: Point[];
  signatureGroup?: string;
  text?: string;
  color: string;
  width: number;
  opacity: number;
  author: string;
  quads?: number[][];
  image?: Uint8Array;
  replaceRect?: Rect;
}
export interface RenderResult {
  pixels: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
  ms: number;
  bitmap?: ImageBitmap;
}
export interface SearchHit {
  page: number;
  quads: number[][];
  text: string;
}
export interface RecentFile {
  id: string;
  name: string;
  bytes: Uint8Array;
  updated: number;
  pages: number;
  thumbnail?: Blob | Uint8Array;
}
export interface BenchmarkReport {
  version: string;
  timestamp: string;
  userAgent: string;
  viewport: string;
  devicePixelRatio: number;
  scenario: string;
  durationMs: number;
  displayHz: number;
  fps: number;
  frameP50: number;
  frameP95: number;
  frameP99: number;
  droppedFrames: number;
  longTasks: number | null;
  longTaskMs: number | null;
  longTasksSupported: boolean;
  inputP95: number;
  inputSamples: number;
  renderP95: number;
  renders: number;
  targetFps: number;
  targetMet: boolean;
  notes: string[];
}
export type Operation = { type: string; [key: string]: unknown };
