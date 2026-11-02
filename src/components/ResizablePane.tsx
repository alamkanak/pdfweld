import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import clsx from "clsx";
import { metrics } from "../lib/performance";

const read = (key: string, fallback: number) => {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
};

export function ResizablePane({
  id,
  label,
  children,
  className,
  sheet = false,
  defaultWidth = 224,
  minWidth = 176,
  maxWidth = 480,
  reserve = 368,
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
  sheet?: boolean;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  reserve?: number;
}) {
  const root = useRef<HTMLElement>(null),
    vertical = useRef<HTMLDivElement>(null),
    horizontal = useRef<HTMLDivElement>(null);
  const initialHeight = Math.round(Math.min(560, innerHeight * 0.65));
  const [preferred, setPreferred] = useState(() => ({
    width: read(`pdfweld-pane:${id}:width`, defaultWidth),
    height: read(`pdfweld-pane:${id}:height`, initialHeight),
  }));
  const size = useRef({ ...preferred }),
    frame = useRef(0);
  const gesture = useRef<{
    axis: "width" | "height";
    pointer: number;
    target: HTMLElement;
    start: number;
    original: number;
    value: number;
  } | null>(null);
  const limits = (axis: "width" | "height") =>
    axis === "width"
      ? {
          min: minWidth,
          max: Math.max(
            minWidth,
            Math.min(
              maxWidth,
              (root.current?.parentElement?.clientWidth || innerWidth) -
                reserve,
            ),
          ),
        }
      : {
          min: Math.min(200, innerHeight * 0.5),
          max: Math.floor(innerHeight * 0.88),
        };
  const apply = (axis: "width" | "height", next: number) => {
    const bounds = limits(axis),
      value = Math.round(Math.max(bounds.min, Math.min(bounds.max, next)));
    size.current[axis] = value;
    root.current?.style.setProperty(`--pane-${axis}`, `${value}px`);
    const handle = axis === "width" ? vertical.current : horizontal.current;
    handle?.setAttribute("aria-valuenow", String(value));
    handle?.setAttribute("aria-valuemin", String(bounds.min));
    handle?.setAttribute("aria-valuemax", String(bounds.max));
    return value;
  };
  useLayoutEffect(() => {
    const update = () => {
      if (!gesture.current) {
        apply("width", preferred.width);
        apply("height", preferred.height);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    if (root.current?.parentElement)
      observer.observe(root.current.parentElement);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      cancelAnimationFrame(frame.current);
      if (gesture.current) {
        gesture.current = null;
        document.documentElement.classList.remove("select-none");
        window.dispatchEvent(new Event("pdfweld-pane-resize-end"));
      }
    };
  }, [preferred.width, preferred.height, id]);
  const commit = (axis: "width" | "height", next: number) => {
    const value = apply(axis, next);
    setPreferred((previous) => ({ ...previous, [axis]: value }));
    try {
      localStorage.setItem(`pdfweld-pane:${id}:${axis}`, String(value));
    } catch {
      /* Resizing works without storage. */
    }
  };
  const begin = (
    e: ReactPointerEvent<HTMLDivElement>,
    axis: "width" | "height",
  ) => {
    if (e.button !== 0 || e.isPrimary === false) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      axis,
      pointer: e.pointerId,
      target: e.currentTarget,
      start: axis === "width" ? e.clientX : e.clientY,
      original: size.current[axis],
      value: size.current[axis],
    };
    document.documentElement.classList.add("select-none");
    window.dispatchEvent(new Event("pdfweld-navigation-start"));
    window.dispatchEvent(new Event("pdfweld-pane-resize-start"));
  };
  const move = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const started = performance.now();
    g.value =
      g.original +
      (g.axis === "width" ? e.clientX - g.start : g.start - e.clientY);
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (gesture.current === g) apply(g.axis, g.value);
      });
    metrics.recordInput(performance.now() - started);
  };
  const finish = (cancelled = false) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (g.target.hasPointerCapture(g.pointer))
      g.target.releasePointerCapture(g.pointer);
    if (cancelled) apply(g.axis, g.original);
    else commit(g.axis, g.value);
    document.documentElement.classList.remove("select-none");
    window.dispatchEvent(new Event("pdfweld-pane-resize-end"));
  };
  const handle = (axis: "width" | "height") => (
    <div
      ref={axis === "width" ? vertical : horizontal}
      role="separator"
      tabIndex={0}
      aria-label={`Resize ${label} pane ${axis}`}
      aria-orientation={axis === "width" ? "vertical" : "horizontal"}
      aria-controls={`pane-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
      aria-valuenow={preferred[axis]}
      aria-valuemin={limits(axis).min}
      aria-valuemax={limits(axis).max}
      title="Drag to resize · Double-click to reset"
      className={
        axis === "width"
          ? "group absolute inset-y-0 -right-1 z-30 hidden w-2 touch-none cursor-col-resize outline-none md:block"
          : "group flex h-6 shrink-0 touch-none cursor-row-resize items-center justify-center outline-none md:hidden"
      }
      onPointerDown={(e) => begin(e, axis)}
      onPointerMove={move}
      onPointerUp={(e) => {
        move(e);
        finish();
      }}
      onPointerCancel={() => finish(true)}
      onLostPointerCapture={() => finish(true)}
      onDoubleClick={() => {
        window.dispatchEvent(new Event("pdfweld-pane-resize-start"));
        commit(axis, axis === "width" ? defaultWidth : initialHeight);
        window.dispatchEvent(new Event("pdfweld-pane-resize-end"));
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          finish(true);
          return;
        }
        const decrease = axis === "width" ? "ArrowLeft" : "ArrowDown",
          increase = axis === "width" ? "ArrowRight" : "ArrowUp";
        if (![decrease, increase, "Home", "End", "Enter"].includes(e.key))
          return;
        e.preventDefault();
        e.stopPropagation();
        const bounds = limits(axis),
          step = e.shiftKey ? 32 : 8;
        const value =
          e.key === "Home"
            ? bounds.min
            : e.key === "End"
              ? bounds.max
              : e.key === "Enter"
                ? axis === "width"
                  ? defaultWidth
                  : initialHeight
                : size.current[axis] + (e.key === decrease ? -step : step);
        window.dispatchEvent(new Event("pdfweld-pane-resize-start"));
        commit(axis, value);
        window.dispatchEvent(new Event("pdfweld-pane-resize-end"));
      }}
    >
      <span
        className={
          axis === "width"
            ? "absolute inset-y-0 left-1 w-px bg-white/10 group-hover:w-0.5 group-hover:bg-lime-400 group-focus-visible:w-0.5 group-focus-visible:bg-lime-400"
            : "h-1 w-9 rounded-full bg-studio-600 group-hover:bg-lime-400 group-focus-visible:bg-lime-400"
        }
      />
    </div>
  );
  return (
    <aside
      ref={root}
      id={`pane-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
      aria-label={label}
      style={
        {
          "--pane-width": `${preferred.width}px`,
          "--pane-height": `${preferred.height}px`,
        } as CSSProperties
      }
      className={clsx(
        sheet
          ? "fixed inset-x-0 bottom-0 z-40 flex h-[var(--pane-height)] max-h-[88dvh] flex-col rounded-t-lg bg-studio-900 shadow-panel md:relative md:inset-auto md:z-10 md:h-full md:max-h-none md:rounded-none md:shadow-none"
          : "relative hidden h-full flex-col bg-studio-900 md:flex",
        "shrink-0 md:w-[var(--pane-width)]",
        className,
      )}
    >
      {sheet && handle("height")}
      {children}
      {handle("width")}
    </aside>
  );
}
