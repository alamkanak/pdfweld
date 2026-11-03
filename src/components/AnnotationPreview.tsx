import { useEffect, useRef } from "react";
import { engine } from "../lib/client";
import { useApp } from "../lib/store";
import { loadEditorFont } from "../lib/editor-font";
import { annotationColor } from "../lib/text-editing";
import type { AnnotationInfo } from "../lib/types";

export function TextPreview({
  annotation,
  scale,
}: {
  annotation: AnnotationInfo;
  scale: number;
}) {
  useEffect(() => {
    void loadEditorFont().catch((error) => useApp.getState().fail(error));
  }, []);
  return (
    <div
      data-text-preview
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]"
      style={{
        fontFamily: "Arial, 'Noto Sans Bengali', sans-serif",
        fontSize: (annotation.fontSize || 18) * scale,
        lineHeight: 1.2,
        color: annotationColor(annotation),
        opacity: annotation.opacity ?? 1,
      }}
    >
      {annotation.text}
    </div>
  );
}

/** Repaint the old location without this annotation, preserving images and
 * other marks beneath it. No changes are made to the PDF or undo journal. */
export function AnnotationBackground({
  annotation,
  page,
  scale,
  show,
}: {
  annotation: AnnotationInfo;
  page: number;
  scale: number;
  show: boolean;
}) {
  const revision = useApp((s) => s.revision);
  const canvas = useRef<HTMLCanvasElement>(null);
  const r = annotation.rect;
  useEffect(() => {
    let active = true;
    const renderScale = Math.min(
      scale * Math.min(devicePixelRatio || 1, 4),
      Math.sqrt(2_500_000 / Math.max(1, (r[2] - r[0]) * (r[3] - r[1]))),
    );
    engine
      .call("render", page, renderScale, r, annotation.id)
      .then((result) => {
        if (active && canvas.current) {
          canvas.current.width = result.width;
          canvas.current.height = result.height;
          const ctx = canvas.current.getContext("2d")!;
          if (result.bitmap) ctx.drawImage(result.bitmap, 0, 0);
          else
            ctx.putImageData(
              new ImageData(result.pixels, result.width, result.height),
              0,
              0,
            );
        }
        result.bitmap?.close();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [page, annotation.id, r.join(","), scale, revision]);
  return (
    <canvas
      ref={canvas}
      width={1}
      height={1}
      aria-hidden="true"
      className={`pointer-events-none absolute z-10 ${show ? "" : "invisible"}`}
      style={{
        left: r[0] * scale,
        top: r[1] * scale,
        width: (r[2] - r[0]) * scale,
        height: (r[3] - r[1]) * scale,
      }}
    />
  );
}
