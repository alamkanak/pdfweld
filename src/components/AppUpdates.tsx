import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "./ui";
import { useApp, persist } from "../lib/store";
import { commitTextDraft } from "../lib/text-editing";
import { engine } from "../lib/client";
import { activateAppUpdate, reloadForAppUpdate } from "../lib/app-update";

const updateBusy = "Updating studio…";
async function idle() {
  const deadline = Date.now() + 30000;
  do {
    if (Date.now() >= deadline)
      throw new Error(
        "The current operation is still running. Try updating when it finishes.",
      );
    // Let queued annotation commits settle before claiming the update lock.
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (useApp.getState().busy);
}

export function AppUpdates() {
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const updating = useRef(false),
    panel = useRef<HTMLDivElement>(null);
  const [activated, setActivated] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const {
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    onRegisteredSW(_url, value) {
      registration.current = value;
    },
    // Activation in another tab must not reload this tab's unsaved work.
    onNeedReload() {
      if (!updating.current) setActivated(true);
    },
  });
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let previous = navigator.serviceWorker.controller;
    const changed = () => {
      const current = navigator.serviceWorker.controller;
      if (
        previous &&
        current &&
        previous !== current &&
        previous.scriptURL === current.scriptURL &&
        !updating.current
      )
        setActivated(true);
      previous = current;
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
  }, []);
  useLayoutEffect(() => {
    if (phase) panel.current?.focus({ preventScroll: true });
  }, [phase]);
  const update = async () => {
    if (updating.current) return;
    updating.current = true;
    setError("");
    setPhase(
      useApp.getState().busy
        ? "Waiting for the current operation…"
        : "Saving your work…",
    );
    let ownsBusy = false;
    try {
      await idle();
      await commitTextDraft();
      if (useApp.getState().textDraft)
        throw new Error("Your text could not be saved. Please try again.");
      await idle();
      useApp.setState({ busy: updateBusy });
      ownsBusy = true;
      const state = useApp.getState();
      // Always snapshot the open PDF: an annotation RPC may have been queued
      // before the store had a chance to mark the document dirty.
      if (state.info) {
        const bytes = await engine.call("saveEditable");
        const saved = await persist(bytes);
        if (!saved && useApp.getState().dirty)
          throw new Error(
            "Your changes could not be saved on this device. Export the PDF before updating.",
          );
      }
      setPhase("Applying update…");
      const current =
        registration.current ||
        (await navigator.serviceWorker?.getRegistration());
      await activateAppUpdate(current);
      setNeedRefresh(false);
      setActivated(false);
      setPhase("");
      reloadForAppUpdate();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The update could not finish. Please try again.",
      );
      setPhase("");
      updating.current = false;
      if (ownsBusy && useApp.getState().busy === updateBusy)
        useApp.setState({ busy: "" });
    }
  };
  if (!needRefresh && !activated && !phase && !error) return null;
  return (
    <>
      {phase && <div className="fixed inset-0 z-[69]" aria-hidden="true" />}
      <div
        ref={panel}
        role="dialog"
        aria-label="Update PDFWeld"
        aria-modal={phase ? true : undefined}
        aria-busy={!!phase}
        tabIndex={-1}
        className="fixed bottom-6 right-6 z-[70] max-w-xs rounded-lg border border-white/10 bg-studio-800 p-3 shadow-panel outline-none"
        onKeyDown={(event) => {
          if (phase) {
            event.stopPropagation();
            if (event.key === "Tab") event.preventDefault();
          }
        }}
      >
        <p className="text-sm text-white">A fresh studio is ready.</p>
        <p
          className="mb-4 mt-2 text-xs leading-5 text-studio-400"
          aria-live="polite"
        >
          {phase || "Your work will be saved locally before updating."}
        </p>
        {error && (
          <p role="alert" className="mb-3 text-xs leading-5 text-red-300">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={!!phase}
            onClick={() => void update()}
          >
            {phase && <LoaderCircle size={15} className="animate-spin" />}
            {phase ? "Updating…" : error ? "Try again" : "Update"}
          </Button>
          <Button
            variant="ghost"
            disabled={!!phase}
            onClick={() => {
              setNeedRefresh(false);
              setActivated(false);
              setError("");
            }}
          >
            Later
          </Button>
        </div>
      </div>
    </>
  );
}
