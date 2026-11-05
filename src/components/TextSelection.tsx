import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Highlighter, Underline, Strikethrough } from "lucide-react";
import { Button } from "./ui";
import { useApp } from "../lib/store";
import { metrics } from "../lib/performance";
import { isTextMarkup, validTextQuad } from "../lib/text-markup";
import type { Mark, Rect, TextLine, Tool } from "../lib/types";

const layers = new WeakMap<HTMLElement, { page: number; lines: TextLine[] }>();

// Native selection paints without rebuilding the glyph layer on each frame.
const SelectableGlyphs = memo(function SelectableGlyphs({
  root,
  page,
  lines,
  scale: factor,
}: {
  root: RefObject<HTMLDivElement | null>;
  page: number;
  lines: TextLine[];
  scale: number;
}) {
  useLayoutEffect(() => {
    const elements = Array.from(
      root.current?.querySelectorAll<HTMLElement>("[data-text-char]") || [],
    );
    const position = () => {
      for (const element of elements) element.style.left = "0px";
      const offsets = elements.map((element) => element.offsetLeft);
      elements.forEach((element, index) => {
        element.style.left = `${Number(element.dataset.textX) * factor - offsets[index]}px`;
      });
    };
    position();
    const observer = new ResizeObserver(position);
    root.current
      ?.querySelectorAll<HTMLElement>("[data-text-line]")
      .forEach((line) => observer.observe(line));
    return () => observer.disconnect();
  }, [lines, factor]);
  return (
    <div
      ref={root}
      data-text-selection={page}
      className="absolute inset-0 cursor-text select-text text-transparent"
    >
      {lines.map((line, index) => {
        const first = line.chars[0],
          q = first.quad;
        const dx = q[2] - q[0],
          dy = q[3] - q[1],
          length = Math.hypot(dx, dy) || 1;
        const ux = dx / length,
          uy = dy / length;
        const origin = first.origin || [q[0], q[1]];
        return (
          <div
            key={index}
            data-text-line={index}
            dir="auto"
            className="absolute origin-top-left whitespace-pre"
            style={{
              left: q[0] * factor,
              top: q[1] * factor,
              lineHeight: `${Math.hypot(q[4] - q[0], q[5] - q[1]) * factor}px`,
              fontSize: line.size * factor,
              fontFamily: "Arial, 'Noto Sans Bengali', sans-serif",
              transform: `rotate(${Math.atan2(dy, dx)}rad)`,
            }}
          >
            {line.chars.map((char, i) => {
              const at = char.origin || [char.quad[0], char.quad[1]];
              return (
                <span
                  key={i}
                  data-text-char={i}
                  data-text-x={
                    (at[0] - origin[0]) * ux + (at[1] - origin[1]) * uy
                  }
                  className="relative"
                  style={{
                    fontSize: char.size * factor,
                    top:
                      ((at[1] - origin[1]) * ux - (at[0] - origin[0]) * uy) *
                      factor,
                  }}
                >
                  {char.text}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
});

/** Read native selection offsets, then use PDF glyph quads rather than a
 * browser bounding rectangle (which includes unselected lines/whitespace). */
function selectedText(range: Range) {
  const selections: {
    page: number;
    text: string;
    quads: number[][];
    rect: Rect;
  }[] = [];
  for (const group of document.querySelectorAll<HTMLElement>(
    "[data-text-selection]",
  )) {
    const layer = layers.get(group);
    if (!layer || !range.intersectsNode(group)) continue;
    const quads: number[][] = [],
      text: string[] = [];
    for (const element of group.querySelectorAll<HTMLElement>(
      "[data-text-line]",
    )) {
      if (!range.intersectsNode(element)) continue;
      const line = layer.lines[Number(element.dataset.textLine)];
      const offset = (node: Node, position: number, fallback: number) => {
        if (!element.contains(node)) return fallback;
        const prefix = document.createRange();
        prefix.selectNodeContents(element);
        prefix.setEnd(node, position);
        return prefix.toString().length;
      };
      const start = offset(range.startContainer, range.startOffset, 0);
      const end = offset(range.endContainer, range.endOffset, line.text.length);
      let index = 0,
        content = "";
      for (const char of line.chars) {
        const next = index + char.text.length;
        if (next > start && index < end) {
          content += char.text;
          if (validTextQuad(char.quad)) quads.push(char.quad);
        }
        index = next;
      }
      if (content) text.push(content);
    }
    if (!quads.length || !text.join("").trim()) continue;
    const rect: Rect = [Infinity, Infinity, -Infinity, -Infinity];
    for (const quad of quads)
      for (let i = 0; i < 8; i += 2) {
        rect[0] = Math.min(rect[0], quad[i]);
        rect[1] = Math.min(rect[1], quad[i + 1]);
        rect[2] = Math.max(rect[2], quad[i]);
        rect[3] = Math.max(rect[3], quad[i + 1]);
      }
    selections.push({
      page: layer.page,
      text: text.join("\n"),
      quads,
      rect,
    });
  }
  return selections;
}

export function TextSelection({
  page,
  lines,
  tool,
  scale,
}: {
  page: number;
  lines: TextLine[];
  tool: Tool;
  scale: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef({ tool });
  latest.current = { tool };
  const busy = useApp((s) => !!s.busy);
  const allowed = useApp((s) => !!s.info?.permissions.annotate);
  const [selection, setSelection] = useState<{
    rect: Rect;
    key: string;
  } | null>(null);
  const applying = useRef(false);
  const previousTool = useRef(tool);
  const apply = async () => {
    const s = useApp.getState(),
      native = window.getSelection();
    if (
      !s.info ||
      !s.info.permissions.annotate ||
      s.busy ||
      applying.current ||
      !native?.rangeCount ||
      native.isCollapsed
    )
      return;
    const marks = selectedText(native.getRangeAt(0));
    if (!marks.length) return;
    const kind = isTextMarkup(latest.current.tool)
      ? latest.current.tool
      : "highlight";
    applying.current = true;
    native.removeAllRanges();
    setSelection(null);
    try {
      for (const selected of marks) {
        if (useApp.getState().id !== s.id) break;
        const mark: Mark = {
          ...selected,
          tool: kind,
          color: s.color,
          opacity: kind === "highlight" ? 0.45 : s.opacity,
          width: s.width,
          author: s.author,
        };
        await useApp.getState().mark(mark);
      }
    } finally {
      applying.current = false;
    }
  };
  const applyLatest = useRef(apply);
  applyLatest.current = apply;
  useEffect(() => {
    if (
      previousTool.current !== tool &&
      isTextMarkup(tool) &&
      root.current?.contains(window.getSelection()?.focusNode || null)
    )
      void applyLatest.current();
    previousTool.current = tool;
  }, [tool]);
  useEffect(() => {
    const group = root.current;
    if (!group) return;
    layers.set(group, { page, lines });
    let frame = 0,
      finishFrame = 0;
    let pointer: {
      id: number;
      x: number;
      y: number;
      moved: boolean;
      touch: boolean;
    } | null = null;
    const update = () => {
      frame = 0;
      const native = window.getSelection();
      if (
        (pointer && !pointer.touch) ||
        !native?.rangeCount ||
        native.isCollapsed ||
        !group.contains(native.focusNode)
      ) {
        setSelection(null);
        return;
      }
      const started = performance.now();
      const part = selectedText(native.getRangeAt(0)).find(
        (item) => item.page === page,
      );
      if (!part) {
        setSelection(null);
        return;
      }
      const key = `${part.rect.join(",")}:${part.text}`;
      setSelection((previous) =>
        previous?.key === key ? previous : { rect: part.rect, key },
      );
      metrics.recordInput(performance.now() - started);
    };
    const change = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !isTextMarkup(latest.current.tool)) return;
      pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        touch: event.pointerType === "touch",
      };
    };
    const move = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const started = performance.now();
      pointer.moved ||=
        Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= 3;
      metrics.recordInput(performance.now() - started);
    };
    const up = (event: PointerEvent) => {
      if (pointer?.id !== event.pointerId) return;
      const commit = pointer.moved && !pointer.touch;
      pointer = null;
      if (commit) {
        const documentId = useApp.getState().id,
          activeTool = latest.current.tool;
        finishFrame = requestAnimationFrame(() => {
          finishFrame = 0;
          if (
            useApp.getState().id === documentId &&
            latest.current.tool === activeTool
          )
            void applyLatest.current();
        });
      } else change();
    };
    const cancel = () => {
      pointer = null;
      cancelAnimationFrame(finishFrame);
      finishFrame = 0;
    };
    const navigate = () => {
      cancel();
      if (group.contains(window.getSelection()?.focusNode || null))
        window.getSelection()?.removeAllRanges();
      setSelection(null);
    };
    const key = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        group.contains(window.getSelection()?.focusNode || null)
      )
        navigate();
    };
    document.addEventListener("selectionchange", change);
    group.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("pdfweld-navigation-start", navigate);
    change();
    return () => {
      cancelAnimationFrame(frame);
      cancel();
      layers.delete(group);
      document.removeEventListener("selectionchange", change);
      group.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("pdfweld-navigation-start", navigate);
    };
  }, [page, lines]);
  const kind = isTextMarkup(tool) ? tool : "highlight";
  const label =
    kind === "underline"
      ? "Underline selection"
      : kind === "strike"
        ? "Strikethrough selection"
        : "Highlight selection";
  const Icon =
    kind === "underline"
      ? Underline
      : kind === "strike"
        ? Strikethrough
        : Highlighter;
  const host = root.current?.closest<HTMLElement>(
    '[data-testid="document-viewport"]',
  )?.parentElement;
  return (
    <>
      <SelectableGlyphs root={root} page={page} lines={lines} scale={scale} />
      {allowed &&
        selection &&
        host &&
        createPortal(
          <div
            data-selection-controls
            className="absolute bottom-3 left-1/2 z-40 w-max max-w-[calc(100%-16px)] -translate-x-1/2 rounded-lg border border-white/10 bg-studio-900 p-1 text-white shadow-panel"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void apply();
            }}
          >
            <Button
              variant="primary"
              className="min-h-10 text-xs"
              disabled={busy}
              onClick={() => void apply()}
            >
              <Icon size={16} />
              {label}
            </Button>
          </div>,
          host,
        )}
    </>
  );
}
