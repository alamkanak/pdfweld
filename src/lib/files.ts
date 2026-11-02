import Dexie, { type EntityTable } from "dexie";
import { zipSync, strToU8 } from "fflate";
import type { RecentFile } from "./types";
class Library extends Dexie {
  files!: EntityTable<RecentFile, "id">;
  constructor() {
    super("pdfweld-library");
    this.version(1).stores({ files: "id,updated,name" });
  }
}
export const library = new Library();
export function download(
  data: Uint8Array | string | Blob,
  name: string,
  type = "application/pdf",
) {
  const blob =
    data instanceof Blob
      ? data
      : new Blob([typeof data === "string" ? data : new Uint8Array(data)], {
          type,
        });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function downloadZip(
  files: Record<string, Uint8Array | string>,
  name: string,
) {
  download(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([k, v]) => [
          k,
          typeof v === "string" ? strToU8(v) : v,
        ]),
      ),
    ),
    name,
    "application/zip",
  );
}
export function pickFile(accept = ".pdf", multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files || []));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}
export { parsePages } from "./page-ranges";
export const baseName = (name: string) => name.replace(/\.[^.]+$/, "");
