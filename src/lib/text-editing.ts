import { useApp } from "./store";
import type { AnnotationInfo } from "./types";

export const annotationColor = (a: AnnotationInfo) =>
  a.color.length === 3
    ? "#" +
      a.color
        .map((c) =>
          Math.round(c * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    : "#29372f";

export function editText(page: number, a: AnnotationInfo) {
  useApp.setState({
    tool: "select",
    selectedAnnotation: { page, id: a.id },
    color: annotationColor(a),
    textSize: a.fontSize || 18,
    opacity: a.opacity ?? 1,
    textDraft: {
      page,
      id: a.id,
      rect: [...a.rect],
      text: a.text,
      kind: "text",
      color: annotationColor(a),
      fontSize: a.fontSize || 18,
      opacity: a.opacity ?? 1,
    },
  });
}

// A draft stays in the DOM until the store commits one undoable PDF change.
export const commitTextDraft = () => useApp.getState().commitText();
