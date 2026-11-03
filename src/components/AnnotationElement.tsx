import { useEffect, useRef } from "react";
import {
  Pencil,
  SlidersHorizontal,
  Trash2,
  Grip,
  Move,
  Type,
} from "lucide-react";
import { useApp } from "../lib/store";
import { engine } from "../lib/client";
import { IconButton } from "./ui";
import type { AnnotationInfo } from "../lib/types";
import clsx from "clsx";
import { annotationColor } from "../lib/text-editing";
import { useElementGesture } from "../hooks/use-element-gesture";
import { transformAnnotation } from "../lib/annotation-operations";
import { AnnotationBackground, TextPreview } from "./AnnotationPreview";
import { loadEditorFont } from "../lib/editor-font";

export function annotationLabel(a: AnnotationInfo) {
  return a.type === "FreeText"
    ? "text"
    : a.type === "Ink"
      ? "drawn signature or ink"
      : a.text === "Signature"
        ? "signature"
        : "image or stamp";
}

/** A single compositor preview during a gesture; one PDF operation on release. */
export function AnnotationElement({
  annotation: a,
  page,
  scale,
  pageWidth,
  pageHeight,
  renderedRevision,
  onEdit,
}: {
  annotation: AnnotationInfo;
  page: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  renderedRevision: number;
  onEdit: () => void;
}) {
  const selected = useApp(
    (s) =>
      s.selectedAnnotation?.page === page && s.selectedAnnotation.id === a.id,
  );
  const revision = useApp((s) => s.revision);
  const editing = useApp(
    (s) => s.textDraft?.page === page && s.textDraft.id === a.id,
  );
  const root = useRef<HTMLDivElement>(null),
    preview = useRef<HTMLCanvasElement>(null);
  const documentId = useApp((s) => s.id);
  const rect = a.rect;
  const { begin, phase, cancel, canEdit } = useElementGesture({
    root,
    rect,
    scale,
    pageWidth,
    pageHeight,
    preserveAspect: a.type !== "FreeText",
    renderedRevision,
    onStart: () => {
      useApp.setState({
        selectedAnnotation: { page, id: a.id },
        page,
        color: annotationColor(a),
        opacity: a.opacity ?? 1,
        ...(a.type === "FreeText"
          ? { textSize: a.fontSize || 18 }
          : { width: a.width || 2.5 }),
      });
      root.current?.focus({ preventScroll: true });
    },
    onCommit: async (rect) => {
      const ok = await transformAnnotation(documentId, page, a.id, rect);
      return ok ? useApp.getState().revision : false;
    },
  });
  const dragging = phase !== null;
  useEffect(() => {
    if (selected && a.type === "FreeText") {
      void loadEditorFont().catch((error) => useApp.getState().fail(error));
      return;
    }
    if (!selected || a.type === "FreeText") return;
    let cancelled = false;
    engine
      .call(
        "renderAnnotation",
        page,
        a.id,
        scale * Math.min(devicePixelRatio || 1, 4),
      )
      .then((r) => {
        if (cancelled || !preview.current) return;
        preview.current.width = r.width;
        preview.current.height = r.height;
        preview.current
          .getContext("2d")
          ?.putImageData(new ImageData(r.pixels, r.width, r.height), 0, 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected, page, a.id, scale, revision]);
  const remove = async () => {
    await useApp.getState().act({ type: "annotation-delete", page, id: a.id });
    useApp.setState({ selectedAnnotation: null });
  };
  const label = annotationLabel(a);
  return (
    <>
      {(selected || editing || dragging) && (
        <AnnotationBackground
          annotation={a}
          page={page}
          scale={scale}
          show={editing || dragging}
        />
      )}
      <div
        ref={root}
        data-annotation={a.id}
        role="button"
        tabIndex={0}
        aria-label={`Move ${label}`}
        aria-pressed={selected}
        className={clsx(
          "absolute touch-none select-none cursor-move outline-none focus-visible:ring-2 focus-visible:ring-lime-500",
          editing && "invisible",
          selected
            ? "z-20 outline outline-1 outline-lime-500 ring-1 ring-lime-500/30"
            : "z-10 hover:ring-1 hover:ring-lime-500/60",
        )}
        style={{
          left: rect[0] * scale,
          top: rect[1] * scale,
          width: (rect[2] - rect[0]) * scale,
          height: (rect[3] - rect[1]) * scale,
        }}
        onPointerDown={(e) => begin(e, "move")}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={() => {
          if (canEdit() && !useApp.getState().busy) onEdit();
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            e.stopPropagation();
            const step = e.shiftKey ? 10 : 1,
              w = rect[2] - rect[0],
              h = rect[3] - rect[1];
            const x = Math.max(
              0,
              Math.min(
                pageWidth - w,
                rect[0] +
                  (e.key === "ArrowRight"
                    ? step
                    : e.key === "ArrowLeft"
                      ? -step
                      : 0),
              ),
            );
            const y = Math.max(
              0,
              Math.min(
                pageHeight - h,
                rect[1] +
                  (e.key === "ArrowDown"
                    ? step
                    : e.key === "ArrowUp"
                      ? -step
                      : 0),
              ),
            );
            void useApp.getState().act({
              type: "annotation-transform",
              page,
              id: a.id,
              rect: [x, y, x + w, y + h],
            });
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            useApp.setState({ selectedAnnotation: { page, id: a.id } });
            if (e.key === "Enter") onEdit();
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            e.stopPropagation();
            void remove();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            cancel();
            useApp.setState({ selectedAnnotation: null });
          }
        }}
      >
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-full min-h-6 w-full min-w-6 -translate-x-1/2 -translate-y-1/2"
        />
        {dragging && a.type === "FreeText" && (
          <TextPreview annotation={a} scale={scale} />
        )}
        {(selected || dragging) && a.type !== "FreeText" && (
          <canvas
            ref={preview}
            aria-hidden="true"
            width={1}
            height={1}
            className={clsx(
              "pointer-events-none absolute inset-0 h-full w-full",
              dragging ? "opacity-90" : "opacity-0",
            )}
          />
        )}
        {selected && (
          <>
            <span className="pointer-events-none absolute -left-1 -top-1 h-2 w-2 rounded-lg border border-lime-600 bg-white" />
            <div
              className={clsx(
                "absolute flex w-max items-center gap-1 whitespace-nowrap rounded-lg border border-white/10 bg-studio-900 p-1 text-white shadow-panel",
                dragging && "pointer-events-none opacity-0",
                rect[1] * scale < 54 ? "top-full mt-3" : "bottom-full mb-3",
              )}
              style={{
                left: Math.max(
                  -rect[0] * scale,
                  Math.min(0, (pageWidth - rect[0]) * scale - 260),
                ),
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label={`Drag ${label}`}
                className="flex h-10 touch-none cursor-move items-center gap-2 rounded-lg px-2 text-xs text-studio-400 hover:bg-white/5 focus-visible:outline focus-visible:outline-lime-300"
                onPointerDown={(event) => begin(event, "move")}
              >
                <Move size={15} />
                Drag to move
              </button>
              {a.type === "FreeText" && (
                <IconButton
                  label="Text size and color"
                  onClick={() => useApp.setState({ appearanceOpen: true })}
                >
                  <Type size={16} />
                </IconButton>
              )}
              <IconButton
                label={
                  a.type === "FreeText" ? `Edit ${label}` : `Style ${label}`
                }
                onClick={onEdit}
              >
                {a.type === "FreeText" ? (
                  <Pencil size={15} />
                ) : (
                  <SlidersHorizontal size={15} />
                )}
              </IconButton>
              <IconButton
                label={`Delete ${label}`}
                onClick={() => void remove()}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
            <button
              type="button"
              aria-label={`Resize ${label}`}
              title="Drag to resize"
              className="absolute -bottom-3 -right-3 flex h-7 w-7 touch-none cursor-nwse-resize items-center justify-center rounded-lg border border-lime-600 bg-lime-400 text-studio-950 shadow-sm"
              onPointerDown={(e) => begin(e, "resize")}
            >
              <Grip size={14} />
            </button>
          </>
        )}
      </div>
    </>
  );
}
