import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronRight,
  Clock3,
  FilePlus2,
  FileText,
  FolderOpen,
  Grid2X2,
  Image,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Upload,
  List,
  LoaderCircle,
  House,
  Wrench,
} from "lucide-react";
import { useApp, confirmAction } from "../lib/store";
import { library } from "../lib/files";
import { imagesToPDF, newDocument, startHomeTool } from "../lib/actions";
import { HomeTools, RecommendedTools } from "./HomeTools";
import { ToolWorkspace } from "./ToolWorkspace";
import type { HomeToolId } from "../lib/home-tools";
import { PublicOverview } from "../seo/PublicContent";
import {
  thumbnails,
  thumbnailBlob,
  type ThumbnailResult,
} from "../lib/thumbnails";
import { useVisible } from "../hooks/use-visible";
import { useMediaQuery } from "../hooks/use-media-query";
import { ResizablePane } from "./ResizablePane";
import { PaneToolbar, PaneSectionHeader } from "./PaneLayout";
import clsx from "clsx";
import type { RecentFile } from "../lib/types";
import {
  Button,
  IconButton,
  SearchField,
  Modal,
  NavigationButton,
  Empty,
} from "./ui";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img
        src={`${import.meta.env.BASE_URL}icon.svg`}
        alt=""
        className="h-7 w-7 rounded-lg"
      />
      {!compact && (
        <span className="font-display text-base font-bold tracking-tight text-white">
          pdfweld<span className="text-lime-400">.</span>
        </span>
      )}
    </span>
  );
}

function DocumentPreview({
  file,
  small = false,
}: {
  file: RecentFile;
  small?: boolean;
}) {
  const { ref, visible } = useVisible("160px");
  const [result, setResult] = useState<ThumbnailResult>(() => ({
    blob: file.thumbnail ? thumbnailBlob(file.thumbnail) : undefined,
    status: file.thumbnail ? "ready" : "cancelled",
  }));
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void thumbnails
      .request(file, () => active)
      .then((next) => {
        if (active) setResult(next);
      });
    return () => {
      active = false;
    };
  }, [file.id, file.updated, file.thumbnail, visible]);
  useEffect(() => {
    if (!result.blob) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(result.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [result.blob]);
  return (
    <div
      ref={ref}
      className="h-full w-full"
      data-thumbnail-state={result.status}
    >
      {!visible ? null : url && result.status === "ready" ? (
        <img
          src={url}
          alt={`${file.name} thumbnail`}
          className="h-full w-full object-cover object-center"
          onError={() => setResult({ status: "unavailable" })}
        />
      ) : result.status === "locked" || result.status === "unavailable" ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-studio-800 text-studio-400">
          {result.status === "locked" ? (
            <LockKeyhole size={small ? 18 : 28} />
          ) : (
            <FileText size={small ? 18 : 28} strokeWidth={1} />
          )}
          <span className={small ? "sr-only" : "text-xs"}>
            {result.status === "locked"
              ? "Open to unlock preview"
              : "Preview unavailable"}
          </span>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center bg-studio-800 text-studio-400">
          <LoaderCircle size={small ? 16 : 24} className="animate-spin" />
          <span className="sr-only">Loading preview</span>
        </div>
      )}
    </div>
  );
}

function DocumentCard({
  title,
  description,
  preview,
  onOpen,
  label,
  tag,
  children,
}: {
  title: string;
  description: string;
  preview: ReactNode;
  onOpen: () => void;
  label: string;
  tag?: string;
  children?: ReactNode;
}) {
  return (
    <div className="group relative min-w-0">
      <button
        onClick={onOpen}
        aria-label={label}
        className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-lime-300"
      >
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-white/10 bg-studio-850 transition-colors group-hover:border-white/30 md:aspect-[4/3]">
          {preview}
          {tag && (
            <span className="absolute left-2 top-2 rounded-lg bg-studio-900/90 px-2 py-1 text-xs text-studio-200">
              {tag}
            </span>
          )}
        </div>
        <h3
          className={clsx(
            "mt-2 truncate text-sm font-medium text-studio-200",
            children && "pr-10",
          )}
        >
          {title}
        </h3>
        <p
          className={clsx(
            "mt-0.5 truncate text-xs text-studio-400",
            children && "pr-10",
          )}
        >
          {description}
        </p>
      </button>
      {children}
    </div>
  );
}

