import {
  useLayoutEffect,
  useState,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";
import { loadEditorFont } from "../lib/editor-font";
import { DEFAULT_FONT, fontFamilyCSS } from "../lib/font-catalog";

export const pdfTextFont = fontFamilyCSS();
const browserBaselines = new Map<string, number>();
function baseline(fontFamily: string) {
  const cached = browserBaselines.get(fontFamily);
  if (cached !== undefined) return cached;
  const line = document.createElement("span"),
    marker = document.createElement("span");
  line.setAttribute("aria-hidden", "true");
  Object.assign(line.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    whiteSpace: "pre",
    fontFamily: fontFamilyCSS(fontFamily),
    fontSize: "100px",
    lineHeight: "1.2",
  });
  Object.assign(marker.style, {
    display: "inline-block",
    width: "0",
    height: "0",
    verticalAlign: "baseline",
  });
  line.append("Hg", marker);
  document.body.append(line);
  const ratio =
    (marker.getBoundingClientRect().top - line.getBoundingClientRect().top) /
    100;
  line.remove();
  browserBaselines.set(fontFamily, ratio);
  return ratio;
}

// MuPDF's plain WinAnsi text uses a .8 em first baseline; its Unicode shaping
// path uses .9 em. Subsequent lines use 1.2 em in both paths.
const winAnsi =
  /^[\u0000-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]*$/u;

/** Keep native editing and drag previews aligned to the PDF text layout. */
export function PdfTextInput({
  ref,
  fontSize,
  fontFamily = DEFAULT_FONT,
  scale,
  color,
  opacity = 1,
  value,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
  fontSize: number;
  fontFamily?: string;
  scale: number;
  color: string;
  opacity?: number;
  value: string;
}) {
  const [ratio, setRatio] = useState(browserBaselines.get(fontFamily) ?? 0.95);
  useLayoutEffect(() => {
    let active = true;
    void loadEditorFont(fontFamily)
      .then(() => {
        if (active) setRatio(baseline(fontFamily));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [fontFamily]);
  const simple = fontFamily === DEFAULT_FONT && winAnsi.test(value);
  const offset = (ratio - (simple ? 0.8 : 0.9)) * fontSize * scale;
  return (
    <div className="absolute inset-0 overflow-hidden">
      <textarea
        {...props}
        ref={ref}
        value={value}
        className="relative w-full resize-none overflow-hidden bg-transparent p-0 outline-none placeholder:text-stone-400 [color-scheme:light]"
        style={{
          fontFamily: fontFamilyCSS(fontFamily),
          fontSize: fontSize * scale,
          lineHeight: 1.2,
          fontKerning: simple ? "none" : "normal",
          fontVariantLigatures: simple ? "none" : "normal",
          color,
          WebkitTextFillColor: color,
          opacity,
          transform: `translateY(${-offset}px)`,
          height: `calc(100% + ${offset}px)`,
        }}
      />
    </div>
  );
}
