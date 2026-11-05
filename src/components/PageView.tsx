import { memo, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { engine } from "../lib/client";
import { useApp, ask, startSignature } from "../lib/store";
import { renderQueue } from "../lib/render-queue";
import { useVisible } from "../hooks/use-visible";
import { metrics } from "../lib/performance";
import type {
  Mark,
  PageDetails,
  Point,
  Rect,
  RenderResult,
} from "../lib/types";
import clsx from "clsx";
import { AnnotationElement } from "./AnnotationElement";
import { InlineTextEditor } from "./InlineTextEditor";
import { editText } from "../lib/text-editing";
import { TextSelection } from "./TextSelection";
import { isTextMarkup } from "../lib/text-markup";
const paint = (canvas: HTMLCanvasElement, result: RenderResult) => {
  canvas.width = result.width;
  canvas.height = result.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (result.bitmap) ctx?.drawImage(result.bitmap, 0, 0);
  else
    ctx?.putImageData(
      new ImageData(result.pixels, result.width, result.height),
      0,
      0,
    );
};
export const Thumbnail = memo(function Thumbnail({
  page,
  width = 120,
}: {
  page: number;
  width?: number;
}) {
  const info = useApp((s) => s.info),
    revision = useApp((s) => s.revision);
  const { ref, visible } = useVisible("150px");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const p = info?.pages[page];
  useEffect(() => {
    let cancelled = false;
    if (visible && p) {
      renderQueue
        .render(page, width / p.width, undefined, 0)
        .then((r) => {
          if (!cancelled && canvas.current) {
            paint(canvas.current, r);
            setReady(true);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [page, width, visible, revision, p]);
  if (!p) return null;
  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden bg-white shadow-paper"
      style={{ aspectRatio: `${p.width}/${p.height}` }}
    >
      <canvas ref={canvas} width={1} height={1} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-100">
          <LoaderCircle className="animate-spin text-stone-300" size={18} />
        </div>
      )}
    </div>
  );
});
function Tile({
  page,
  scale,
  clip,
  cssScale,
}: {
  page: number;
  scale: number;
  clip: Rect;
  cssScale: number;
}) {
  const { ref, visible } = useVisible("150px");
  const canvas = useRef<HTMLCanvasElement>(null);
  const revision = useApp((s) => s.revision);
  useEffect(() => {
    let cancelled = false;
    if (visible)
      renderQueue
        .render(page, scale, clip, 20)
        .then((r) => {
          if (!cancelled && canvas.current) paint(canvas.current, r);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, page, scale, revision, clip.join(",")]);
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute"
      style={{
        left: clip[0] * cssScale,
        top: clip[1] * cssScale,
        width: (clip[2] - clip[0]) * cssScale,
        height: (clip[3] - clip[1]) * cssScale,
      }}
    >
      <canvas ref={canvas} width={1} height={1} className="h-full w-full" />
    </div>
  );
}
export const PageView = memo(function PageView({
  page,
  scale,
}: {
  page: number;
  scale: number;
}) {
  const info = useApp((s) => s.info),
    revision = useApp((s) => s.revision),
    tool = useApp((s) => s.tool);
  const p = info!.pages[page];
  const { ref, visible } = useVisible("300px");
  const canvas = useRef<HTMLCanvasElement>(null),
    ink = useRef<HTMLCanvasElement>(null);
  const [details, setDetails] = useState<PageDetails | null>(null),
    [searchQuads, setSearchQuads] = useState<number[][]>([]),
    [ready, setReady] = useState(false);
  const [renderedRevision, setRenderedRevision] = useState(-1);
  const liveFrame = useRef(0),
    drawn = useRef(0);
  const stroke = useRef<{
    points: Point[];
    pointer: number;
    start: Point;
    tool: typeof tool;
  } | null>(null);
  const width = p.width * scale,
    height = p.height * scale;
  const dpr = Math.min(devicePixelRatio || 1, 4);
  const renderScale = Math.min(
    scale * dpr,
    Math.sqrt(2_500_000 / (p.width * p.height)),
  );
  const tiled = scale * dpr > renderScale * 1.15;
  useEffect(() => {
    let cancelled = false;
    if (visible) {
      Promise.all([
        renderQueue.render(page, renderScale, undefined, 10),
        engine.call("details", page),
      ])
        .then(([r, nextDetails]) => {
          if (!cancelled && canvas.current) {
            paint(canvas.current, r);
            setDetails(nextDetails);
            setRenderedRevision(revision);
            setReady(true);
          }
        })
        .catch((e) => {
          if (e.message !== "STALE_RENDER") useApp.getState().fail(e);
        });
    } else {
      if (canvas.current) {
        canvas.current.width = 1;
        canvas.current.height = 1;
      }
      setReady(false);
      setDetails(null);
    }
    return () => {
      cancelled = true;
    };
  }, [page, visible, revision, renderScale]);
  useEffect(() => {
    if (!ink.current) return;
    const c = ink.current;
    // Live strokes remain vector coordinates. Bound the temporary preview
    // bitmap even at 500% zoom; the committed PDF is rendered sharply in tiles.
    const previewScale = Math.min(dpr, Math.sqrt(2_500_000 / (width * height)));
    c.width = Math.ceil(width * previewScale);
    c.height = Math.ceil(height * previewScale);
  }, [width, height, dpr, tool, visible]);
  useEffect(() => {
    const cancelStroke = () => {
      stroke.current = null;
      cancelAnimationFrame(liveFrame.current);
      liveFrame.current = 0;
      const canvas = ink.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener("pdfweld-navigation-start", cancelStroke);
    return () =>
      window.removeEventListener("pdfweld-navigation-start", cancelStroke);
  }, []);
  useEffect(() => {
    const listener = (event: Event) => {
      const hit = (event as CustomEvent).detail;
      if (hit.page === page) setSearchQuads(hit.quads);
      else setSearchQuads([]);
    };
    window.addEventListener("pdfweld-search-hit", listener);
    return () => window.removeEventListener("pdfweld-search-hit", listener);
  }, [page]);
  const editAnnotation = async (id: number) => {
    const a = details?.annotations.find((a) => a.id === id);
    if (!a) return;
    if (a.type === "FreeText") {
      editText(page, a);
      return;
    }
    if (a.type === "Text") {
      const answer = await ask({
        title: "Edit comment",
        fields: [
          { key: "text", label: "Comment", value: a.text, type: "textarea" },
        ],
        submit: "Save comment",
      });
      if (answer)
        await useApp
          .getState()
          .act({ type: "annotation-edit", page, id, text: answer.text });
      return;
    }
    useApp.setState({ selectedAnnotation: { page, id }, appearanceOpen: true });
  };
  const position = (e: React.PointerEvent): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * p.width,
      ((e.clientY - r.top) / r.height) * p.height,
    ];
  };
  const live = (points: Point[], kind: string) => {
    const c = ink.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const s = useApp.getState();
    if (!["ink", "signature"].includes(kind))
      ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.scale(c.width / p.width, c.height / p.height);
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = s.opacity;
    const [start, end] = [points[0], points[points.length - 1]];
    if (kind === "ink" || kind === "signature") {
      ctx.beginPath();
      ctx.moveTo(...points[Math.max(0, drawn.current - 1)]);
      for (let i = Math.max(1, drawn.current); i < points.length; i++)
        ctx.lineTo(...points[i]);
      ctx.stroke();
      drawn.current = points.length;
    } else if (kind === "line" || kind === "arrow") {
      ctx.beginPath();
      ctx.moveTo(...start);
      ctx.lineTo(...end);
      ctx.stroke();
    } else if (kind === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2,
        Math.abs(end[0] - start[0]) / 2,
        Math.abs(end[1] - start[1]) / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    } else {
      const r = [
        Math.min(start[0], end[0]),
        Math.min(start[1], end[1]),
        Math.abs(end[0] - start[0]),
        Math.abs(end[1] - start[1]),
      ];
      if (kind === "redact") {
        ctx.fillStyle = "#000";
        ctx.globalAlpha = 0.5;
        ctx.fillRect(r[0], r[1], r[2], r[3]);
      } else ctx.strokeRect(r[0], r[1], r[2], r[3]);
    }
    ctx.restore();
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      e.button !== 0 ||
      e.isPrimary === false ||
      isTextMarkup(tool) ||
      useApp.getState().busy ||
      useApp.getState().textDraft
    )
      return;
    const started = performance.now();
    const point = position(e);
    if (tool === "signature" && !useApp.getState().signatureGroup)
      startSignature();
    useApp.setState({ page });
    if (tool === "eraser") {
      const a = details?.annotations
        .slice()
        .reverse()
        .find(
          (a) =>
            point[0] >= a.rect[0] - 4 &&
            point[0] <= a.rect[2] + 4 &&
            point[1] >= a.rect[1] - 4 &&
            point[1] <= a.rect[3] + 4,
        );
      if (a)
        void useApp
          .getState()
          .act({ type: "annotation-delete", page, id: a.id });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawn.current = 0;
    stroke.current = {
      points: [point],
      pointer: e.pointerId,
      start: point,
      tool,
    };
    metrics.recordInput(performance.now() - started);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const started = performance.now();
    const current = stroke.current;
    if (!current || current.pointer !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent];
    const r = e.currentTarget.getBoundingClientRect();
    for (const event of events) {
      current.points.push([
        ((event.clientX - r.left) / r.width) * p.width,
        ((event.clientY - r.top) / r.height) * p.height,
      ]);
    }
    if (!liveFrame.current)
      liveFrame.current = requestAnimationFrame(() => {
        liveFrame.current = 0;
        if (stroke.current === current) live(current.points, current.tool);
      });
    metrics.recordInput(performance.now() - started);
  };
  const up = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    const current = stroke.current;
    if (!current || current.pointer !== e.pointerId) return;
    cancelAnimationFrame(liveFrame.current);
    liveFrame.current = 0;
    live(current.points, current.tool);
    stroke.current = null;
    const end = position(e),
      start = current.start;
    let rect: Rect = [
      Math.max(0, Math.min(start[0], end[0])),
      Math.max(0, Math.min(start[1], end[1])),
      Math.min(p.width, Math.max(start[0], end[0])),
      Math.min(p.height, Math.max(start[1], end[1])),
    ];
    const s = useApp.getState();
    const kind = current.tool;
    let text = kind === "image" ? s.imageLabel : "";
    const clear = () => {
      // A previous stroke may finish saving after the next one has started.
      // Its completion must never erase the current pen preview.
      if (stroke.current) return;
      const c = ink.current;
      c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    };
    if (["text", "note", "stamp", "link", "replace", "field"].includes(kind)) {
      if (kind === "replace") {
        const line = details?.lines.find(
          (l) =>
            start[0] >= l.rect[0] - 3 &&
            start[0] <= l.rect[2] + 3 &&
            start[1] >= l.rect[1] - 3 &&
            start[1] <= l.rect[3] + 3,
        );
        if (!line) {
          clear();
          s.notify("Tap a line of existing text to replace it.");
          return;
        }
        rect = line.rect;
        text = line.text;
      }
      if (kind === "text" || kind === "replace") {
        const fixedSize =
          kind === "replace" ||
          (rect[2] - rect[0] >= 8 && rect[3] - rect[1] >= 8);
        if (
          kind === "text" &&
          (rect[2] - rect[0] < 8 || rect[3] - rect[1] < 8)
        ) {
          const x = Math.max(0, Math.min(p.width - 100, start[0]));
          const y = Math.max(0, Math.min(p.height - 60, start[1]));
          rect = [x, y, Math.min(p.width, x + 300), Math.min(p.height, y + 72)];
        }
        const fontSize =
          kind === "replace"
            ? details?.lines.find((l) => l.rect === rect)?.size || s.textSize
            : s.textSize;
        useApp.setState({
          textDraft: {
            page,
            rect,
            text,
            kind,
            color: s.color,
            fontSize,
            fontFamily: s.fontFamily,
            opacity: s.opacity,
            replaceRect: kind === "replace" ? [...rect] : undefined,
            fixedSize,
          },
          selectedAnnotation: null,
        });
        clear();
        return;
      }
      const result = await ask({
        title:
          kind === "link"
            ? "Add web link"
            : kind === "field"
              ? "Add text field"
              : kind === "stamp"
                ? "Choose a stamp"
                : "Leave a comment",
        fields: [
          {
            key: "text",
            label:
              kind === "link"
                ? "Web address"
                : kind === "field"
                  ? "Field name"
                  : "Text",
            value:
              kind === "link"
                ? "https://"
                : kind === "stamp"
                  ? "Approved"
                  : text,
            type: kind === "note" ? "textarea" : undefined,
            options:
              kind === "stamp"
                ? [
                    "Approved",
                    "Draft",
                    "Confidential",
                    "Final",
                    "NotApproved",
                    "ForComment",
                  ]
                : undefined,
            required: true,
          },
        ],
        submit: "Add",
      });
      if (!result) {
        clear();
        return;
      }
      text = result.text;
    }
    if (rect[2] - rect[0] < 8 || rect[3] - rect[1] < 8) {
      const w =
        kind === "note"
          ? 24
          : kind === "image"
            ? 180
            : kind === "stamp"
              ? 150
              : kind === "field"
                ? 180
                : 200;
      const h =
        kind === "note"
          ? 24
          : kind === "image"
            ? 180 / s.imageAspectRatio
            : kind === "stamp"
              ? 60
              : kind === "field"
                ? 30
                : 60;
      rect = [
        start[0],
        start[1],
        Math.min(p.width, start[0] + w),
        Math.min(p.height, start[1] + h),
      ];
    }
    if (kind === "image") {
      const w = rect[2] - rect[0],
        h = rect[3] - rect[1];
      const fittedWidth = Math.min(w, h * s.imageAspectRatio);
      rect = [
        rect[0],
        rect[1],
        rect[0] + fittedWidth,
        rect[1] + fittedWidth / s.imageAspectRatio,
      ];
    }
    if (
      ["rectangle", "ellipse", "crop", "redact"].includes(kind) &&
      Math.abs(end[0] - start[0]) + Math.abs(end[1] - start[1]) < 5
    ) {
      clear();
      s.notify("Drag to define an area on the page.");
      return;
    }
    const mark: Mark = {
      tool: kind,
      signatureGroup:
        kind === "signature" ? s.signatureGroup || undefined : undefined,
      page,
      rect,
      points:
        current.points.length > 1
          ? current.points
          : [start, [start[0] + 0.1, start[1] + 0.1]],
      text,
      color: s.color,
      width:
        kind === "replace"
          ? s.textSize
          : kind === "text"
            ? s.textSize
            : kind === "signature"
              ? Math.max(1.5, s.width)
              : s.width,
      opacity: kind === "highlight" ? 0.45 : s.opacity,
      author: s.author,
      image: kind === "image" ? s.image || undefined : undefined,
    };
    await s.mark(mark);
    clear();
    if (
      ["text", "image"].includes(kind) &&
      useApp.getState().revision !== s.revision
    ) {
      const latest = await engine.call("details", page);
      const added = latest.annotations[latest.annotations.length - 1];
      if (added)
        useApp.setState({
          tool: "select",
          selectedAnnotation: { page, id: added.id },
        });
    }
  };
  const tiles: Rect[] = [];
  if (tiled && visible) {
    const step = 768 / (scale * dpr);
    for (let y = 0; y < p.height; y += step)
      for (let x = 0; x < p.width; x += step)
        tiles.push([
          x,
          y,
          Math.min(p.width, x + step),
          Math.min(p.height, y + step),
        ]);
  }
  return (
    <div
      ref={ref}
      data-page={page}
      className="relative shrink-0 bg-white shadow-paper"
      style={{ width, height }}
      onPointerDown={(event) => {
        if (useApp.getState().page !== page) useApp.setState({ page });
        if (!(event.target as Element).closest("[data-annotation]"))
          useApp.setState({ selectedAnnotation: null });
      }}
    >
      <canvas
        ref={canvas}
        width={1}
        height={1}
        aria-label={`PDF page ${page + 1}`}
        className="pointer-events-none h-full w-full"
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f8f7f2]">
          <LoaderCircle size={24} className="animate-spin text-stone-300" />
        </div>
      )}
      {tiles.map((clip) => (
        <Tile
          key={clip.join(",")}
          page={page}
          scale={scale * dpr}
          cssScale={scale}
          clip={clip}
        />
      ))}
      {details && (tool === "select" || isTextMarkup(tool)) && (
        <TextSelection
          page={page}
          lines={details.lines}
          tool={tool}
          scale={scale}
        />
      )}
      {details && tool === "select" && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          viewBox={`0 0 ${p.width} ${p.height}`}
        >
          {tool === "select" &&
            details.links.map((link, i) => (
              <a
                key={i}
                className="pointer-events-auto"
                href={/^https?:\/\//i.test(link.uri) ? link.uri : undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (link.uri.startsWith("#page=")) {
                    e.preventDefault();
                    const n = parseInt(link.uri.slice(6)) - 1;
                    document
                      .querySelector(`[data-page="${n}"]`)
                      ?.scrollIntoView({ block: "start", behavior: "smooth" });
                  }
                }}
              >
                <rect
                  x={link.rect[0]}
                  y={link.rect[1]}
                  width={link.rect[2] - link.rect[0]}
                  height={link.rect[3] - link.rect[1]}
                  fill="transparent"
                  className="cursor-pointer hover:fill-blue-400/10"
                />
              </a>
            ))}
          {/* Widget appearances are already in the PDF raster. Paint the HTML
              value only while focused, against an opaque input background. */}
          {tool === "select" &&
            details.fields.map((f) => (
              <foreignObject
                className="pointer-events-auto"
                key={`${f.id}-${f.value}`}
                x={f.rect[0]}
                y={f.rect[1]}
                width={f.rect[2] - f.rect[0]}
                height={f.rect[3] - f.rect[1]}
              >
                <div className="flex h-full w-full items-center">
                  <input
                    aria-label={f.label || f.name}
                    type={/check|radio/i.test(f.type) ? "checkbox" : "text"}
                    defaultValue={f.value}
                    defaultChecked={f.value !== "Off" && f.value !== ""}
                    disabled={f.readOnly}
                    className={clsx(
                      "h-full w-full border border-blue-400/30 bg-blue-300/10 px-1 text-base outline-none focus:bg-blue-100",
                      /check|radio/i.test(f.type)
                        ? "accent-lime-500 text-black"
                        : "text-transparent caret-black focus:text-black",
                    )}
                    onBlur={(e) => {
                      if (
                        !/check|radio/i.test(f.type) &&
                        e.target.value !== f.value
                      )
                        void sFill(page, f.id, e.target.value);
                    }}
                    onChange={(e) => {
                      if (/check|radio/i.test(f.type))
                        void sFill(
                          page,
                          f.id,
                          e.target.checked ? "Yes" : "Off",
                        );
                    }}
                  />
                </div>
              </foreignObject>
            ))}
        </svg>
      )}
      {details &&
        ["select", "text"].includes(tool) &&
        info?.permissions.annotate &&
        details.annotations
          .filter(
            (a) =>
              !a.replyTo &&
              a.type !== "Popup" &&
              (tool !== "text" || a.type === "FreeText"),
          )
          .map((a) => (
            <AnnotationElement
              key={a.id}
              annotation={a}
              page={page}
              scale={scale}
              pageWidth={p.width}
              pageHeight={p.height}
              renderedRevision={renderedRevision}
              onEdit={() => void editAnnotation(a.id)}
            />
          ))}
      <InlineTextEditor
        page={page}
        scale={scale}
        pageHeight={p.height}
        pageWidth={p.width}
      />
      {!!searchQuads.length && (
        <svg
          viewBox={`0 0 ${p.width} ${p.height}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {searchQuads.map((q, i) => (
            <polygon
              key={i}
              points={`${q[0]},${q[1]} ${q[2]},${q[3]} ${q[6]},${q[7]} ${q[4]},${q[5]}`}
              className="fill-yellow-300/40 stroke-yellow-500/60"
              strokeWidth={1}
            />
          ))}
        </svg>
      )}
      {visible && !["select", "hand"].includes(tool) && !isTextMarkup(tool) && (
        <canvas
          ref={ink}
          className={clsx(
            "absolute inset-0 h-full w-full touch-none",
            tool === "eraser"
              ? "cursor-cell"
              : tool === "replace"
                ? "cursor-text"
                : "cursor-crosshair",
          )}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={(e) => void up(e)}
          onPointerCancel={() => {
            stroke.current = null;
            const c = ink.current;
            c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
          }}
        />
      )}
    </div>
  );
});
const sFill = (page: number, field: number, value: string) =>
  useApp.getState().act({ type: "fill", page, field, value });
