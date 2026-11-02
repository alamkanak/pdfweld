import { homeTools, getHomeTool, type HomeToolId } from "../lib/home-tools";
import { toolPages, toolPath } from "./pages";
import type { MouseEvent } from "react";
export function followTool(
  event: MouseEvent<HTMLAnchorElement>,
  id: HomeToolId,
  onNavigate?: (id: HomeToolId) => void,
) {
  if (
    !onNavigate ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  onNavigate(id);
}
export function PublicOverview({
  onNavigate,
}: {
  onNavigate?: (id: HomeToolId) => void;
}) {
  return (
    <section
      aria-labelledby="public-overview"
      className="border-t border-white/10 p-3"
    >
      <h2 id="public-overview" className="text-base font-semibold text-white">
        Private PDF tools, in your browser
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-studio-400">
        PDFWeld lets you edit, compress, combine, split, and sign PDFs on
        desktop and phone. Files are processed on your device. No account or
        document upload is needed.
      </p>
      <nav
        aria-label="Explore PDF tools"
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
      >
        {homeTools.map((tool) => (
          <a
            key={tool.id}
            href={toolPath(tool.id)}
            onClick={(e) => followTool(e, tool.id, onNavigate)}
            className="rounded-lg px-2 py-2 text-sm text-studio-400 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-300"
          >
            {tool.label}
          </a>
        ))}
      </nav>
      <p className="mt-3 max-w-3xl text-xs leading-5 text-studio-400">
        Download completed files to keep a backup. Browser recovery storage can
        be cleared or evicted by your device. Lossless compression may leave
        already optimized PDFs unchanged; scanned PDFs need OCR before text
        extraction.
      </p>
    </section>
  );
}
export function ToolGuide({ id }: { id: HomeToolId }) {
  const page = toolPages[id];
  return (
    <details className="mt-3 rounded-lg border border-white/10 p-3">
      <summary className="cursor-pointer text-sm font-medium text-studio-200">
        How to use {getHomeTool(id).label}
      </summary>
      <p className="mt-3 text-sm leading-6 text-studio-400">{page.summary}</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-studio-200">
        {page.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-5 text-studio-400">{page.note}</p>
      <p className="mt-3 text-xs leading-5 text-studio-400">
        Files and passwords stay on your device. Download results to keep a
        copy.
      </p>
    </details>
  );
}
export function NotFound({ base }: { base: string }) {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <img src={`${base}icon-192.png`} width="64" height="64" alt="" />
      <h1 className="text-xl font-semibold text-white">Page not found</h1>
      <p className="max-w-md text-sm leading-6 text-studio-400">
        This PDFWeld page does not exist. Return to the tool library to choose a
        PDF task.
      </p>
      <a
        href={base}
        className="inline-flex min-h-10 items-center rounded-lg bg-lime-400 px-4 text-sm font-medium text-studio-950 hover:bg-lime-300"
      >
        Open PDFWeld
      </a>
    </main>
  );
}
