import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Undo2,
  Redo2,
  Grid2X2,
  Bookmark,
  MessageSquare,
  Search,
  MoreHorizontal,
  PanelLeft,
  SlidersHorizontal,
  Check,
  LockKeyhole,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Keyboard,
  Settings2,
  X,
  Command,
  FileText,
  Activity,
  ArrowUpRight,
  SquareCheck,
} from "lucide-react";
import { useApp, ask, persist } from "../lib/store";
import { drawingTools, toolFor } from "../lib/tools";
import { chooseTool, runAction } from "../lib/actions";
import { Button, IconButton, Badge, Input, Label } from "./ui";
import { Sidebar } from "./Sidebar";
import { Viewer, goToPage } from "./Viewer";
import { Logo } from "./Home";
import { engine } from "../lib/client";
import clsx from "clsx";
const palette = [
  { hex: "#b8ce5d", class: "bg-[#b8ce5d]" },
  { hex: "#f2ca68", class: "bg-[#f2ca68]" },
  { hex: "#eb957e", class: "bg-[#eb957e]" },
  { hex: "#82b5d6", class: "bg-[#82b5d6]" },
  { hex: "#b79ad8", class: "bg-[#b79ad8]" },
  { hex: "#29372f", class: "bg-[#29372f]" },
  { hex: "#202123", class: "bg-[#202123]" },
  { hex: "#ffffff", class: "bg-white" },
];
export function Workspace() {
  const info = useApp((s) => s.info)!,
    tool = useApp((s) => s.tool),
    color = useApp((s) => s.color),
    panel = useApp((s) => s.panel),
    busy = useApp((s) => s.busy),
    autosave = useApp((s) => s.autosaveStatus),
    page = useApp((s) => s.page),
    zoom = useApp((s) => s.zoom),
    dirty = useApp((s) => s.dirty),
    mode = useApp((s) => s.workspaceMode),
    documentId = useApp((s) => s.id);
  const [options, setOptions] = useState(false),
    [exportOpen, setExportOpen] = useState(false);
  const t = toolFor(tool);
  const fillSign = mode === "fill-sign";
  useEffect(() => {
    if (!fillSign) return;
    let active = true;
    engine
      .call("firstFormPage")
      .then((page) => {
        if (active) goToPage(page);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [fillSign, documentId]);
  return (
    <div
      data-workspace-mode={mode}
      className="flex h-full flex-col overflow-hidden bg-studio-900 pt-[env(safe-area-inset-top)]"
    >
      <header className="relative z-20 flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-white/[.07] px-2 sm:px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
          <IconButton
            label="Back to studio"
            disabled={!!busy}
            onClick={async () => {
              await persist();
              useApp.setState({
                info: null,
                panel: null,
                dirty: false,
                workspaceMode: "edit",
              });
            }}
          >
            <ArrowLeft size={18} />
          </IconButton>
          <span className="hidden sm:block">
            <Logo compact />
          </span>
          <div className="ml-1 min-w-0">
            <button
              className="flex max-w-full items-center gap-2 text-left text-xs font-medium text-white sm:text-sm"
              onClick={async () => {
                const result = await ask({
                  title: "Rename document",
                  fields: [
                    {
                      key: "name",
                      label: "Document name",
                      value: info.name.replace(/\.pdf$/i, ""),
                      required: true,
                    },
                  ],
                  submit: "Rename",
                });
                if (result) {
                  useApp
                    .getState()
                    .update(await engine.call("rename", `${result.name}.pdf`));
                  await persist();
                }
              }}
            >
              <span className="max-w-[145px] truncate sm:max-w-[240px]">
                {info.name}
              </span>
              <ChevronDown size={12} className="shrink-0 text-studio-600" />
            </button>
            <p className="mt-1 hidden items-center gap-1 text-xs text-studio-600 sm:flex">
              <span className="h-1 w-1 rounded-full bg-lime-400/70" />
              {fillSign ? `Fill & sign · ${autosave}` : autosave}
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-1 md:flex">
          <IconButton
            label="Undo (⌘Z)"
            disabled={!info.canUndo || !!busy}
            onClick={() => void useApp.getState().act({ type: "undo" })}
          >
            <Undo2 size={17} />
          </IconButton>
          <IconButton
            label="Redo (⌘⇧Z)"
            disabled={!info.canRedo || !!busy}
            onClick={() => void useApp.getState().act({ type: "redo" })}
          >
            <Redo2 size={17} />
          </IconButton>
          <span className="mx-3 h-5 w-px bg-white/10" />
          <button
            className="flex h-9 items-center gap-3 rounded-lg border border-white/[.06] bg-white/[.025] px-3 text-xs text-studio-600 hover:text-studio-400"
            onClick={() =>
              fillSign
                ? useApp.setState({ workspaceMode: "edit", panel: "pages" })
                : useApp.setState({ dialog: "commands" })
            }
          >
            <Search size={13} />
            {fillSign ? "Edit PDF" : "Find a tool"}
            <span className="rounded-lg bg-white/5 px-1 py-0.5 text-xs">
              ⌘ K
            </span>
          </button>
        </div>
        <div className="relative flex flex-1 items-center justify-end gap-1 sm:gap-3">
          <span className="hidden items-center gap-1.5 text-xs text-studio-600 xl:flex">
            <LockKeyhole size={11} />
            Only on your device
          </span>
          <IconButton
            label="More options"
            onClick={() => useApp.setState({ dialog: "commands" })}
            className="md:hidden"
          >
            <MoreHorizontal size={19} />
          </IconButton>
          <Button
            aria-label={fillSign ? "Save filled PDF" : "Export"}
            disabled={!!busy}
            variant="primary"
            onClick={() =>
              fillSign
                ? void useApp.getState().save()
                : setExportOpen(!exportOpen)
            }
            className="h-9 min-h-9 rounded-lg px-3 text-xs sm:px-4"
          >
            <Download size={15} />
            <span className="hidden sm:inline">
              {fillSign ? "Save PDF" : "Export"}
            </span>
            {!fillSign && <ChevronDown size={12} />}
          </Button>
          {exportOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setExportOpen(false)}
              />
              <div className="absolute right-0 top-12 z-40 w-52 rounded-lg border border-white/10 bg-studio-800 p-2 shadow-panel">
                {[
                  { label: "Export PDF", id: "export-pdf" },
                  { label: "Export images", id: "export-images" },
                  { label: "Export text", id: "export-text" },
                  { label: "Optimize PDF", id: "compress" },
                  { label: "Protect a copy", id: "protect" },
                  { label: "Sign with certificate", id: "certificate-sign" },
                  { label: "Print document", id: "print" },
                ].map((item) => (
                  <button
                    key={item.id}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs text-studio-400 hover:bg-white/5 hover:text-white"
                    onClick={() => {
                      setExportOpen(false);
                      void runAction(item.id);
                    }}
                  >
                    {item.label}
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>
      {info.signedFields > 0 && (
        <div
          role="note"
          className="border-b border-amber-300/15 bg-amber-300/5 px-3 py-2 text-xs text-amber-200/90"
        >
          This document contains a certificate signature. Editing can invalidate
          it. Unchanged PDF exports preserve the original signed bytes.
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        <nav
          aria-label="Workspace panels"
          className="z-10 hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-white/[.07] bg-studio-900 py-2 md:flex"
        >
          {[
            { id: "pages", label: "Page thumbnails", icon: Grid2X2 },
            fillSign
              ? { id: "forms", label: "Fill fields", icon: SquareCheck }
              : { id: "outline", label: "Bookmarks", icon: Bookmark },
            { id: "search", label: "Search document", icon: Search },
            { id: "comments", label: "Comments", icon: MessageSquare },
          ].map((item) => (
            <IconButton
              key={item.id}
              label={item.label}
              active={panel === item.id}
              onClick={() =>
                useApp.setState({
                  panel: panel === item.id ? null : (item.id as typeof panel),
                })
              }
            >
              <item.icon size={18} strokeWidth={1.65} />
            </IconButton>
          ))}
          <span className="my-3 h-px w-5 bg-white/10" />
          <IconButton
            label="All tools"
            active={panel === "tools"}
            onClick={() =>
              useApp.setState({ panel: panel === "tools" ? null : "tools" })
            }
          >
            <SlidersHorizontal size={18} strokeWidth={1.65} />
          </IconButton>
          <div className="mt-auto flex flex-col gap-1">
            <IconButton
              label="Performance lab"
              onClick={() => void runAction("benchmark")}
            >
              <Activity size={17} />
            </IconButton>
            <IconButton
              label="Document properties"
              active={panel === "properties"}
              onClick={() => void runAction("properties")}
            >
              <Settings2 size={18} />
            </IconButton>
            <IconButton
              label="Keyboard shortcuts"
              onClick={() => useApp.setState({ dialog: "shortcuts" })}
            >
              <Keyboard size={18} />
            </IconButton>
          </div>
        </nav>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative z-10 flex h-12 shrink-0 items-center justify-between gap-1 border-b border-white/[.045] bg-studio-900 px-2">
            <div className="flex items-center gap-2">
              <IconButton
                label="Show pages"
                active={panel === "pages"}
                onClick={() =>
                  useApp.setState({ panel: panel === "pages" ? null : "pages" })
                }
                className="md:hidden"
              >
                <Grid2X2 size={17} />
              </IconButton>
            </div>
            <div className="flex min-w-0 items-center overflow-x-auto rounded-lg bg-white/[.02] p-0.5">
              {fillSign && (
                <IconButton
                  label="Fill fields"
                  active={panel === "forms"}
                  onClick={() =>
                    useApp.setState({
                      panel: panel === "forms" ? null : "forms",
                    })
                  }
                  className="h-10 w-10 md:hidden"
                >
                  <SquareCheck size={18} />
                </IconButton>
              )}
              {(fillSign
                ? ["select", "text", "signature"]
                : ["select", "hand", "ink", "highlight", "text", "note"]
              ).map((id) => {
                const item = drawingTools.find((t) => t.id === id)!;
                return (
                  <IconButton
                    key={id}
                    label={`${item.label}${"key" in item ? ` (${item.key})` : ""}`}
                    active={tool === id}
                    onClick={() => void chooseTool(item.id)}
                    className={clsx(
                      "h-10 w-10",
                      ["highlight", "note"].includes(id) &&
                        "max-[359px]:hidden",
                    )}
                  >
                    <item.icon size={18} strokeWidth={1.65} />
                  </IconButton>
                );
              })}
              {!fillSign && (
                <>
                  <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
                  <IconButton
                    label="More annotation tools"
                    active={panel === "tools"}
                    onClick={() =>
                      useApp.setState({
                        panel: panel === "tools" ? null : "tools",
                      })
                    }
                    className="h-10 w-10"
                  >
                    <MoreHorizontal size={18} />
                  </IconButton>
                </>
              )}
            </div>
            <div className="relative">
              <IconButton
                label="Tool settings and color"
                active={options}
                onClick={() => setOptions(!options)}
                className="h-9 w-9"
              >
                <span
                  className={clsx(
                    "h-[21px] w-[21px] rounded-full ring-2 ring-white/10 ring-offset-2 ring-offset-studio-900",
                    palette.find((p) => p.hex === color)?.class ||
                      "bg-lime-400",
                  )}
                />
              </IconButton>
              {options && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setOptions(false)}
                  />
                  <div className="absolute right-0 top-12 z-30 w-64 rounded-lg border border-white/10 bg-studio-800 p-3 shadow-panel">
                    <ToolSettings />
                  </div>
                </>
              )}
            </div>
          </div>
          <Viewer />
          <footer className="hidden h-7 shrink-0 items-center justify-between gap-3 border-t border-white/[.045] px-3 text-xs text-studio-400 md:flex">
            <span className="min-w-0 truncate">
              {fillSign
                ? "Fill fields, add text, or place a signature. Select added elements to move them."
                : t.description}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {dirty && <span className="h-1 w-1 rounded-full bg-lime-400" />}
              {info.pages[page]?.width.toFixed(0)} ×{" "}
              {info.pages[page]?.height.toFixed(0)} pt
              <span className="mx-1 text-white/10">|</span>
              {info.permissions.edit ? "Editable" : "Restricted PDF"}
            </span>
          </footer>
        </div>
      </div>
      <nav
        aria-label="Mobile document controls"
        className="z-20 flex shrink-0 items-center justify-between border-t border-white/10 bg-studio-900 px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 md:hidden"
      >
        <IconButton
          label="Undo"
          disabled={!info.canUndo}
          onClick={() => void useApp.getState().act({ type: "undo" })}
        >
          <Undo2 size={18} />
        </IconButton>
        <IconButton
          label="Mobile search"
          onClick={() => void runAction("search")}
        >
          <Search size={18} />
        </IconButton>
        <div className="flex items-center">
          <IconButton
            label="Previous page"
            disabled={page === 0}
            onClick={() => goToPage(page - 1)}
          >
            <ChevronLeft size={17} />
          </IconButton>
          <button
            className="min-w-12 text-xs tabular-nums"
            onClick={async () => {
              const r = await ask({
                title: "Go to page",
                fields: [
                  {
                    key: "page",
                    label: `Page (1–${info.pages.length})`,
                    type: "number",
                    value: String(page + 1),
                    required: true,
                  },
                ],
              });
              if (r) goToPage(Number(r.page) - 1);
            }}
          >
            {page + 1}
            <span className="text-studio-600"> / {info.pages.length}</span>
          </button>
          <IconButton
            label="Next page"
            disabled={page === info.pages.length - 1}
            onClick={() => goToPage(page + 1)}
          >
            <ChevronRight size={17} />
          </IconButton>
        </div>
        <IconButton
          label="Mobile zoom"
          onClick={async () => {
            const r = await ask({
              title: "Zoom",
              fields: [
                {
                  key: "zoom",
                  label: "Zoom percentage",
                  value: String(Math.round(zoom * 100)),
                  type: "number",
                  required: true,
                },
              ],
            });
            if (r)
              useApp.setState({
                zoom: Math.max(0.25, Math.min(5, Number(r.zoom) / 100)),
              });
          }}
        >
          <span className="text-xs">{Math.round(zoom * 100)}%</span>
        </IconButton>
        <IconButton
          label="Mobile comments"
          onClick={() => void runAction("comments")}
        >
          <MessageSquare size={18} />
        </IconButton>
      </nav>
    </div>
  );
}
function ToolSettings() {
  const color = useApp((s) => s.color),
    width = useApp((s) => s.width),
    opacity = useApp((s) => s.opacity),
    author = useApp((s) => s.author);
  return (
    <div className="space-y-3">
      <div>
        <Label>Color</Label>
        <div className="grid grid-cols-4 gap-3">
          {palette.map((p) => (
            <button
              key={p.hex}
              aria-label={`Use color ${p.hex}`}
              onClick={() => useApp.setState({ color: p.hex })}
              className={clsx(
                "flex h-8 items-center justify-center rounded-lg",
                p.class,
                color === p.hex
                  ? "ring-2 ring-white/70 ring-offset-2 ring-offset-studio-800"
                  : "ring-1 ring-white/10",
              )}
            >
              {color === p.hex && (
                <Check
                  size={13}
                  className={
                    p.hex === "#202123" || p.hex === "#29372f"
                      ? "text-white"
                      : "text-studio-950"
                  }
                />
              )}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <Label>
          Stroke / text size{" "}
          <span className="float-right tabular-nums">{width.toFixed(1)}</span>
        </Label>
        <input
          type="range"
          aria-label="Stroke size"
          min=".5"
          max="36"
          step=".5"
          value={width}
          onChange={(e) => useApp.setState({ width: Number(e.target.value) })}
          className="h-2 w-full accent-lime-400"
        />
      </label>
      <label className="block">
        <Label>
          Opacity{" "}
          <span className="float-right">{Math.round(opacity * 100)}%</span>
        </Label>
        <input
          type="range"
          aria-label="Opacity"
          min=".1"
          max="1"
          step=".05"
          value={opacity}
          onChange={(e) => useApp.setState({ opacity: Number(e.target.value) })}
          className="h-2 w-full accent-lime-400"
        />
      </label>
      <label className="block">
        <Label>Comment author</Label>
        <Input
          className="h-9 text-xs"
          value={author}
          onChange={(e) => {
            useApp.setState({ author: e.target.value });
            try {
              localStorage.setItem("pdfweld-author", e.target.value);
            } catch {
              /* preferences are optional */
            }
          }}
        />
      </label>
    </div>
  );
}
