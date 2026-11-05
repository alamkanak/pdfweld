import { useEffect, useState } from "react";
import { useApp } from "../lib/store";
import { engine } from "../lib/client";
import { annotationColor } from "../lib/text-editing";
import type { AnnotationInfo } from "../lib/types";
import { ColorPicker, Input, Label } from "./ui";
import { FontPicker } from "./FontPicker";
import { DEFAULT_FONT } from "../lib/font-catalog";

export function AppearanceControls() {
  const selected = useApp((s) => s.selectedAnnotation);
  const revision = useApp((s) => s.revision);
  const draft = useApp((s) => s.textDraft);
  const tool = useApp((s) => s.tool);
  const color = useApp((s) => s.color);
  const width = useApp((s) => s.width);
  const textSize = useApp((s) => s.textSize);
  const fontFamily = useApp((s) => s.fontFamily);
  const documentId = useApp((s) => s.id);
  const opacity = useApp((s) => s.opacity);
  const author = useApp((s) => s.author);
  const busy = useApp((s) => !!s.busy);
  const [annotation, setAnnotation] = useState<AnnotationInfo | null>(null);
  useEffect(() => {
    setAnnotation(null);
    if (!selected || draft) return;
    let active = true;
    engine
      .call("details", selected.page)
      .then((details) => {
        if (active)
          setAnnotation(
            details.annotations.find((a) => a.id === selected.id) || null,
          );
      })
      .catch((error) => useApp.getState().fail(error));
    return () => {
      active = false;
    };
  }, [selected?.page, selected?.id, revision, !!draft]);
  const isText =
    !!draft ||
    annotation?.type === "FreeText" ||
    (!selected && ["text", "replace"].includes(tool));
  const isImage = annotation?.type === "Stamp";
  const disabled =
    busy || !!annotation?.locked || (!!selected && !draft && !annotation);
  const currentColor =
    draft?.color || (annotation ? annotationColor(annotation) : color);
  const currentSize =
    draft?.fontSize ||
    (isText ? annotation?.fontSize || textSize : annotation?.width || width);
  const currentOpacity = draft?.opacity ?? annotation?.opacity ?? opacity;
  const change = (
    values: {
      color?: string;
      fontSize?: number;
      fontFamily?: string;
      width?: number;
      opacity?: number;
    },
    commit = false,
  ) => {
    const state = useApp.getState();
    if (state.busy) return;
    useApp.setState({
      ...(values.color ? { color: values.color } : {}),
      ...(values.fontSize !== undefined ? { textSize: values.fontSize } : {}),
      ...(values.fontFamily !== undefined
        ? { fontFamily: values.fontFamily }
        : {}),
      ...(values.width !== undefined ? { width: values.width } : {}),
      ...(values.opacity !== undefined ? { opacity: values.opacity } : {}),
    });
    if (state.textDraft) {
      useApp.setState({ textDraft: { ...state.textDraft, ...values } });
    } else if (state.selectedAnnotation) {
      setAnnotation((a) =>
        a
          ? {
              ...a,
              ...values,
              color: values.color
                ? [1, 3, 5].map(
                    (i) => parseInt(values.color!.slice(i, i + 2), 16) / 255,
                  )
                : a.color,
            }
          : null,
      );
      if (commit)
        void state.act({
          type: "annotation-style",
          ...state.selectedAnnotation,
          ...values,
        });
    }
  };
  return (
    <div className="space-y-4" data-appearance-controls>
      <h2 className="text-sm font-medium text-white">
        {draft
          ? "Text appearance"
          : selected
            ? "Selection appearance"
            : "Tool appearance"}
      </h2>
      {isText && (
        <FontPicker
          value={
            draft?.fontFamily ||
            (annotation ? annotation.fontFamily || DEFAULT_FONT : fontFamily)
          }
          text={draft?.text || annotation?.text || ""}
          disabled={disabled}
          contextKey={`${documentId}:${draft ? `draft-${draft.page}-${draft.id ?? "new"}` : selected ? `${selected.page}-${selected.id}` : tool}`}
          onChange={(fontFamily) => change({ fontFamily }, true)}
        />
      )}
      {isImage ? (
        <p className="text-xs leading-5 text-studio-400">
          Images keep their original colors.
        </p>
      ) : (
        <ColorPicker
          value={currentColor}
          disabled={disabled}
          onChange={(color) => change({ color })}
          onCommit={(color) => change({ color }, true)}
        />
      )}
      {!isImage && (
        <label className="block">
          <Label>{isText ? "Text size (pt)" : "Stroke size (pt)"}</Label>
          <Input
            type="number"
            aria-label={isText ? "Text size (pt)" : "Stroke size (pt)"}
            min={isText ? 6 : 0.5}
            max={isText ? 144 : 36}
            step={isText ? 1 : 0.5}
            value={currentSize}
            disabled={disabled}
            onChange={(e) => {
              const value = Math.max(
                isText ? 6 : 0.5,
                Math.min(
                  isText ? 144 : 36,
                  Number(e.target.value) || (isText ? 18 : 2.5),
                ),
              );
              change(isText ? { fontSize: value } : { width: value });
            }}
            onBlur={(e) =>
              change(
                isText
                  ? { fontSize: Number(e.target.value) }
                  : { width: Number(e.target.value) },
                true,
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
      )}
      <label className="block">
        <Label>
          Opacity{" "}
          <span className="float-right tabular-nums">
            {Math.round(currentOpacity * 100)}%
          </span>
        </Label>
        <input
          type="range"
          aria-label="Opacity"
          min=".1"
          max="1"
          step=".05"
          value={currentOpacity}
          disabled={disabled}
          onChange={(e) => change({ opacity: Number(e.target.value) })}
          onPointerUp={(e) =>
            change({ opacity: Number(e.currentTarget.value) }, true)
          }
          onKeyUp={(e) =>
            change({ opacity: Number(e.currentTarget.value) }, true)
          }
          className="h-6 w-full accent-lime-400"
        />
      </label>
      {tool === "note" && !selected && !draft && (
        <label className="block">
          <Label>Comment author</Label>
          <Input
            value={author}
            onChange={(e) => {
              useApp.setState({ author: e.target.value });
              try {
                localStorage.setItem("pdfweld-author", e.target.value);
              } catch {}
            }}
          />
        </label>
      )}
    </div>
  );
}
