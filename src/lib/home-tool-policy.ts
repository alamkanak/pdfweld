import type { HomeToolId } from "./home-tools";
import type { DocumentInfo } from "./types";
export function fileProblem(tool: HomeToolId, info: DocumentInfo) {
  if (
    [
      "combine",
      "split",
      "extract",
      "pdf-images",
      "pdf-text",
      "compare",
    ].includes(tool) &&
    !info.permissions.copy
  )
    return "Copying is restricted. Enter the owner password.";
  if (
    [
      "compress",
      "rotate",
      "protect",
      "watermark",
      "numbers",
      "sanitize",
      "flatten",
    ].includes(tool) &&
    !info.permissions.edit
  )
    return "Changes are restricted. Enter the owner password.";
  return "";
}
