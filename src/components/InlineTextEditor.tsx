import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, X, Move, Grip, Type } from "lucide-react";
import { useApp } from "../lib/store";
import { commitTextDraft } from "../lib/text-editing";
import { Button, IconButton } from "./ui";

import { loadEditorFont } from "../lib/editor-font";
import { useElementGesture } from "../hooks/use-element-gesture";

export function InlineTextEditor({
  page,
  scale,
  pageHeight,
  pageWidth,
}: {
  page: number;
  scale: number;
  pageHeight: number;
  pageWidth: number;
}) {
  const draft = useApp((s) =>
    s.textDraft?.page === page ? s.textDraft : null,
  );
  const busy = useApp((s) => !!s.busy);
  const input = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const { begin, phase, cancel } = useElementGesture({
    root,
    rect: draft?.rect || [0, 0, 1, 1],
    scale,
    pageWidth,
    pageHeight,
    onStart: () => input.current?.focus({ preventScroll: true }),
    onCommit: (rect) => {
      const current = useApp.getState().textDraft;
      if (!current || current.page !== page || current.id !== draft?.id)
        return false;
      useApp.setState({ textDraft: { ...current, rect } });
      return true;
    },
  });
  const composing = useRef(false);
  const [fontReady, setFontReady] = useState(false);
  const identity = draft ? `${page}:${draft.id ?? "new"}` : "";
  useEffect(() => {
    if (!identity) return;
    let active = true;
    void loadEditorFont()
      .then(() => {
        if (active) setFontReady(true);
      })
      .catch((error) => useApp.getState().fail(error));
    input.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (
        composing.current ||
        (event.target as Element).closest(
          "[data-text-editor], [data-appearance-controls], [role=dialog]",
        )
      )
        return;
      if (
        !(event.target as Element).closest(
          "[data-page], [data-testid=document-viewport]",
        )
      )
        return;
      void commitTextDraft();
    };
    document.addEventListener("pointerdown", outside, true);
    const reveal = () => input.current?.scrollIntoView({ block: "nearest" });
    window.visualViewport?.addEventListener("resize", reveal);
    return () => {
      active = false;
      document.removeEventListener("pointerdown", outside, true);
      window.visualViewport?.removeEventListener("resize", reveal);
    };
  }, [identity]);
  useLayoutEffect(() => {
    const element = input.current;
    if (!draft || !element || phase) return;
    element.style.height = "0px";
    const contentHeight = element.scrollHeight;
    element.style.height = "100%";
    const height = Math.min(
      pageHeight - draft.rect[1],
      Math.max(draft.rect[3] - draft.rect[1], (contentHeight + 4) / scale),
    );
    if (height > draft.rect[3] - draft.rect[1] + 0.5)
      useApp.setState({
        textDraft: {
          ...draft,
          rect: [
            draft.rect[0],
            draft.rect[1],
            draft.rect[2],
            draft.rect[1] + height,
          ],
        },
      });
  }, [identity, draft?.text, draft?.fontSize, scale, fontReady]);
  if (!draft) return null;
  const patch = (values: Partial<typeof draft>) => {
    const current = useApp.getState().textDraft;
    if (current?.page === page)
      useApp.setState({ textDraft: { ...current, ...values } });
  };
  const toolbarBelow = draft.rect[1] * scale < 54;
  return (
    <div
      ref={root}
      data-text-editor
      className="absolute z-30 border border-lime-500 bg-transparent shadow-sm ring-2 ring-lime-500/20"
      style={{
        left: draft.rect[0] * scale,
        top: draft.rect[1] * scale,
        width: (draft.rect[2] - draft.rect[0]) * scale,
        height: (draft.rect[3] - draft.rect[1]) * scale,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <textarea
        ref={input}
        aria-label="Text on PDF"
        placeholder="Type here…"
        value={draft.text}
        disabled={busy}
        spellCheck={false}
        className="h-full w-full resize-none overflow-y-auto bg-transparent p-0 text-black outline-none placeholder:text-stone-400 [color-scheme:light]"
        style={{
          fontFamily: "Arial, 'Noto Sans Bengali', sans-serif",
          fontSize: draft.fontSize * scale,
          lineHeight: 1.2,
          color: draft.color,
          opacity: draft.opacity,
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onChange={(event) => {
          patch({ text: event.target.value });
        }}
        onKeyDown={(event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            ["s", "o", "k"].includes(event.key.toLowerCase()) &&
            !event.nativeEvent.isComposing &&
            !composing.current
          )
            return;
          event.stopPropagation();
          if (event.nativeEvent.isComposing || composing.current) return;
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
            useApp.setState({ textDraft: null });
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void commitTextDraft();
          }
        }}
      />
      <div
        className={`absolute left-0 flex w-max max-w-[calc(100vw-32px)] items-center gap-1 rounded-lg border border-white/10 bg-studio-900 p-1 text-white shadow-panel ${toolbarBelow ? "top-full mt-2" : "bottom-full mb-2"}`}
        style={{
          left: Math.max(
            -draft.rect[0] * scale,
            Math.min(0, (pageWidth - draft.rect[0]) * scale - 230),
          ),
        }}
      >
        <IconButton
          label="Drag text"
          className="h-9 w-9 touch-none cursor-move"
          onPointerDown={(event) => {
            if (!busy && !composing.current) begin(event, "move");
          }}
        >
          <Move size={15} />
        </IconButton>
        <Button
          variant="primary"
          className="min-h-9 px-3 text-xs"
          disabled={busy}
          onClick={() => void commitTextDraft()}
        >
          <Check size={15} />
          Done
        </Button>
        <IconButton
          label="Text size and color"
          className="h-9 w-9"
          onClick={() => useApp.setState({ appearanceOpen: true })}
        >
          <Type size={16} />
        </IconButton>
        <IconButton
          label="Cancel text editing"
          className="h-9 w-9"
          disabled={busy}
          onClick={() => {
            cancel();
            useApp.setState({ textDraft: null });
          }}
        >
          <X size={15} />
        </IconButton>
      </div>
      <button
        type="button"
        aria-label="Resize text"
        title="Resize text box — keeps text size"
        className="absolute -bottom-3 -right-3 flex h-7 w-7 touch-none cursor-nwse-resize items-center justify-center rounded-lg border border-lime-600 bg-lime-400 text-studio-950 shadow-sm"
        onPointerDown={(event) => {
          if (!busy && !composing.current) begin(event, "resize");
        }}
      >
        <Grip size={14} />
      </button>
    </div>
  );
}
