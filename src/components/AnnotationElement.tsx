import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Pencil, SlidersHorizontal, Trash2, Grip } from "lucide-react";
import { useApp } from "../lib/store";
import { engine } from "../lib/client";
import { metrics } from "../lib/performance";
import { IconButton } from "./ui";
import type { AnnotationInfo, Rect } from "../lib/types";
import clsx from "clsx";
import { annotationColor } from "../lib/text-editing";

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
  onEdit,
}: {
  annotation: AnnotationInfo;
  page: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
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
  const [dragging, setDragging] = useState(false);
  const frame = useRef(0);
  const gesture = useRef<{
    pointer: number;
    target: Element;
    x: number;
    y: number;
    factor: number;
    mode: "move" | "resize";
    original: Rect;
    next: Rect;
    moved: boolean;
  } | null>(null);
  const rect = a.rect;
  const place = (r: Rect) => {
    if (!root.current) return;
    Object.assign(root.current.style, {
      left: `${r[0] * scale}px`,
      top: `${r[1] * scale}px`,
      width: `${(r[2] - r[0]) * scale}px`,
      height: `${(r[3] - r[1]) * scale}px`,
    });
  };
  const cancel = () => {
    const g = gesture.current;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (g?.target.hasPointerCapture(g.pointer))
      g.target.releasePointerCapture(g.pointer);
    place(rect);
    setDragging(false);
  };
  useLayoutEffect(() => {
    place(rect);
    setDragging(false);
  }, [rect.join(","), scale]);
  useEffect(() => {
    if (!selected) return;
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
  useEffect(() => {
    if (!selected) return;
    const stop = () => cancel();
    window.addEventListener("pdfweld-navigation-start", stop);
    return () => {
      window.removeEventListener("pdfweld-navigation-start", stop);
      cancelAnimationFrame(frame.current);
      const g = gesture.current;
      gesture.current = null;
      if (g?.target.hasPointerCapture(g.pointer))
        g.target.releasePointerCapture(g.pointer);
    };
  }, [selected, rect.join(","), scale]);
  const begin = (e: ReactPointerEvent, mode: "move" | "resize") => {
    if (e.button !== 0 || e.isPrimary === false || useApp.getState().busy)
      return;
    e.preventDefault();
    e.stopPropagation();
    const pageRect = root
      .current!.closest("[data-page]")!
      .getBoundingClientRect();
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
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      pointer: e.pointerId,
      target: e.currentTarget,
      x: e.clientX,
      y: e.clientY,
      factor: pageRect.width / pageWidth,
      mode,
      original: [...rect],
      next: [...rect],
      moved: false,
    };
  };
  const move = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const started = performance.now();
    e.stopPropagation();
    const dx = (e.clientX - g.x) / g.factor,
      dy = (e.clientY - g.y) / g.factor;
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 3) return;
    if (!g.moved) {
      g.moved = true;
      setDragging(true);
    }
    const r = g.original,
      w = r[2] - r[0],
      h = r[3] - r[1];
    if (g.mode === "move") {
      const x = Math.max(0, Math.min(pageWidth - w, r[0] + dx));
      const y = Math.max(0, Math.min(pageHeight - h, r[1] + dy));
      g.next = [x, y, x + w, y + h];
    } else {
      let newWidth = Math.max(12, Math.min(pageWidth - r[0], w + dx));
      let newHeight = Math.max(12, Math.min(pageHeight - r[1], h + dy));
      if (a.type !== "FreeText") {
        const ratio = w / h;
        newWidth = Math.min(newWidth, newHeight * ratio);
        newHeight = newWidth / ratio;
      }
      g.next = [r[0], r[1], r[0] + newWidth, r[1] + newHeight];
    }
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (gesture.current === g) place(g.next);
      });
    metrics.recordInput(performance.now() - started);
  };
  const finish = async (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    // Include the final release position even when there wasn't a last move.
    move(e);
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (g.target.hasPointerCapture(g.pointer))
      g.target.releasePointerCapture(g.pointer);
    e.stopPropagation();
    if (g.moved) {
      place(g.next);
      await useApp
        .getState()
        .act({ type: "annotation-transform", page, id: a.id, rect: g.next });
      if (useApp.getState().error) place(rect);
    }
    setDragging(false);
  };
  const remove = async () => {
    await useApp.getState().act({ type: "annotation-delete", page, id: a.id });
    useApp.setState({ selectedAnnotation: null });
  };
  const label = annotationLabel(a);
  return (
    <div
      ref={root}
      data-annotation={a.id}
      role="button"
      tabIndex={0}
      aria-label={`Move ${label}`}
      aria-pressed={selected}
      className={clsx(
        "absolute min-h-6 min-w-6 touch-none select-none cursor-move outline-none focus-visible:ring-2 focus-visible:ring-lime-500",
        editing && "invisible",
        selected
          ? "z-20 border border-lime-500 ring-1 ring-lime-500/30"
          : "z-10 hover:ring-1 hover:ring-lime-500/60",
      )}
      style={{
        left: rect[0] * scale,
        top: rect[1] * scale,
        width: (rect[2] - rect[0]) * scale,
        height: (rect[3] - rect[1]) * scale,
      }}
      onPointerDown={(e) => begin(e, "move")}
      onPointerMove={move}
      onPointerUp={(e) => void finish(e)}
      onPointerCancel={cancel}
      onLostPointerCapture={() => {
        if (gesture.current) cancel();
      }}
      onDoubleClick={onEdit}
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
      {selected && (
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
          {!dragging && (
            <div
              className={clsx(
                "absolute flex w-max items-center gap-1 whitespace-nowrap rounded-lg border border-white/10 bg-studio-900 p-1 text-white shadow-panel",
                rect[1] * scale < 54 ? "top-full mt-3" : "bottom-full mb-3",
              )}
              style={{
                left: Math.max(
                  -rect[0] * scale,
                  Math.min(0, (pageWidth - rect[0]) * scale - 200),
                ),
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="px-2 text-xs text-studio-400">Drag to move</span>
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
          )}
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
  );
}