export function Home({ staticTool }: { staticTool?: HomeToolId | null } = {}) {
  const s = useApp.getState();
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"home" | "tools" | "all" | "recent">("home");
  const selectedTool = useApp((state) => state.homeTool);
  const homeTool = staticTool === undefined ? selectedTool : staticTool;
  const [drag, setDrag] = useState(false);
  const [about, setAbout] = useState(false);
  const desktop = useMediaQuery("(min-width: 768px)");
  const [view, setView] = useState<"list" | "grid">(() => {
    try {
      return localStorage.getItem("pdfweld-library-view") === "grid"
        ? "grid"
        : "list";
    } catch {
      return "list";
    }
  });
  const list = desktop && view === "list";
  useEffect(() => {
    let active = true;
    library.files
      .toArray()
      .then((rows) => {
        if (active) setFiles(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
      thumbnails.cancel();
    };
  }, []);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const shown = files
    .filter(
      (file) =>
        file.name.toLowerCase().includes(filter.toLowerCase()) &&
        (tab !== "recent" || file.updated >= cutoff),
    )
    .sort((a, b) =>
      tab === "all" ? a.name.localeCompare(b.name) : b.updated - a.updated,
    );
  const drop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (homeTool) return;
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped[0]?.type.startsWith("image/")) await imagesToPDF(dropped);
    else if (dropped[0])
      await s.open(
        new Uint8Array(await dropped[0].arrayBuffer()),
        dropped[0].name,
      );
  };
  const changeView = (next: "list" | "grid") => {
    setView(next);
    try {
      localStorage.setItem("pdfweld-library-view", next);
    } catch {}
  };
  const removeFile = async (file: RecentFile) => {
    if (
      await confirmAction(
        "Remove recovery copy?",
        "The downloaded original file is unaffected.",
        "Remove",
      )
    ) {
      await library.files.delete(file.id);
      setFiles((current) => current.filter((f) => f.id !== file.id));
    }
  };
  const navigation = (
    <nav
      aria-label="Library navigation"
      className="flex min-w-0 items-center gap-1 overflow-x-auto md:flex-col md:items-stretch md:overflow-visible md:px-2"
    >
      <NavigationButton
        className="max-md:px-2 md:justify-start"
        active={tab === "home" && !homeTool}
        onClick={() => {
          setTab("home");
          s.set({ homeTool: null, homeAction: null });
        }}
      >
        <House size={16} className="hidden md:block" />
        Home
      </NavigationButton>
      <NavigationButton
        aria-label="All tools"
        className="max-md:px-2 md:justify-start"
        active={tab === "tools" || !!homeTool}
        onClick={() => {
          setTab("tools");
          s.set({ homeTool: null, homeAction: null });
        }}
      >
        <Wrench size={16} className="hidden md:block" />
        <span className="md:hidden">Tools</span>
        <span className="hidden md:inline">All tools</span>
      </NavigationButton>
      <NavigationButton
        className="max-md:px-2 md:justify-start"
        active={tab === "all" && !homeTool}
        onClick={() => {
          setTab("all");
          s.set({ homeTool: null, homeAction: null });
        }}
      >
        <Grid2X2 size={16} className="hidden md:block" />
        My studio
      </NavigationButton>
      <NavigationButton
        className="max-md:px-2 md:justify-start"
        aria-label="Recent documents"
        active={tab === "recent" && !homeTool}
        onClick={() => {
          setTab("recent");
          s.set({ homeTool: null, homeAction: null });
        }}
      >
        <Clock3 size={16} className="hidden md:block" />
        <span className="md:hidden">Recent</span>
        <span className="hidden md:inline">Recent documents</span>
      </NavigationButton>
    </nav>
  );
  return (
    <div
      className="flex h-full flex-col bg-studio-900 pt-[env(safe-area-inset-top)]"
      onDragOver={(e) => {
        e.preventDefault();
        if (homeTool) return;
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => void drop(e)}
    >
      <div className="hidden shrink-0 border-b border-white/10 p-3 text-sm text-studio-200 [.no-js_&]:block">
        Enable JavaScript to process PDFs. Tool guides and navigation are still
        available without it.
      </div>
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 sm:px-4">
        <Logo />
        <nav aria-label="Studio actions" className="flex items-center gap-1">
          <Button
            variant="primary"
            onClick={() => void s.openPicker()}
            aria-label="Open a PDF"
            className="px-3"
          >
            <FolderOpen size={18} />
            <span className="hidden min-[360px]:inline">
              Open<span className="hidden sm:inline"> a PDF</span>
            </span>
          </Button>
          <NavigationButton
            onClick={() => void newDocument()}
            aria-label="New document"
            className="hidden sm:inline-flex"
          >
            <Plus size={18} />
            New document
          </NavigationButton>
          <IconButton
            label="New document"
            onClick={() => void newDocument()}
            className="sm:hidden"
          >
            <Plus size={19} />
          </IconButton>
          <NavigationButton
            onClick={() => startHomeTool("images-pdf")}
            aria-label="Images to PDF"
            className="hidden md:inline-flex"
          >
            <Image size={18} />
            Images to PDF
          </NavigationButton>
          <IconButton
            label="Images to PDF"
            onClick={() => startHomeTool("images-pdf")}
            className="md:hidden"
          >
            <Image size={18} />
          </IconButton>
          <IconButton label="About PDFWeld" onClick={() => setAbout(true)}>
            <MoreHorizontal size={20} />
          </IconButton>
        </nav>
      </header>
      <div className="flex min-h-0 flex-1">
        <ResizablePane
          id="library"
          label="Library"
          minWidth={192}
          maxWidth={360}
          reserve={360}
          className="border-r border-white/10"
        >
          <div className="flex items-center justify-between p-3 text-xs font-semibold uppercase tracking-wide text-studio-400">
            <span>Library</span>
            <span>{files.length}</span>
          </div>
          {navigation}
          <div className="mt-auto border-t border-white/10 p-3 text-xs leading-5 text-studio-400">
            <LockKeyhole size={14} className="mb-2" />
            Documents stay on this device.
          </div>
        </ResizablePane>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-white/10 px-3 py-1 md:hidden">
            {navigation}
          </div>
          {homeTool ? (
            <ToolWorkspace
              key={homeTool}
              id={homeTool}
              library={files}
              onClose={() => s.set({ homeTool: null, homeAction: null })}
            />
          ) : tab === "tools" ? (
            <HomeTools />
          ) : (
            <main
              data-testid="library-pane"
              className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-studio-950/20"
            >
              <PaneToolbar role="group" aria-label="Document controls">
                <SearchField
                  aria-label="Find a document"
                  placeholder="Find a document"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="w-full sm:ml-auto sm:w-56"
                  compact
                />
                <div
                  className="hidden items-center gap-1 md:flex"
                  role="group"
                  aria-label="Document view"
                >
                  <IconButton
                    label="List view"
                    active={view === "list"}
                    onClick={() => changeView("list")}
                  >
                    <List size={17} />
                  </IconButton>
                  <IconButton
                    label="Grid view"
                    active={view === "grid"}
                    onClick={() => changeView("grid")}
                  >
                    <Grid2X2 size={17} />
                  </IconButton>
                </div>
              </PaneToolbar>
              {tab === "home" && (
                <RecommendedTools onAll={() => setTab("tools")} />
              )}
              <section aria-labelledby="library-title">
                <PaneSectionHeader>
                  <div>
                    <h1
                      id="library-title"
                      className="font-display text-lg font-semibold text-white"
                    >
                      {tab === "recent" ? "Recent documents" : "Your workspace"}
                    </h1>
                    <p className="mt-0.5 text-xs text-studio-400">
                      {tab === "recent"
                        ? "Saved in the last 30 days, newest first."
                        : "Your documents, on this device."}
                    </p>
                  </div>
                  <span className="text-xs text-studio-400">
                    {shown.length}{" "}
                    {shown.length === 1 ? "document" : "documents"}
                  </span>
                </PaneSectionHeader>
                {list && tab !== "recent" && !filter && !files.length && (
                  <div className="px-3 pb-3">
                    <button
                      onClick={() => void s.demo()}
                      aria-label="Open the sample document"
                      className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-studio-850 p-3 text-left hover:bg-white/5"
                    >
                      <img
                        src={`${import.meta.env.BASE_URL}field-notes-cover.png`}
                        alt="Field Notes sample PDF cover"
                        className="h-14 w-10 object-cover object-center"
                      />
                      <span className="flex-1">
                        <strong className="block text-sm font-medium text-studio-200">
                          Explore Field Notes
                        </strong>
                        <span className="text-xs text-studio-400">
                          Try the tools with a sample PDF.
                        </span>
                      </span>
                      <ChevronRight size={17} className="text-lime-300" />
                    </button>
                  </div>
                )}
                <div data-testid="document-gallery">
                  {list ? (
                    shown.length > 0 && (
                      <table
                        aria-label="Documents"
                        className="w-full table-fixed text-left"
                      >
                        <thead className="border-y border-white/10 bg-studio-850/50 text-xs text-studio-400">
                          <tr>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="w-14 px-2 py-2 font-medium">
                              Pages
                            </th>
                            <th className="hidden w-36 px-2 py-2 font-medium lg:table-cell">
                              Modified
                            </th>
                            <th className="hidden w-20 px-2 py-2 font-medium xl:table-cell">
                              Size
                            </th>
                            <th className="w-12">
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((file) => (
                            <tr
                              key={file.id}
                              data-document-id={file.id}
                              className="group border-b border-white/[.06] hover:bg-white/[.035]"
                            >
                              <td className="min-w-0 px-3 py-2">
                                <button
                                  aria-label={`Open ${file.name}`}
                                  onClick={() =>
                                    void s.open(file.bytes, file.name, file.id)
                                  }
                                  className="flex w-full min-w-0 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-lime-300"
                                >
                                  <span className="block h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-studio-800">
                                    <DocumentPreview file={file} small />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-studio-200">
                                      {file.name}
                                    </span>
                                    <span className="mt-1 block truncate text-xs text-studio-400 lg:hidden">
                                      {new Date(
                                        file.updated,
                                      ).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                      })}
                                    </span>
                                  </span>
                                </button>
                              </td>
                              <td className="px-2 text-xs text-studio-400">
                                {file.pages}
                              </td>
                              <td className="hidden px-2 text-xs text-studio-400 lg:table-cell">
                                {new Date(file.updated).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" },
                                )}
                              </td>
                              <td className="hidden px-2 text-xs text-studio-400 xl:table-cell">
                                {Math.max(
                                  1,
                                  Math.round(file.bytes.byteLength / 1024),
                                )}{" "}
                                KB
                              </td>
                              <td className="pr-3 text-right">
                                <IconButton
                                  label={`Remove ${file.name} from library`}
                                  className="h-9 w-9"
                                  onClick={() => void removeFile(file)}
                                >
                                  <Trash2 size={15} />
                                </IconButton>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  ) : (
                    <div className="grid grid-cols-2 gap-3 px-3 pb-3 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
                      {tab !== "recent" && !filter && (
                        <DocumentCard
                          title="Field Notes"
                          description="4 pages · Sample document"
                          label="Open the sample document"
                          tag="Sample"
                          onOpen={() => void s.demo()}
                          preview={
                            <img
                              src={`${import.meta.env.BASE_URL}field-notes-cover.png`}
                              alt="Field Notes sample PDF cover"
                              className="h-full w-full object-cover object-center"
                            />
                          }
                        />
                      )}
                      {shown.map((file) => (
                        <div key={file.id} data-document-id={file.id}>
                          <DocumentCard
                            title={file.name}
                            label={`Open ${file.name}`}
                            description={`${file.pages} pages · ${new Date(file.updated).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                            preview={<DocumentPreview file={file} />}
                            onOpen={() =>
                              void s.open(file.bytes, file.name, file.id)
                            }
                          >
                            <IconButton
                              label={`Remove ${file.name} from library`}
                              className="absolute bottom-0 right-0 h-9 w-9 text-studio-400"
                              onClick={() => void removeFile(file)}
                            >
                              <Trash2 size={15} />
                            </IconButton>
                          </DocumentCard>
                        </div>
                      ))}
                      {tab !== "recent" && !filter && (
                        <button
                          onClick={() => void newDocument()}
                          className="flex aspect-[3/4] self-start flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 text-sm text-studio-400 hover:border-lime-400/50 hover:bg-white/[.025] hover:text-white md:aspect-[4/3]"
                        >
                          <FilePlus2 size={28} strokeWidth={1.5} />
                          <span>New document</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {!shown.length && (tab === "recent" || filter) && (
                  <Empty
                    icon={
                      tab === "recent" ? (
                        <Clock3 size={24} />
                      ) : (
                        <Search size={24} />
                      )
                    }
                  >
                    <strong className="text-sm font-medium text-studio-200">
                      {filter
                        ? "No documents match your search."
                        : "No recent documents."}
                    </strong>
                    <span>
                      {filter
                        ? "Try another file name."
                        : "Documents you open or edit appear here for 30 days."}
                    </span>
                    {!filter && (
                      <Button onClick={() => void s.openPicker()}>
                        Open a PDF
                      </Button>
                    )}
                  </Empty>
                )}
              </section>
              <PublicOverview onNavigate={startHomeTool} />
              <footer className="flex items-center gap-2 border-t border-white/10 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 text-xs text-studio-400 md:hidden">
                <LockKeyhole size={14} />
                Your files stay on this device.
              </footer>
            </main>
          )}
        </div>
      </div>
      {drag && (
        <div className="pointer-events-none fixed inset-2 z-50 flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-lime-400 bg-studio-900/95">
          <Upload size={36} className="text-lime-300" />
          <h2 className="text-lg font-medium text-white">
            Drop a document to open it
          </h2>
          <p className="text-sm text-studio-400">PDF, PNG, or JPEG</p>
        </div>
      )}
      {about && (
        <Modal title="About PDFWeld" onClose={() => setAbout(false)}>
          <p className="text-sm leading-6 text-studio-400">
            PDFWeld is a local PDF studio. Documents are processed in your
            browser and recovery copies stay in this device’s browser storage.
          </p>
          <p className="mt-3 text-xs leading-5 text-studio-400">
            Built with React, Tailwind, and MuPDF WebAssembly. Distributed under
            AGPL-3.0. Export important work: browser storage can be cleared by
            your device.
          </p>
          <div className="mt-3 flex gap-3 text-sm text-lime-300">
            <a href={`${import.meta.env.BASE_URL}source.zip`} download>
              Application source ↗
            </a>
            <a
              href={`${import.meta.env.BASE_URL}LICENSE.txt`}
              target="_blank"
              rel="noreferrer"
            >
              AGPL license ↗
            </a>
          </div>
          <Button className="mt-4 w-full" onClick={() => setAbout(false)}>
            Back to the studio
            <ChevronRight size={15} />
          </Button>
        </Modal>
      )}
    </div>
  );
}
