import type { HTMLAttributes } from "react";
import clsx from "clsx";

// Pane borders belong to the full-width container; its contents own the gutter.
export function PaneToolbar({
  as: Element = "div",
  wrap = true,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "header" | "nav";
  wrap?: boolean;
}) {
  return (
    <Element
      {...props}
      data-pane-toolbar=""
      className={clsx(
        "flex min-w-0 shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2",
        wrap ? "flex-wrap" : "flex-nowrap",
        className,
      )}
    />
  );
}

export function PaneSectionHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-pane-section-header=""
      className={clsx(
        "flex min-w-0 flex-wrap items-center justify-between gap-2 px-3 py-2",
        className,
      )}
    />
  );
}
