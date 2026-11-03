import { useApp } from "./store";
import type { Rect } from "./types";

// A rapid second drag must wait for the first PDF commit, rather than being
// discarded by the store's ordinary busy guard. Never carry it to another PDF.
export async function transformAnnotation(
  documentId: string,
  page: number,
  id: number,
  rect: Rect,
) {
  while (useApp.getState().busy) {
    if (useApp.getState().id !== documentId) return false;
    await new Promise<void>((resolve) => {
      const stop = useApp.subscribe((s) => {
        if (!s.busy || s.id !== documentId) {
          stop();
          resolve();
        }
      });
    });
  }
  const s = useApp.getState();
  if (!s.info || s.id !== documentId) return false;
  await s.act({ type: "annotation-transform", page, id, rect });
  return useApp.getState().id === documentId && !useApp.getState().error;
}
