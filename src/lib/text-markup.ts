import type { Quad } from "mupdf";
import type { Tool } from "./types";

export const isTextMarkup = (tool: Tool) =>
  ["highlight", "underline", "strike"].includes(tool);

export function validTextQuad(value: number[]): value is Quad {
  if (value.length !== 8 || !value.every(Number.isFinite)) return false;
  return (
    Math.abs(
      (value[2] - value[0]) * (value[5] - value[1]) -
        (value[3] - value[1]) * (value[4] - value[0]),
    ) > 0.001
  );
}

/** Test in the text's own axes, so rotated and vertical passages work too. */
export function coversTextQuad(outer: number[], inner: number[]) {
  const ux = outer[2] - outer[0],
    uy = outer[3] - outer[1];
  const vx = outer[4] - outer[0],
    vy = outer[5] - outer[1];
  const determinant = ux * vy - uy * vx;
  if (Math.abs(determinant) < 0.001) return false;
  const tx = 0.25 / Math.max(1, Math.hypot(ux, uy));
  const ty = 0.25 / Math.max(1, Math.hypot(vx, vy));
  for (let i = 0; i < 8; i += 2) {
    const x = inner[i] - outer[0],
      y = inner[i + 1] - outer[1];
    const u = (x * vy - y * vx) / determinant;
    const v = (ux * y - uy * x) / determinant;
    if (u < -tx || u > 1 + tx || v < -ty || v > 1 + ty) return false;
  }
  return true;
}

/** Merge only touching glyphs, keeping separate lines/columns and gaps apart. */
export function mergeTextQuads(quads: Quad[]) {
  const result: Quad[] = [];
  const near = (ax: number, ay: number, bx: number, by: number) =>
    Math.hypot(ax - bx, ay - by) < 0.5;
  for (const quad of quads) {
    const last = result[result.length - 1];
    if (
      last &&
      near(last[2], last[3], quad[0], quad[1]) &&
      near(last[6], last[7], quad[4], quad[5])
    ) {
      result[result.length - 1] = [
        last[0],
        last[1],
        quad[2],
        quad[3],
        last[4],
        last[5],
        quad[6],
        quad[7],
      ];
    } else if (
      last &&
      near(last[0], last[1], quad[2], quad[3]) &&
      near(last[4], last[5], quad[6], quad[7])
    ) {
      result[result.length - 1] = [
        quad[0],
        quad[1],
        last[2],
        last[3],
        quad[4],
        quad[5],
        last[6],
        last[7],
      ];
    } else result.push([...quad]);
  }
  return result;
}
