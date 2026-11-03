import { useApp } from "./store";
import { engine } from "./client";
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

export async function editText(page: number, annotation: AnnotationInfo) {
  const session = useApp.getState();
  if (!session.info || session.busy) return;
  let a: AnnotationInfo | undefined;
  try {
    a = (await engine.call("details", page)).annotations.find(
      (a) => a.id === annotation.id,
    );
  } catch (error) {
    session.fail(error);
    return;
  }
  if (!a || useApp.getState().id !== session.id || useApp.getState().busy)
    return;
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
      fixedSize: true,
    },
  });
}

// A draft stays in the DOM until the store commits one undoable PDF change.
export const commitTextDraft = () => useApp.getState().commitText();
