import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useApp } from "../lib/store";
import { commitTextDraft } from "../lib/text-editing";
import { Button, IconButton } from "./ui";

let font: Promise<FontFace> | undefined;
function loadEditorFont() {
  return (font ||= new FontFace(
    "Noto Sans Bengali",
    `url(${import.meta.env.BASE_URL}fonts/NotoSansBengali.ttf)`,
  )
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
      return loaded;
    })
    .catch((error) => {
      font = undefined;
      throw error;
    }));
}

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
    if (!draft || !element) return;
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
      data-text-editor
      className="absolute z-30 border border-lime-500 bg-white shadow-sm ring-2 ring-lime-500/20"
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
            Math.min(0, (pageWidth - draft.rect[0]) * scale - 140),
          ),
        }}
      >
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
          label="Cancel text editing"
          className="h-9 w-9"
          disabled={busy}
          onClick={() => useApp.setState({ textDraft: null })}
        >
          <X size={15} />
        </IconButton>
      </div>
    </div>
  );
}
