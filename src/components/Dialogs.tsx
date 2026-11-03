import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  FileCheck,
  LoaderCircle,
  Play,
  RotateCw,
  Trash2,
  Copy,
  Plus,
  Search,
  Download,
  ArrowUpRight,
  X,
  Columns2,
  PenLine,
  ImagePlus,
} from "lucide-react";
import { useApp } from "../lib/store";
import { engine } from "../lib/client";
import { drawingTools, actionTools } from "../lib/tools";
import { runAction, chooseImage, startHomeTool } from "../lib/actions";
import { homeTools } from "../lib/home-tools";
import { pickFile, download, baseName } from "../lib/files";
import { metrics } from "../lib/performance";
import { renderQueue } from "../lib/render-queue";
import {
  Modal,
  Button,
  IconButton,
  Input,
  SearchField,
  Badge,
  Label,
  Empty,
} from "./ui";
import { Thumbnail } from "./PageView";
import type { BenchmarkReport } from "../lib/types";
import clsx from "clsx";
export function Dialogs() {
  const dialog = useApp((s) => s.dialog);
  const close = () => useApp.setState({ dialog: null });
  if (!dialog) return null;
  return dialog === "commands" ? (
    <Commands onClose={close} />
  ) : dialog === "organize" ? (
    <Organizer onClose={close} />
  ) : dialog === "benchmark" ? (
    <PerformanceLab onClose={close} />
  ) : dialog === "check" ? (
    <DocumentCheck onClose={close} />
  ) : dialog === "compare" ? (
    <Compare onClose={close} />
  ) : dialog === "signature" ? (
    <SignaturePicker onClose={close} />
  ) : dialog === "shortcuts" ? (
    <Modal title="A few useful shortcuts" onClose={close}>
      <div className="space-y-3">
        {[
          ["Open PDF", "⌘ / Ctrl O"],
          ["Export PDF", "⌘ / Ctrl S"],
          ["Find a tool", "⌘ / Ctrl K"],
          ["Find in document", "⌘ / Ctrl F"],
          ["Undo", "⌘ / Ctrl Z"],
          ["Redo", "⌘ / Ctrl ⇧ Z"],
          ...drawingTools
            .filter((t) => "key" in t)
            .map((t) => [t.label, "key" in t ? t.key : ""]),
        ].map(([name, key]) => (
          <div
            key={name}
            className="flex justify-between border-b border-white/5 py-2 text-xs"
          >
            <span className="text-studio-400">{name}</span>
            <kbd className="rounded-lg bg-white/5 px-2 py-1 text-xs text-studio-200">
              {key}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  ) : null;
}
function SignaturePicker({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  return (
    <Modal
      title="Add your signature"
      description="Draw on the page or use an existing signature image."
      onClose={onClose}
    >
      <div className="space-y-3">
        <Button
          className="w-full justify-start p-4"
          disabled={loading}
          onClick={() => {
            const s = useApp.getState();
            s.set({
              tool: "signature",
              dialog: null,
              panel: innerWidth < 768 ? null : s.panel,
            });
            s.notify("Draw your signature on the page.");
          }}
        >
          <PenLine size={20} /> Draw signature
        </Button>
        <Button
          className="w-full justify-start p-4"
          variant="primary"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await chooseImage(true);
            } finally {
              setLoading(false);
            }
          }}
        >
          <ImagePlus size={20} />{" "}
          {loading ? "Loading image…" : "Upload signature image"}
        </Button>
      </div>
      <p className="mt-4 text-xs leading-6 text-studio-400">
        PNG or JPEG. Transparent PNG backgrounds are preserved. Tap to place, or
        drag to set the size; proportions stay unchanged.
      </p>
    </Modal>
  );
}
function Commands({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const hasDocument = useApp((state) => !!state.info);
  const tools = (
    hasDocument
      ? [
          ...drawingTools.map((t) => ({ ...t, group: "Annotate" })),
          ...actionTools,
        ]
      : homeTools.map((t) => ({ ...t, group: t.category }))
  ).filter((t) =>
    (t.label + " " + t.description).toLowerCase().includes(query.toLowerCase()),
  );
  const selected = tools.length ? Math.min(active, tools.length - 1) : -1;
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, query]);
  const choose = (index: number) => {
    const tool = tools[index];
    if (!tool) return;
    onClose();
    if (hasDocument) void runAction(tool.id);
    else startHomeTool(tool.id as import("../lib/home-tools").HomeToolId);
  };
  return (
    <Modal
      title="Find your flow"
      description="Every tool, a few keystrokes away."
      onClose={onClose}
    >
      <div
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            if (tools.length)
              setActive(
                (index) =>
                  (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    tools.length) %
                  tools.length,
              );
          } else if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            choose(selected);
          }
        }}
      >
        <SearchField
          placeholder="Search tools and commands…"
          role="combobox"
          aria-label="Search tools and commands"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls="command-results"
          aria-activedescendant={
            selected >= 0 ? `command-result-${selected}` : undefined
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          className="mb-3 w-full"
          autoFocus
        />
        <div
          ref={list}
          id="command-results"
          role="listbox"
          aria-label="Tools and commands"
          className="max-h-[52dvh] overflow-y-auto"
        >
          {tools.map((t, i) => (
            <button
              key={`${t.group}-${t.id}`}
              id={`command-result-${i}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={selected === i}
              className={clsx(
                "group flex w-full items-center gap-3 rounded-lg p-3 text-left",
                selected === i
                  ? "bg-lime-400/10 ring-1 ring-inset ring-lime-400/25"
                  : "hover:bg-white/5",
              )}
              onPointerMove={() => setActive(i)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(i)}
            >
              <span className="rounded-lg bg-white/[.04] p-2.5 text-studio-400 group-hover:text-lime-300">
                <t.icon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-xs font-medium text-studio-200">
                  {t.label}
                </strong>
                <span className="mt-1 block truncate text-xs text-studio-600">
                  {t.description}
                </span>
              </span>
              <ChevronRight size={13} className="text-studio-600" />
            </button>
          ))}
          {!tools.length && (
            <Empty icon={<Search size={22} />}>
              No tools match that search.
            </Empty>
          )}
        </div>
      </div>
    </Modal>
  );
}
function Organizer({ onClose }: { onClose: () => void }) {
  const info = useApp((s) => s.info)!,
    selection = useApp((s) => s.selection);
  const dragged = useRef<number | null>(null);
  const move = async (from: number, to: number) => {
    if (to < 0 || to >= info.pages.length) return;
    const order = info.pages.map((_, i) => i);
    order.splice(to, 0, order.splice(from, 1)[0]);
    await useApp.getState().act({ type: "reorder", order });
    useApp.setState({ selection: [to] });
  };
  return (
    <Modal
      title="A place for every page"
      description="Select pages to organize them. Drag a page to move it, or use the arrow buttons."
      onClose={onClose}
      wide
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            className="text-xs"
            onClick={() =>
              useApp.setState({
                selection:
                  selection.length === info.pages.length
                    ? []
                    : info.pages.map((_, i) => i),
              })
            }
          >
            {selection.length === info.pages.length
              ? "Deselect all"
              : "Select all"}
          </Button>
          <span className="self-center text-xs text-studio-600">
            {selection.length} selected
          </span>
        </div>
        <div className="flex gap-1">
          {[
            { id: "rotate", icon: RotateCw, label: "Rotate selected pages" },
            { id: "duplicate", icon: Copy, label: "Duplicate selected pages" },
            { id: "delete", icon: Trash2, label: "Delete selected pages" },
            { id: "blank", icon: Plus, label: "Insert blank page" },
          ].map((t) => (
            <IconButton
              key={t.id}
              label={t.label}
              onClick={() => void runAction(t.id)}
            >
              <t.icon size={17} />
            </IconButton>
          ))}
        </div>
      </div>
      <div className="grid max-h-[60dvh] grid-cols-2 gap-3 overflow-y-auto rounded-lg bg-studio-950/30 p-3 sm:grid-cols-3 md:grid-cols-5">
        {info.pages.map((p, i) => (
          <div
            key={i}
            className="group"
            draggable
            onDragStart={() => {
              dragged.current = i;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged.current !== null) void move(dragged.current, i);
              dragged.current = null;
            }}
          >
            <button
              className={clsx(
                "relative w-full rounded-lg p-1 ring-2",
                selection.includes(i)
                  ? "bg-lime-400/10 ring-lime-400"
                  : "ring-transparent hover:ring-white/20",
              )}
              aria-label={`Select page ${i + 1}`}
              aria-pressed={selection.includes(i)}
              onClick={() =>
                useApp.setState({
                  selection: selection.includes(i)
                    ? selection.filter((v) => v !== i)
                    : [...selection, i],
                })
              }
            >
              <Thumbnail page={i} width={135} />
              {selection.includes(i) && (
                <span className="absolute right-2 top-2 rounded-full bg-lime-400 p-1 text-studio-950">
                  <Check size={11} />
                </span>
              )}
            </button>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-studio-400">{p.label}</span>
              <div className="flex">
                <IconButton
                  label={`Move page ${i + 1} earlier`}
                  disabled={i === 0}
                  className="h-6 w-6"
                  onClick={() => void move(i, i - 1)}
                >
                  <ArrowUp size={11} />
                </IconButton>
                <IconButton
                  label={`Move page ${i + 1} later`}
                  disabled={i === info.pages.length - 1}
                  className="h-6 w-6"
                  onClick={() => void move(i, i + 1)}
                >
                  <ArrowDown size={11} />
                </IconButton>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          onClick={() => void runAction("extract")}
          disabled={!selection.length}
        >
          Extract selected
        </Button>
        <Button variant="primary" onClick={onClose}>
          Back to your document
        </Button>
      </div>
    </Modal>
  );
}
export async function benchmarkScenario(
  duration = 6000,
): Promise<BenchmarkReport> {
  const viewport = document.querySelector(
    '[data-testid="document-viewport"]',
  ) as HTMLElement;
  const canvas = document.querySelector(
    '[data-page="0"] canvas',
  ) as HTMLCanvasElement;
  if (!viewport) throw new Error("Open a document to run the benchmark.");
  const original = viewport.scrollTop;
  metrics.start();
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const animate = (now: number) => {
      const elapsed = now - started;
      if (elapsed >= duration) {
        resolve();
        return;
      }
      const range = Math.min(
        3500,
        viewport.scrollHeight - viewport.clientHeight,
      );
      viewport.scrollTop =
        ((Math.sin(elapsed / 800 - Math.PI / 2) + 1) / 2) * range;
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  });
  viewport.scrollTop = original;
  return metrics.stop(
    "Real document: continuous scrolling and visible-page rendering",
  );
}
function PerformanceLab({ onClose }: { onClose: () => void }) {
  const report = useApp((s) => s.report),
    [running, setRunning] = useState(false),
    manual = useApp((s) => s.recording);
  const run = async () => {
    setRunning(true);
    try {
      useApp.setState({ dialog: null });
      const report = await benchmarkScenario();
      useApp.setState({ report, dialog: "benchmark" });
    } catch (e) {
      useApp.getState().fail(e);
    } finally {
      setRunning(false);
    }
  };
  return (
    <Modal
      title="Performance, measured."
      description="Real browser frames. Real document work. No simulated FPS claims."
      onClose={onClose}
      wide
    >
      <div className="grid gap-3 md:grid-cols-[1fr_1.1fr]">
        <div>
          <div className="rounded-lg border border-lime-400/15 bg-lime-400/[.04] p-3">
            <span className="text-xs uppercase tracking-widest text-lime-300">
              Interaction target
            </span>
            <div className="my-3 flex items-end gap-2">
              <span className="font-display text-2xl font-medium tracking-tighter text-white">
                120
              </span>
              <span className="mb-1 text-sm text-studio-400">
                frames / second
              </span>
            </div>
            <p className="text-xs leading-6 text-studio-400">
              A frame every 8.33 ms. Actual presentation rate is limited by the
              device’s display, browser scheduling, power mode, and document
              complexity.
            </p>
          </div>
          <div className="mt-3 space-y-3">
            <Button
              variant="primary"
              className="w-full"
              disabled={running}
              onClick={() => void run()}
            >
              <Play size={15} />
              Run document benchmark
            </Button>
            <Button
              className="w-full text-xs"
              onClick={() => {
                if (!manual) {
                  metrics.start();
                  useApp.setState({ recording: true });
                  useApp
                    .getState()
                    .notify(
                      "Recording. Close this panel, interact, then reopen to stop.",
                    );
                } else {
                  useApp.setState({
                    report: metrics.stop(
                      "Manual interaction: draw, zoom, and navigate",
                    ),
                  });
                  useApp.setState({ recording: false });
                }
              }}
            >
              <Activity size={15} />
              {manual ? "Stop recording" : "Record manual interaction"}
            </Button>
            {report && (
              <Button
                className="w-full text-xs"
                variant="ghost"
                onClick={() =>
                  download(
                    JSON.stringify(
                      { ...report, cache: renderQueue.stats() },
                      null,
                      2,
                    ),
                    "pdfweld-performance.json",
                    "application/json",
                  )
                }
              >
                <Download size={14} />
                Download benchmark JSON
              </Button>
            )}
          </div>
          <p className="mt-4 text-xs leading-5 text-studio-600">
            For repeatable cold/warm, desktop/mobile, and 100-page workloads,
            run npm run benchmark. Reports retain browser details, viewport,
            percentile frame times, long tasks, and render latency.
          </p>
        </div>
        <div>
          {report ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <Badge>
                  {Math.round(report.displayHz)} Hz measured cadence
                </Badge>
                <Badge
                  className={
                    report.targetMet ? "text-lime-300" : "text-amber-300"
                  }
                >
                  {report.targetMet
                    ? "120 FPS target met"
                    : "120 FPS not established"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Average FPS", report.fps.toFixed(1)],
                  ["Frame p95", `${report.frameP95.toFixed(2)} ms`],
                  ["Frame p99", `${report.frameP99.toFixed(2)} ms`],
                  ["Input CPU p95", `${report.inputP95.toFixed(2)} ms`],
                  ["Render p95", `${report.renderP95.toFixed(1)} ms`],
                  [
                    "Long tasks",
                    report.longTasks === null
                      ? "Unavailable"
                      : String(report.longTasks),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-white/[.035] p-4">
                    <p className="text-xs text-studio-600">{label}</p>
                    <p className="mt-2 font-display text-xl font-medium text-white">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-studio-600">
                {report.notes.join(" ")}
              </p>
            </>
          ) : (
            <div className="flex h-full min-h-60 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 p-4 text-center">
              <Activity
                size={35}
                strokeWidth={1}
                className="mb-3 text-studio-600"
              />
              <h3 className="text-sm text-studio-200">
                Let the numbers speak.
              </h3>
              <p className="mt-3 text-xs leading-6 text-studio-600">
                Run a benchmark to see how this document performs on this
                device.
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
function DocumentCheck({ onClose }: { onClose: () => void }) {
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof engine.call<"check">>
  > | null>(null);
  useEffect(() => {
    engine.call("check").then(setResult).catch(useApp.getState().fail);
  }, []);
  return (
    <Modal title="A closer look at your document" onClose={onClose}>
      {result ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Pages", result.pages],
              ["Fonts", result.fonts],
              ["Images", result.images],
              ["Fields", result.fields],
              ["Annotations", result.annotations],
              ["Unembedded fonts", result.unembedded],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-white/5 p-3">
                <span className="text-xs text-studio-600">{label}</span>
                <p className="mt-2 text-lg text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="my-5 space-y-3">
            {result.warnings.map((w) => (
              <p
                key={w}
                className="rounded-lg bg-amber-300/5 p-3 text-xs leading-relaxed text-amber-200/80"
              >
                {w}
              </p>
            ))}
          </div>
          <p className="text-xs leading-5 text-studio-600">{result.note}</p>
          <Button
            className="mt-3 w-full"
            onClick={() =>
              download(
                JSON.stringify(result, null, 2),
                "document-check.json",
                "application/json",
              )
            }
          >
            Export report
          </Button>
        </>
      ) : (
        <Empty icon={<LoaderCircle className="animate-spin" size={24} />}>
          Inspecting document…
        </Empty>
      )}
    </Modal>
  );
}
function Compare({ onClose }: { onClose: () => void }) {
  const [result, setResult] = useState<
      { page: number; same: boolean; before: string; after: string }[] | null
    >(null),
    [name, setName] = useState(""),
    [loading, setLoading] = useState(false);
  const compare = async () => {
    const [file] = await pickFile(".pdf");
    if (!file) return;
    setName(file.name);
    setLoading(true);
    try {
      const { EngineClient } = await import("../lib/client");
      const other = new EngineClient();
      try {
        const info = await other.call(
          "open",
          new Uint8Array(await file.arrayBuffer()),
          file.name,
        );
        const original = useApp.getState().info!;
        const rows = [];
        for (
          let i = 0;
          i < Math.max(info.pages.length, original.pages.length);
          i++
        ) {
          const before =
              i < original.pages.length ? await engine.call("text", i) : "",
            after = i < info.pages.length ? await other.call("text", i) : "";
          rows.push({
            page: i,
            same: before.trim() === after.trim(),
            before,
            after,
          });
        }
        setResult(rows);
      } finally {
        other.dispose();
      }
    } catch (e) {
      useApp.getState().fail(e);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal
      title="Two documents. A clearer picture."
      description="Compare extracted page text. Visual layout, images, and formatting changes are not included."
      onClose={onClose}
      wide
    >
      <Button onClick={() => void compare()} disabled={loading}>
        <Columns2 size={16} />
        {loading ? "Comparing…" : name || "Choose another PDF"}
      </Button>
      {result && (
        <>
          <p className="my-5 text-xs text-studio-400">
            {result.filter((r) => !r.same).length} of {result.length} pages have
            different text.
          </p>
          <div className="max-h-[50dvh] space-y-4 overflow-auto">
            {result
              .filter((r) => !r.same)
              .map((r) => (
                <section
                  key={r.page}
                  className="rounded-lg border border-white/10 p-4"
                >
                  <h3 className="mb-3 text-xs text-lime-300">
                    Page {r.page + 1}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <pre className="whitespace-pre-wrap rounded-lg bg-red-300/5 p-3 font-sans text-xs leading-5 text-studio-400">
                      {r.before || "(Page absent)"}
                    </pre>
                    <pre className="whitespace-pre-wrap rounded-lg bg-lime-300/5 p-3 font-sans text-xs leading-5 text-studio-400">
                      {r.after || "(Page absent)"}
                    </pre>
                  </div>
                </section>
              ))}
          </div>
          <Button
            className="mt-4 text-xs"
            onClick={() =>
              download(
                JSON.stringify(result, null, 2),
                "comparison.json",
                "application/json",
              )
            }
          >
            Export comparison
          </Button>
        </>
      )}
    </Modal>
  );
}
