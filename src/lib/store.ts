import { create } from "zustand";
import { engine } from "./client";
import { library, download, pickFile } from "./files";
import { thumbnails } from "./thumbnails";
import type { HomeToolId } from "./home-tools";
import type {
  BenchmarkReport,
  DocumentInfo,
  Mark,
  Operation,
  Panel,
  Tool,
  TextDraft,
} from "./types";
export interface PromptField {
  key: string;
  label: string;
  value?: string;
  type?: string;
  options?: string[];
  required?: boolean;
}
export interface PromptConfig {
  title: string;
  description?: string;
  fields: PromptField[];
  submit?: string;
  danger?: boolean;
  resolve: (value: Record<string, string> | null) => void;
}
interface State {
  info: DocumentInfo | null;
  id: string;
  page: number;
  revision: number;
  dirty: boolean;
  busy: string;
  error: string;
  toast: string;
  tool: Tool;
  panel: Panel;
  dialog: string | null;
  prompt: PromptConfig | null;
  color: string;
  width: number;
  textSize: number;
  textDraft: TextDraft | null;
  appearanceOpen: boolean;
  opacity: number;
  author: string;
  zoom: number;
  layout: "continuous" | "single" | "spread";
  selection: number[];
  searchQuery: string;
  report: BenchmarkReport | null;
  recording: boolean;
  autosaveStatus: string;
  image: Uint8Array | null;
  imageAspectRatio: number;
  imageLabel: string;
  selectedAnnotation: { page: number; id: number } | null;
  signatureGroup: string | null;
  homeTool: HomeToolId | null;
  homeAction: string | null;
  workspaceMode: "edit" | "fill-sign";
  set: (values: Partial<State>) => void;
  open: (
    data: Uint8Array,
    name: string,
    id?: string,
    mode?: "edit" | "fill-sign",
    password?: string,
  ) => Promise<void>;
  openPicker: () => Promise<void>;
  demo: () => Promise<void>;
  update: (info: DocumentInfo) => void;
  act: (op: Operation) => Promise<void>;
  mark: (mark: Mark) => Promise<void>;
  commitText: () => Promise<void>;
  save: () => Promise<void>;
  recover: () => Promise<void>;
  notify: (text: string) => void;
  fail: (error: unknown) => void;
}
const savedAuthor = () => {
  try {
    return localStorage.getItem("pdfweld-author") || "You";
  } catch {
    return "You";
  }
};
const documentId = () =>
  crypto.randomUUID?.() ||
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
let autoTimer: ReturnType<typeof setTimeout> | undefined;
export const useApp = create<State>((set, get) => ({
  info: null,
  id: "",
  page: 0,
  revision: 0,
  dirty: false,
  busy: "",
  error: "",
  toast: "",
  tool: "select",
  panel: "pages",
  dialog: null,
  prompt: null,
  color: "#b8ce5d",
  width: 2.5,
  textSize: 18,
  textDraft: null,
  appearanceOpen: false,
  opacity: 1,
  author: savedAuthor(),
  zoom: 1,
  layout: "continuous",
  selection: [],
  searchQuery: "",
  report: null,
  recording: false,
  autosaveStatus: "All changes saved locally",
  image: null,
  imageAspectRatio: 1,
  imageLabel: "Image",
  selectedAnnotation: null,
  signatureGroup: null,
  homeTool: null,
  homeAction: null,
  workspaceMode: "edit",
  set,
  notify: (text) => {
    set({ toast: text });
    setTimeout(() => {
      if (get().toast === text) set({ toast: "" });
    }, 3500);
  },
  fail: (error) =>
    set({
      busy: "",
      error: error instanceof Error ? error.message : String(error),
    }),
  open: async (data, name, id, mode = "edit", password = "") => {
    if (get().busy) {
      get().notify(
        "Finish the current operation before opening another document.",
      );
      return;
    }
    if (get().textDraft) {
      await get().commitText();
      if (get().textDraft || get().busy) return;
    }
    // Claim the session before persistence and worker calls; a pending text
    // draft above owns its own busy operation before handing off this open.
    set({ busy: "Preparing document…", error: "" });
    thumbnails.cancel();
    clearTimeout(autoTimer);
    if (get().dirty) await persist();
    set({ busy: "Opening document…", error: "" });
    try {
      let info;
      try {
        info = await engine.call("open", data, name, password);
      } catch (e) {
        if ((e as Error).message !== "PASSWORD_REQUIRED") throw e;
        const answer = await ask({
          title: "Unlock document",
          description: "The password stays on your device.",
          fields: [
            {
              key: "password",
              label: "Document password",
              type: "password",
              required: true,
            },
          ],
          submit: "Unlock",
        });
        if (!answer) {
          set({ busy: "" });
          return;
        }
        info = await engine.call("open", data, name, answer.password);
      }
      const key = id || documentId();
      // Capture while this open still owns the worker session. Viewing a file
      // must create a preview even when the document is never edited.
      let thumbnail: Uint8Array | undefined;
      try {
        thumbnail = await engine.call("thumbnail");
      } catch {
        /* A preview failure must not prevent opening the document. */
      }
      // Commit activity before exposing the editor. A quick return to Home
      // must read this open's timestamp rather than the previous library row.
      let autosaveStatus = "Saved in your library";
      try {
        await library.files.put({
          id: key,
          name,
          bytes: data,
          updated: Date.now(),
          pages: info.pages.length,
          thumbnail,
        });
      } catch {
        autosaveStatus = "Recovery unavailable — export your PDF";
      }
      set({
        info,
        id: key,
        page: 0,
        revision: get().revision + 1,
        dirty: false,
        busy: "",
        tool: "select",
        selectedAnnotation: null,
        textDraft: null,
        appearanceOpen: false,
        homeTool: null,
        homeAction: null,
        workspaceMode: mode,
        ...(mode === "fill-sign" ? { color: "#29372f" } : {}),
        zoom: 1,
        selection: [],
        panel:
          innerWidth < 768 ? null : mode === "fill-sign" ? "forms" : "pages",
        autosaveStatus,
      });
      if (navigator.storage?.persist) void navigator.storage.persist();
    } catch (e) {
      get().fail(e);
    }
  },
  openPicker: async () => {
    if (get().busy) return;
    const files = await pickFile(".pdf,application/pdf");
    if (files[0])
      await get().open(
        new Uint8Array(await files[0].arrayBuffer()),
        files[0].name,
      );
  },
  demo: async () => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}field-notes.pdf`);
      await get().open(
        new Uint8Array(await r.arrayBuffer()),
        "Field Notes.pdf",
      );
    } catch (e) {
      get().fail(e);
    }
  },
  update: (info) => {
    set({
      info,
      dirty: true,
      revision: get().revision + 1,
      page: Math.min(get().page, info.pages.length - 1),
      autosaveStatus: "Saving to your device…",
    });
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => void persist(), 1200);
  },
  act: async (op) => {
    if (get().busy) return;
    if (get().textDraft) {
      await get().commitText();
      if (get().textDraft || get().busy) return;
    }
    set({
      busy:
        op.type === "redact"
          ? "Removing redacted content…"
          : "Updating document…",
    });
    try {
      get().update(await engine.call("action", op));
      set({ busy: "" });
    } catch (e) {
      get().fail(e);
    }
  },
  mark: async (mark) => {
    if (get().busy) return;
    try {
      const info = await engine.call("addMark", mark);
      if (!("unchanged" in info && info.unchanged)) get().update(info);
    } catch (e) {
      get().fail(e);
    }
  },
  commitText: async () => {
    const s = get(),
      draft = s.textDraft;
    if (!s.info || !draft || s.busy) return;
    if (!draft.text.trim() && draft.id === undefined) {
      set({ textDraft: null, selectedAnnotation: null });
      return;
    }
    set({ busy: "Saving text…", error: "" });
    try {
      const info =
        draft.id !== undefined
          ? await engine.call(
              "action",
              !draft.text.trim()
                ? { type: "annotation-delete", page: draft.page, id: draft.id }
                : {
                    type: "annotation-style",
                    page: draft.page,
                    id: draft.id,
                    text: draft.text,
                    color: draft.color,
                    fontSize: draft.fontSize,
                    opacity: draft.opacity,
                    rect: draft.rect,
                  },
            )
          : await engine.call("addMark", {
              tool: draft.kind,
              page: draft.page,
              rect: draft.rect,
              text: draft.text,
              color: draft.color,
              width: draft.fontSize,
              opacity: draft.opacity,
              replaceRect: draft.replaceRect,
              author: s.author,
            });
      s.update(info);
      const details = await engine.call("details", draft.page);
      const added =
        draft.id !== undefined
          ? details.annotations.find((a) => a.id === draft.id)
          : details.annotations[details.annotations.length - 1];
      set({
        textDraft: null,
        busy: "",
        tool: "select",
        selectedAnnotation: added ? { page: draft.page, id: added.id } : null,
      });
    } catch (error) {
      s.fail(error);
    }
  },
  save: async () => {
    if (!get().info || get().busy) return;
    if (get().textDraft) {
      await get().commitText();
      if (get().textDraft || get().busy) return;
    }
    set({ busy: "Preparing PDF…" });
    try {
      const data = await engine.call("save");
      download(data, get().info!.name);
      await persist(await engine.call("saveEditable"));
      set({ dirty: false, busy: "" });
      get().notify("PDF exported. A recovery copy is saved locally.");
    } catch (e) {
      get().fail(e);
    }
  },
  recover: async () => {
    const last = await library.files.orderBy("updated").last();
    if (last) await get().open(last.bytes, last.name, last.id);
  },
}));
// A signature session lasts until Done or a tool change, never a timeout
// between pen strokes. Each session gets a new PDF annotation group.
useApp.subscribe((state, previous) => {
  if (
    state.signatureGroup &&
    (state.tool !== "signature" || state.id !== previous.id)
  )
    useApp.setState({ signatureGroup: null });
});
export function startSignature() {
  useApp.setState({
    tool: "signature",
    signatureGroup: documentId(),
    selectedAnnotation: null,
  });
}
export async function persist(bytes?: Uint8Array) {
  const s = useApp.getState();
  if (s.busy === "Opening document…") return;
  if (!s.info) return;
  if (!bytes && !s.dirty) return;
  try {
    const data = bytes || (await engine.call("saveEditable"));
    let thumbnail: Uint8Array | undefined;
    try {
      thumbnail = await engine.call("thumbnail");
    } catch {
      /* Keep recovery usable even when a page cannot be previewed. */
    }
    await library.files.put({
      id: s.id,
      name: s.info.name,
      bytes: data,
      updated: Date.now(),
      pages: s.info.pages.length,
      thumbnail,
    });
    if (useApp.getState().id === s.id)
      useApp.setState({ autosaveStatus: "Saved in your library" });
  } catch {
    useApp.setState({
      autosaveStatus: "Recovery storage unavailable — export your PDF",
    });
  }
}
export function ask(
  config: Omit<PromptConfig, "resolve">,
): Promise<Record<string, string> | null> {
  return new Promise((resolve) =>
    useApp.setState({ prompt: { ...config, resolve } }),
  );
}
export async function confirmAction(
  title: string,
  description: string,
  submit = "Continue",
) {
  const result = await ask({
    title,
    description,
    fields: [],
    submit,
    danger: true,
  });
  return result !== null;
}
