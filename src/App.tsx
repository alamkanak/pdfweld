import { Component, useEffect, useLayoutEffect, type ReactNode } from "react";
import { useApp, persist } from "./lib/store";
import { Home } from "./components/Home";
import { Workspace } from "./components/Workspace";
import { Dialogs, benchmarkScenario } from "./components/Dialogs";
import { Notifications, PromptDialog, Button } from "./components/ui";
import { drawingTools } from "./lib/tools";
import { chooseTool } from "./lib/actions";
import { renderQueue } from "./lib/render-queue";
import { engine } from "./lib/client";
import { metrics } from "./lib/performance";
import { AppUpdates } from "./components/AppUpdates";
import { consumeUpdateReload } from "./lib/app-update";
import type { Operation } from "./lib/types";
import { installPublicNavigation } from "./seo/navigation";
import { commitTextDraft } from "./lib/text-editing";
declare global {
  interface Window {
    pdfweld: {
      state: () => ReturnType<typeof useApp.getState>;
      openSample: () => Promise<void>;
      openBenchmark: () => Promise<void>;
      openScans: () => Promise<void>;
      action: (op: Operation) => Promise<void>;
      engine: typeof engine;
      benchmark: typeof benchmarkScenario;
      metrics: typeof metrics;
      cache: () => ReturnType<typeof renderQueue.stats>;
    };
  }
}
export default function App() {
  useEffect(installPublicNavigation, []);
  const info = useApp((s) => s.info),
    revision = useApp((s) => s.revision),
    id = useApp((s) => s.id);
  useLayoutEffect(
    () => renderQueue.setEpoch(`${id}-${revision}`),
    [id, revision],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = useApp.getState(),
        typing = (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"]',
        );
      if (s.prompt || s.dialog) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void s.openPicker();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void commitTextDraft().then(() => {
          if (!useApp.getState().textDraft) void useApp.getState().save();
        });
        return;
      }
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.set({ dialog: "commands" });
        return;
      }
      if (typing) return;
      if (mod && e.key.toLowerCase() === "f" && s.info) {
        e.preventDefault();
        s.set({ panel: "search" });
        return;
      }
      if (mod && e.key.toLowerCase() === "z" && s.info) {
        e.preventDefault();
        if (e.shiftKey ? s.info.canRedo : s.info.canUndo)
          void s.act({ type: e.shiftKey ? "redo" : "undo" });
        return;
      }
      if (!mod && s.info) {
        const t = drawingTools.find(
          (t) => "key" in t && t.key?.toLowerCase() === e.key.toLowerCase(),
        );
        if (t) void chooseTool(t.id);
        if (e.key === "Escape")
          s.set({ tool: "select", panel: innerWidth < 768 ? null : s.panel });
      }
    };
    const before = (e: BeforeUnloadEvent) => {
      if (consumeUpdateReload()) return;
      if (useApp.getState().dirty || useApp.getState().textDraft?.text.trim()) {
        e.preventDefault();
      }
    };
    const hidden = () => {
      if (document.visibilityState === "hidden")
        void commitTextDraft().then(() => persist());
    };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", before);
    document.addEventListener("visibilitychange", hidden);
    window.pdfweld = {
      state: () => useApp.getState(),
      openSample: () => useApp.getState().demo(),
      openBenchmark: async () => {
        const data = await fetch(
          `${import.meta.env.BASE_URL}benchmark-100-pages.pdf`,
        ).then((r) => r.arrayBuffer());
        await useApp.getState().open(new Uint8Array(data), "Benchmark.pdf");
      },
      openScans: async () => {
        const data = await fetch(
          `${import.meta.env.BASE_URL}benchmark-scans.pdf`,
        ).then((r) => r.arrayBuffer());
        await useApp
          .getState()
          .open(new Uint8Array(data), "Scanned benchmark.pdf");
      },
      action: (op) => useApp.getState().act(op),
      engine,
      benchmark: benchmarkScenario,
      metrics,
      cache: () => renderQueue.stats(),
    };
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  return (
    <ErrorBoundary>
      {info ? <Workspace /> : <Home />}
      <Dialogs />
      <PromptDialog />
      <Notifications />
      <AppUpdates />
    </ErrorBoundary>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="flex h-full flex-col items-center justify-center gap-5 bg-studio-900 px-8 text-center">
        <h1 className="font-display text-2xl text-white">
          Let’s get your studio back.
        </h1>
        <p className="max-w-sm text-sm leading-6 text-studio-400">
          {this.state.error}
        </p>
        <Button onClick={() => location.reload()}>Reload studio</Button>
        <p className="text-xs text-studio-600">
          Your exported files and local recovery library are preserved.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
