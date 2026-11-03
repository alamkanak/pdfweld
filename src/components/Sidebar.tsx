import { useEffect, useState } from "react";
import {
  X,
  Plus,
  ChevronRight,
  Search as SearchIcon,
  MessageSquare,
  Bookmark,
  Paperclip,
  Layers,
  FileText,
  Download,
  Trash2,
  Check,
  SlidersHorizontal,
  PanelLeftClose,
  ArrowUpRight,
  LoaderCircle,
  SquareCheck,
} from "lucide-react";
import { useApp, ask } from "../lib/store";
import { engine } from "../lib/client";
import { drawingTools, actionTools } from "../lib/tools";
import { chooseTool, runAction } from "../lib/actions";
import { download, pickFile } from "../lib/files";
import type { Outline, PageDetails, SearchHit } from "../lib/types";
import { Thumbnail } from "./PageView";
import { goToPage } from "./Viewer";
import {
  Button,
  IconButton,
  Input,
  SearchField,
  Label,
  Select,
  Divider,
  Empty,
  Badge,
} from "./ui";
import clsx from "clsx";
import { ResizablePane } from "./ResizablePane";
import { editText } from "../lib/text-editing";
const titles = {
  pages: "Pages",
  outline: "Bookmarks",
  comments: "Comments",
  search: "Find in document",
  tools: "Your toolkit",
  properties: "Document details",
  forms: "Form fields",
  layers: "Layers",
  attachments: "Attachments",
};
export function Sidebar() {
  const panel = useApp((s) => s.panel),
    info = useApp((s) => s.info);
  if (!panel || !info) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/45 md:hidden"
        onClick={() => useApp.setState({ panel: null })}
      />
      <ResizablePane
        key={panel}
        id={`editor-${panel}`}
        label={titles[panel]}
        sheet
        className="border-r border-white/[.07]"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3">
          <h2 className="text-sm font-semibold text-white">
            {titles[panel]}
            {panel === "pages" && (
              <span className="ml-2 text-xs font-normal text-studio-600">
                {info.pages.length}
              </span>
            )}
          </h2>
          <IconButton
            label="Close panel"
            onClick={() => useApp.setState({ panel: null })}
            className="h-8 w-8"
          >
            <PanelLeftClose size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          {panel === "pages" ? (
            <Pages />
          ) : panel === "outline" ? (
            <Bookmarks />
          ) : panel === "comments" ? (
            <Comments />
          ) : panel === "search" ? (
            <SearchPanel />
          ) : panel === "tools" ? (
            <ToolsPanel />
          ) : panel === "properties" ? (
            <Properties />
          ) : panel === "forms" ? (
            <Forms />
          ) : panel === "layers" ? (
            <LayersPanel />
          ) : (
            <Attachments />
          )}
        </div>
      </ResizablePane>
    </>
  );
}
function Pages() {
  const info = useApp((s) => s.info)!,
    page = useApp((s) => s.page);
  return (
    <div className="px-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-studio-600">Document overview</span>
        <button
          onClick={() => void runAction("organize")}
          className="text-xs text-lime-300 hover:text-lime-400"
        >
          Organize
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-1">
        {info.pages.map((p, i) => (
          <button
            key={i}
            onClick={() => {
              goToPage(i);
              if (innerWidth < 768) useApp.setState({ panel: null });
            }}
            className="group mx-auto flex w-full max-w-[138px] flex-col items-center gap-2.5"
            aria-label={`Go to page ${i + 1}`}
            aria-current={page === i ? "page" : undefined}
          >
            <div
              className={clsx(
                "w-full rounded-lg p-1 ring-1 transition-colors",
                page === i
                  ? "bg-lime-400/10 ring-lime-400"
                  : "ring-white/5 group-hover:ring-white/25",
              )}
            >
              <Thumbnail page={i} width={130} />
            </div>
            <span
              className={clsx(
                "text-xs tabular-nums",
                page === i ? "text-lime-300" : "text-studio-600",
              )}
            >
              {p.label}
            </span>
          </button>
        ))}
      </div>
      <Button
        className="mt-4 w-full text-xs"
        variant="ghost"
        onClick={() => void runAction("blank")}
      >
        <Plus size={14} />
        Add page
      </Button>
    </div>
  );
}
function Bookmarks() {
  const info = useApp((s) => s.info)!;
  const render = (items: Outline[], depth = 0): React.ReactNode =>
    items.map((item, i) => (
      <div key={`${depth}-${i}`}>
        <button
          className="flex w-full items-center gap-2 rounded-lg py-3 pr-2 text-left text-xs text-studio-400 hover:bg-white/5 hover:text-white"
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() =>
            goToPage(
              item.page ??
                Math.max(
                  0,
                  parseInt(item.uri?.match(/page=(\d+)/)?.[1] || "1") - 1,
                ),
            )
          }
        >
          <Bookmark size={13} className="shrink-0 text-studio-600" />
          <span className="flex-1">{item.title}</span>
          <span className="text-xs text-studio-600">
            {(item.page ?? 0) + 1}
          </span>
        </button>
        {item.down && render(item.down, depth + 1)}
      </div>
    ));
  return (
    <div className="px-3">
      {info.outline.length ? (
        render(info.outline)
      ) : (
        <Empty icon={<Bookmark size={24} />}>
          Keep a place worth coming back to.
        </Empty>
      )}
      <Button
        variant="ghost"
        className="mt-3 w-full text-xs"
        onClick={() => void runAction("bookmark")}
      >
        <Plus size={14} />
        Bookmark current page
      </Button>
    </div>
  );
}
function useDetails() {
  const page = useApp((s) => s.page),
    revision = useApp((s) => s.revision);
  const [details, setDetails] = useState<PageDetails | null>(null);
  useEffect(() => {
    let active = true;
    engine
      .call("details", page)
      .then((r) => {
        if (active) setDetails(r);
      })
      .catch(useApp.getState().fail);
    return () => {
      active = false;
    };
  }, [page, revision]);
  return details;
}
function Comments() {
  const details = useDetails(),
    page = useApp((s) => s.page);
  const annotations =
    details?.annotations.filter((a) => a.type !== "Redact") || [];
  return (
    <div className="px-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-studio-600">On page {page + 1}</span>
        <button
          className="text-xs text-lime-300"
          onClick={() => void chooseTool("note")}
        >
          Add comment
        </button>
      </div>
      {!annotations.length ? (
        <Empty icon={<MessageSquare size={24} />}>
          A fresh perspective starts with a note.
          <br />
          Tap Comment, then tap the page.
        </Empty>
      ) : (
        annotations
          .filter((a) => !a.replyTo)
          .map((a) => (
            <div
              key={a.id}
              className="mb-3 rounded-lg border border-white/[.06] bg-white/[.025] p-3"
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-lime-400/10 text-xs font-semibold text-lime-300">
                  {(a.author || "Y").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-white">
                    {a.author || "Unknown author"}
                  </p>
                  <p className="text-xs text-studio-600">{a.type}</p>
                </div>
                <IconButton
                  label="Delete annotation"
                  className="h-7 w-7"
                  onClick={() =>
                    void useApp
                      .getState()
                      .act({ type: "annotation-delete", page, id: a.id })
                  }
                >
                  <Trash2 size={12} />
                </IconButton>
              </div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-studio-400">
                {a.text || `${a.type} annotation`}
              </p>
              {annotations
                .filter((r) => r.replyTo === a.id)
                .map((r) => (
                  <div
                    className="mt-3 border-l border-lime-400/30 pl-3 text-xs leading-relaxed text-studio-400"
                    key={r.id}
                  >
                    <strong className="block text-xs text-white">
                      {r.author}
                    </strong>
                    {r.text}
                  </div>
                ))}
              <div className="mt-3 flex gap-3">
                <button
                  className="text-xs text-studio-600 hover:text-lime-300"
                  onClick={async () => {
                    if (a.type === "FreeText") {
                      goToPage(page);
                      editText(page, a);
                      if (innerWidth < 768) useApp.setState({ panel: null });
                      return;
                    }
                    const answer = await ask({
                      title: "Edit comment",
                      fields: [
                        {
                          key: "text",
                          label: "Comment",
                          value: a.text,
                          type: "textarea",
                          required: true,
                        },
                      ],
                    });
                    if (answer)
                      await useApp.getState().act({
                        type: "annotation-edit",
                        page,
                        id: a.id,
                        text: answer.text,
                      });
                  }}
                >
                  Edit
                </button>
                <button
                  className="text-xs text-studio-600 hover:text-lime-300"
                  onClick={async () => {
                    const answer = await ask({
                      title: "Reply to comment",
                      fields: [
                        {
                          key: "text",
                          label: "Reply",
                          type: "textarea",
                          required: true,
                        },
                      ],
                    });
                    if (answer)
                      await useApp.getState().act({
                        type: "annotation-reply",
                        page,
                        id: a.id,
                        text: answer.text,
                        author: useApp.getState().author,
                      });
                  }}
                >
                  Reply
                </button>
              </div>
            </div>
          ))
      )}
    </div>
  );
}
function SearchPanel() {
  const query = useApp((s) => s.searchQuery),
    info = useApp((s) => s.info)!,
    revision = useApp((s) => s.revision);
  const [hits, setHits] = useState<SearchHit[]>([]),
    [searching, setSearching] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setHits([]);
    if (!query.trim()) {
      setSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const all: SearchHit[] = [];
      try {
        for (let i = 0; i < info.pages.length; i++) {
          if (cancelled) return;
          all.push(...(await engine.call("search", query, i)));
          if (!cancelled) setHits([...all]);
        }
      } catch (e) {
        if (!cancelled) useApp.getState().fail(e);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, info.pages.length, revision]);
  return (
    <div className="px-3">
      <SearchField
        placeholder="Find a word or phrase…"
        value={query}
        autoFocus
        onChange={(e) => useApp.setState({ searchQuery: e.target.value })}
        className="w-full"
      />
      <p className="my-3 text-xs text-studio-600">
        {searching ? "Searching…" : `${hits.length} results`}
      </p>
      {hits.map((hit, i) => (
        <button
          key={i}
          className="mb-2 flex w-full items-center gap-3 rounded-lg bg-white/[.03] p-3 text-left hover:bg-white/[.06]"
          onClick={() => {
            goToPage(hit.page);
            window.dispatchEvent(
              new CustomEvent("pdfweld-search-hit", { detail: hit }),
            );
          }}
        >
          <span className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs text-lime-300">
            {hit.page + 1}
          </span>
          <span className="truncate text-xs">{hit.text}</span>
          <ChevronRight size={12} className="ml-auto text-studio-600" />
        </button>
      ))}
      {!query && (
        <Empty icon={<SearchIcon size={24} />}>
          Find what you are looking for, across every page.
        </Empty>
      )}
    </div>
  );
}
export function ToolsPanel({ onChoose }: { onChoose?: () => void }) {
  const [filter, setFilter] = useState("");
  return (
    <div className="px-3">
      <SearchField
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Find a tool…"
        className="mb-3 w-full"
      />
      {["Annotate", "Pages", "Edit", "Protect", "Export", "Inspect"].map(
        (group) => {
          const items =
            group === "Annotate"
              ? drawingTools.filter((t) => !["select", "hand"].includes(t.id))
              : actionTools.filter((t) => t.group === group);
          const list = items.filter((t) =>
            (t.label + " " + t.description)
              .toLowerCase()
              .includes(filter.toLowerCase()),
          );
          if (!list.length) return null;
          return (
            <section key={group} className="mb-3">
              <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-[.15em] text-studio-600">
                {group}
              </h3>
              {list.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    if (group === "Annotate") void chooseTool(t.id as any);
                    else void runAction(t.id);
                    onChoose?.();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-xs text-studio-400 hover:bg-white/5 hover:text-white"
                >
                  <t.icon size={16} className="shrink-0" />
                  <span>{t.label}</span>
                </button>
              ))}
            </section>
          );
        },
      )}
    </div>
  );
}
function Properties() {
  const info = useApp((s) => s.info)!;
  const [values, setValues] = useState({
    Title: info.title,
    Author: info.author,
    Subject: info.subject,
    Keywords: info.keywords,
  });
  useEffect(
    () =>
      setValues({
        Title: info.title,
        Author: info.author,
        Subject: info.subject,
        Keywords: info.keywords,
      }),
    [info.title, info.author, info.subject, info.keywords],
  );
  return (
    <div className="space-y-3">
      <div className="space-y-3 px-3">
        {Object.entries(values).map(([key, value]) => (
          <label key={key} className="block">
            <Label>{key}</Label>
            <Input
              value={value}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </label>
        ))}
        <Button
          className="w-full"
          variant="primary"
          onClick={() =>
            void useApp.getState().act({ type: "metadata", values })
          }
        >
          Save details
        </Button>
      </div>
      <Divider />
      <dl className="space-y-3 px-3 text-xs">
        {[
          [
            "Format",
            `PDF ${Math.floor(info.version / 10)}.${info.version % 10}`,
          ],
          ["Pages", info.pages.length],
          ["Encryption", info.encrypted ? "Protected" : "None"],
          ["Structure", info.repaired ? "Repaired on open" : "Original"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-studio-600">{k}</dt>
            <dd className="text-studio-400">{v}</dd>
          </div>
        ))}
      </dl>
      <Divider />
      <div className="px-3">
        <Button
          className="w-full text-xs"
          variant="ghost"
          onClick={() => void runAction("check")}
        >
          Run document check
          <ArrowUpRight size={14} />
        </Button>
      </div>
    </div>
  );
}
function Forms() {
  const details = useDetails(),
    page = useApp((s) => s.page);
  return (
    <div className="px-3">
      <p className="mb-3 text-xs text-studio-600">On page {page + 1}</p>
      {!details?.fields.length ? (
        <Empty icon={<SquareCheck size={24} />}>
          No form fields on this page.
          <br />
          Use Add form field to create one.
        </Empty>
      ) : (
        details.fields.map((f) => (
          <label key={`${page}-${f.id}-${f.value}`} className="mb-3 block">
            <Label>{f.label || f.name}</Label>
            {/checkbox|radio/i.test(f.type) ? (
              <input
                aria-label={f.label || f.name}
                type="checkbox"
                className="h-5 w-5 accent-lime-400"
                defaultChecked={f.value !== "Off" && f.value !== ""}
                onChange={() =>
                  void useApp
                    .getState()
                    .act({ type: "fill", page, field: f.id, value: "" })
                }
                disabled={f.readOnly}
              />
            ) : f.options.length ? (
              <Select
                defaultValue={f.value}
                onChange={(e) =>
                  void useApp.getState().act({
                    type: "fill",
                    page,
                    field: f.id,
                    value: e.target.value,
                  })
                }
              >
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            ) : (
              <Input
                defaultValue={f.value}
                disabled={f.readOnly}
                onBlur={(e) => {
                  if (e.target.value !== f.value)
                    void useApp.getState().act({
                      type: "fill",
                      page,
                      field: f.id,
                      value: e.target.value,
                    });
                }}
              />
            )}
          </label>
        ))
      )}
      <Button
        className="mt-3 w-full text-xs"
        variant="ghost"
        onClick={() => void chooseTool("field")}
      >
        <Plus size={14} />
        Add form field
      </Button>
    </div>
  );
}
function LayersPanel() {
  const info = useApp((s) => s.info)!;
  return (
    <div className="px-3">
      {!info.layers.length ? (
        <Empty icon={<Layers size={24} />}>
          This PDF has no optional content layers.
        </Empty>
      ) : (
        info.layers.map((l, i) => (
          <label
            key={i}
            className="mb-2 flex items-center gap-3 rounded-lg bg-white/5 p-3 text-xs"
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-lime-400"
              checked={l.visible}
              onChange={(e) =>
                void useApp
                  .getState()
                  .act({ type: "layer", index: i, visible: e.target.checked })
              }
            />
            {l.name}
          </label>
        ))
      )}
    </div>
  );
}
function Attachments() {
  const info = useApp((s) => s.info)!;
  return (
    <div className="px-3">
      <Button
        className="w-full text-xs"
        onClick={async () => {
          const [file] = await pickFile("*/*");
          if (file)
            await useApp.getState().act({
              type: "attachment-add",
              name: file.name,
              mime: file.type,
              data: new Uint8Array(await file.arrayBuffer()),
            });
        }}
      >
        <Plus size={14} />
        Attach a file
      </Button>
      {!info.attachments.length ? (
        <Empty icon={<Paperclip size={24} />}>
          Keep supporting files inside your PDF.
        </Empty>
      ) : (
        info.attachments.map((a) => (
          <div
            key={a.name}
            className="mt-3 rounded-lg border border-white/5 p-3"
          >
            <p className="truncate text-xs">{a.name}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-studio-600">
                {a.mime || "Embedded file"}
              </span>
              <div className="flex">
                <IconButton
                  label={`Download ${a.name}`}
                  className="h-7 w-7"
                  onClick={async () => {
                    try {
                      download(
                        await engine.call("attachment", a.name),
                        a.name,
                        a.mime,
                      );
                    } catch (e) {
                      useApp.getState().fail(e);
                    }
                  }}
                >
                  <Download size={13} />
                </IconButton>
                <IconButton
                  label={`Remove ${a.name}`}
                  className="h-7 w-7"
                  onClick={() =>
                    void useApp
                      .getState()
                      .act({ type: "attachment-delete", name: a.name })
                  }
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
