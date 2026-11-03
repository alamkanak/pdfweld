import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Rect } from "../lib/types";
import { metrics } from "../lib/performance";

export type ElementGesture = "move" | "resize";
type Options = {
  root: RefObject<HTMLDivElement | null>;
  rect: Rect;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  preserveAspect?: boolean;
  onStart?: () => void;
  onCommit: (rect: Rect, mode: ElementGesture) => boolean | Promise<boolean>;
};

/** Pointer ownership survives selection renders and stays on a stable target.
 * Only geometry is painted per frame; committing happens once on release. */
export function useElementGesture(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const displayed = useRef<Rect>([...options.rect]);
  const gesture = useRef<{
    pointer: number;
    target: Element;
    x: number;
    y: number;
    factor: number;
    mode: ElementGesture;
    original: Rect;
    next: Rect;
    moved: boolean;
  } | null>(null);
  const pending = useRef(0),
    frame = useRef(0),
    mounted = useRef(true);
  const stopListening = useRef<() => void>(() => {});
  const suppressClickUntil = useRef(0);
  const [phase, setPhase] = useState<ElementGesture | null>(null);
  const place = (rect: Rect) => {
    displayed.current = [...rect];
    const { root, scale } = latest.current;
    if (root.current)
      Object.assign(root.current.style, {
        left: `${rect[0] * scale}px`,
        top: `${rect[1] * scale}px`,
        width: `${(rect[2] - rect[0]) * scale}px`,
        height: `${(rect[3] - rect[1]) * scale}px`,
      });
  };
  const release = (g: NonNullable<typeof gesture.current>) => {
    try {
      if (g.target.hasPointerCapture(g.pointer))
        g.target.releasePointerCapture(g.pointer);
    } catch {
      /* The browser may already have cancelled the native pointer. */
    }
  };
  const cancel = () => {
    const g = gesture.current;
    gesture.current = null;
    stopListening.current();
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (g) {
      release(g);
      place(g.original);
    }
    if (mounted.current && !pending.current) setPhase(null);
  };
  useLayoutEffect(() => {
    place(
      gesture.current?.next ||
        (pending.current ? displayed.current : options.rect),
    );
  }, [options.rect.join(","), options.scale]);
  useEffect(() => {
    mounted.current = true;
    window.addEventListener("pdfweld-navigation-start", cancel);
    return () => {
      mounted.current = false;
      cancel();
      window.removeEventListener("pdfweld-navigation-start", cancel);
    };
  }, []);
  const begin = (event: ReactPointerEvent, mode: ElementGesture) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    if (gesture.current) cancel();
    const { root, pageWidth, onStart } = latest.current;
    const page = root.current?.closest("[data-page]")?.getBoundingClientRect();
    if (!page?.width) return;
    event.preventDefault();
    event.stopPropagation();
    onStart?.();
    const g = {
      pointer: event.pointerId,
      target: event.currentTarget,
      x: event.clientX,
      y: event.clientY,
      factor: page.width / pageWidth,
      mode,
      original: [...displayed.current] as Rect,
      next: [...displayed.current] as Rect,
      moved: false,
    };
    gesture.current = g;
    try {
      g.target.setPointerCapture(g.pointer);
    } catch {
      /* Window listeners remain the fallback. */
    }
    const move = (e: PointerEvent) => {
      if (gesture.current !== g || e.pointerId !== g.pointer) return;
      const started = performance.now();
      e.preventDefault();
      e.stopPropagation();
      const dx = (e.clientX - g.x) / g.factor,
        dy = (e.clientY - g.y) / g.factor;
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 3) return;
      if (!g.moved) {
        g.moved = true;
        setPhase(mode);
      }
      const r = g.original,
        w = r[2] - r[0],
        h = r[3] - r[1];
      const { pageWidth, pageHeight, preserveAspect } = latest.current;
      if (mode === "move") {
        const x = Math.max(0, Math.min(Math.max(0, pageWidth - w), r[0] + dx));
        const y = Math.max(0, Math.min(Math.max(0, pageHeight - h), r[1] + dy));
        g.next = [x, y, x + w, y + h];
      } else {
        let width = Math.max(12, Math.min(pageWidth - r[0], w + dx));
        let height = Math.max(12, Math.min(pageHeight - r[1], h + dy));
        if (preserveAspect) {
          width = Math.min(width, (height * w) / h);
          height = (width * h) / w;
        }
        g.next = [r[0], r[1], r[0] + width, r[1] + height];
      }
      if (!frame.current)
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          if (gesture.current === g) place(g.next);
        });
      metrics.recordInput(performance.now() - started);
    };
    const finish = async (e: PointerEvent) => {
      if (gesture.current !== g || e.pointerId !== g.pointer) return;
      move(e);
      gesture.current = null;
      stopListening.current();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      release(g);
      if (!g.moved) return;
      suppressClickUntil.current = performance.now() + 400;
      place(g.next);
      pending.current++;
      try {
        const ok = await latest.current.onCommit(g.next, g.mode);
        if (!ok && !gesture.current && mounted.current)
          place(latest.current.rect);
      } finally {
        pending.current--;
        if (mounted.current && !gesture.current && !pending.current)
          setPhase(null);
      }
    };
    const abort = (e: PointerEvent) => {
      if (e.pointerId === g.pointer && gesture.current === g) cancel();
    };
    window.addEventListener("pointermove", move, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", abort, true);
    window.addEventListener("blur", cancel);
    g.target.addEventListener("lostpointercapture", abort as EventListener);
    stopListening.current = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", abort, true);
      window.removeEventListener("blur", cancel);
      g.target.removeEventListener(
        "lostpointercapture",
        abort as EventListener,
      );
    };
  };
  return {
    begin,
    phase,
    cancel,
    canEdit: () => performance.now() > suppressClickUntil.current,
  };
}
