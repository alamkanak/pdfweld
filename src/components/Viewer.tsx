import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Maximize,
  Columns2,
  BookOpen,
  PanelLeftClose,
} from "lucide-react";
import { PageView } from "./PageView";
import { useApp } from "../lib/store";
import { IconButton } from "./ui";
import { metrics } from "../lib/performance";
import clsx from "clsx";
export function goToPage(page: number) {
  const s = useApp.getState();
  page = Math.max(0, Math.min(s.info!.pages.length - 1, page));
  useApp.setState({ page });
  requestAnimationFrame(() =>
    document
      .querySelector(`[data-page="${page}"]`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" }),
  );
}
export function Viewer() {
  const info = useApp((s) => s.info)!,
    zoom = useApp((s) => s.zoom),
    layout = useApp((s) => s.layout),
    page = useApp((s) => s.page),
    tool = useApp((s) => s.tool);
  const viewport = useRef<HTMLDivElement>(null),
    stack = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(800);
  const dragging = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    let resizing = false;
    const update = () => {
      if (!resizing) setAvailable(node.clientWidth);
    };
    const begin = () => {
      resizing = true;
    };
    const end = () => {
      resizing = false;
      update();
    };
    update();
    const o = new ResizeObserver(update);
    o.observe(node);
    window.addEventListener("pdfweld-pane-resize-start", begin);
    window.addEventListener("pdfweld-pane-resize-end", end);
    return () => {
      o.disconnect();
      window.removeEventListener("pdfweld-pane-resize-start", begin);
      window.removeEventListener("pdfweld-pane-resize-end", end);
    };
  }, []);
  useEffect(() => {
    const node = viewport.current,
      content = stack.current;
    if (!node || !content) return;
    let baseline = 1,
      latest = 1,
      timer: ReturnType<typeof setTimeout> | undefined;
    let touchDistance = 0;
    let anchor: {
      element: HTMLElement;
      u: number;
      v: number;
      x: number;
      y: number;
      id: string;
    } | null = null;
    let centerX = 0,
      centerY = 0;
    const begin = (x: number, y: number) => {
      baseline = useApp.getState().zoom;
      latest = baseline;
      centerX = x;
      centerY = y;
      dragging.current = null;
      window.dispatchEvent(new Event("pdfweld-navigation-start"));
      const element = (document
        .elementFromPoint(x, y)
        ?.closest("[data-page]") ||
        node.querySelector(
          `[data-page="${useApp.getState().page}"]`,
        )) as HTMLElement | null;
      if (element) {
        const rect = element.getBoundingClientRect();
        anchor = {
          element,
          u: (x - rect.left) / rect.width,
          v: (y - rect.top) / rect.height,
          x,
          y,
          id: useApp.getState().id,
        };
      }
      const rect = content.getBoundingClientRect();
      content.style.transformOrigin = `${x - rect.left}px ${y - rect.top}px`;
    };
    const preview = (next: number, x = centerX, y = centerY) => {
      latest = Math.max(0.25, Math.min(5, next));
      centerX = x;
      centerY = y;
      content.style.transform = `translate(${anchor ? x - anchor.x : 0}px,${anchor ? y - anchor.y : 0}px) scale(${latest / baseline})`;
    };
    const commit = () => {
      content.style.transform = "";
      const snapshot = anchor,
        x = centerX,
        y = centerY;
      anchor = null;
      if (snapshot && snapshot.id !== useApp.getState().id) return;
      useApp.setState({ zoom: latest });
      requestAnimationFrame(() => {
        if (
          !snapshot?.element.isConnected ||
          snapshot.id !== useApp.getState().id
        )
          return;
        const rect = snapshot.element.getBoundingClientRect();
        node.scrollLeft += rect.left + snapshot.u * rect.width - x;
        node.scrollTop += rect.top + snapshot.v * rect.height - y;
      });
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (!timer) {
        begin(e.clientX, e.clientY);
      }
      preview(latest * Math.exp(-e.deltaY * 0.006));
      clearTimeout(timer);
      timer = setTimeout(() => {
        commit();
        timer = undefined;
      }, 140);
    };
    const distance = (e: TouchEvent) =>
      Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    const touchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        touchDistance = distance(e);
        begin(
          (e.touches[0].clientX + e.touches[1].clientX) / 2,
          (e.touches[0].clientY + e.touches[1].clientY) / 2,
        );
      }
    };
    const touchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchDistance) {
        e.preventDefault();
        preview(
          (baseline * distance(e)) / touchDistance,
          (e.touches[0].clientX + e.touches[1].clientX) / 2,
          (e.touches[0].clientY + e.touches[1].clientY) / 2,
        );
      }
    };
    const touchEnd = () => {
      if (touchDistance) {
        touchDistance = 0;
        commit();
      }
    };
    node.addEventListener("wheel", wheel, { passive: false });
    node.addEventListener("touchstart", touchStart, { passive: true });
    node.addEventListener("touchmove", touchMove, { passive: false });
    node.addEventListener("touchend", touchEnd);
    node.addEventListener("touchcancel", touchEnd);
    return () => {
      clearTimeout(timer);
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("touchstart", touchStart);
      node.removeEventListener("touchmove", touchMove);
      node.removeEventListener("touchend", touchEnd);
      node.removeEventListener("touchcancel", touchEnd);
    };
  }, []);
  useEffect(() => {
    if (layout !== "continuous" && layout !== "spread") return;
    const node = viewport.current;
    if (!node) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect(),
          pages = Array.from(node.querySelectorAll<HTMLElement>("[data-page]"));
        let best = useApp.getState().page,
          area = 0;
        for (const p of pages) {
          const r = p.getBoundingClientRect();
          const visible = Math.max(
            0,
            Math.min(r.bottom, rect.bottom) - Math.max(r.top, rect.top),
          );
          if (visible > area) {
            area = visible;
            best = Number(p.dataset.page);
          }
        }
        if (best !== useApp.getState().page) useApp.setState({ page: best });
      });
    };
    node.addEventListener("scroll", update, { passive: true });
    return () => {
      node.removeEventListener("scroll", update);
      cancelAnimationFrame(frame);
    };
  }, [layout, info.pages.length]);
  const cols = layout === "spread" && available > 650 ? 2 : 1;
  const maxWidth = Math.max(...info.pages.map((p) => p.width));
  const fit =
    (available - (available < 600 ? 16 : 24) - (cols - 1) * 12) /
    (maxWidth * cols);
  const scale = Math.max(0.1, fit) * zoom;
  const pages = layout === "single" ? [page] : info.pages.map((_, i) => i);
  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-studio-950/30">
      <div
        ref={viewport}
        data-testid="document-viewport"
        className={clsx(
          "min-h-0 flex-1 overflow-auto overscroll-contain px-2 pb-16 pt-3 sm:px-3 sm:pb-20",
          tool === "hand" && "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={(e) => {
          if (tool === "hand") {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragging.current = {
              x: e.clientX,
              y: e.clientY,
              left: e.currentTarget.scrollLeft,
              top: e.currentTarget.scrollTop,
            };
          }
        }}
        onPointerMove={(e) => {
          if (dragging.current) {
            const t = performance.now();
            e.currentTarget.scrollLeft =
              dragging.current.left - (e.clientX - dragging.current.x);
            e.currentTarget.scrollTop =
              dragging.current.top - (e.clientY - dragging.current.y);
            metrics.recordInput(performance.now() - t);
          }
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
      >
        <div
          ref={stack}
          className={clsx(
            "mx-auto flex w-max min-w-full items-center gap-3",
            cols === 2 ? "flex-row flex-wrap justify-center" : "flex-col",
          )}
        >
          {pages.map((i) => (
            <div
              key={`${useApp.getState().id}-${i}`}
              className="flex flex-col items-center gap-1.5"
            >
              <PageView page={i} scale={scale} />
              <span className="select-none text-xs font-medium tracking-wider text-studio-600">
                {info.pages[i].label || i + 1}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 hidden -translate-x-1/2 md:block">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-white/10 bg-studio-850/95 p-1.5 shadow-panel">
          <IconButton
            label="Previous page"
            onClick={() => goToPage(page - 1)}
            disabled={page === 0}
          >
            <ChevronLeft size={17} />
          </IconButton>
          <span className="min-w-14 text-center text-xs tabular-nums">
            {page + 1}
            <span className="text-studio-600"> / {info.pages.length}</span>
          </span>
          <IconButton
            label="Next page"
            onClick={() => goToPage(page + 1)}
            disabled={page === info.pages.length - 1}
          >
            <ChevronRight size={17} />
          </IconButton>
          <span className="mx-2 h-5 w-px bg-white/10" />
          <IconButton
            label="Zoom out"
            onClick={() =>
              useApp.setState({ zoom: Math.max(0.25, zoom - 0.25) })
            }
          >
            <Minus size={16} />
          </IconButton>
          <button
            onClick={() => useApp.setState({ zoom: 1 })}
            className="min-w-12 px-1 text-xs tabular-nums text-studio-400"
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconButton
            label="Zoom in"
            onClick={() => useApp.setState({ zoom: Math.min(5, zoom + 0.25) })}
          >
            <Plus size={16} />
          </IconButton>
          <span className="mx-2 h-5 w-px bg-white/10" />
          <IconButton
            label="Single page view"
            active={layout === "single"}
            onClick={() =>
              useApp.setState({
                layout: layout === "single" ? "continuous" : "single",
              })
            }
          >
            <BookOpen size={16} />
          </IconButton>
          <IconButton
            label="Two page view"
            active={layout === "spread"}
            onClick={() =>
              useApp.setState({
                layout: layout === "spread" ? "continuous" : "spread",
              })
            }
          >
            <Columns2 size={16} />
          </IconButton>
          <IconButton
            label="Focus mode"
            onClick={() =>
              useApp.setState({
                panel: useApp.getState().panel ? null : "pages",
              })
            }
          >
            <Maximize size={16} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
