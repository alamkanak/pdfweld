import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Upload,
  Plus,
  X,
  LockKeyhole,
  LoaderCircle,
  Check,
  Download,
  FileText,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";
import { EngineClient } from "../lib/client";
import { useApp } from "../lib/store";
import { runAction } from "../lib/actions";
import { download } from "../lib/files";
import {
  getHomeTool,
  fileProblem,
  type HomeToolId,
  type TaskFile,
  type TaskOptions,
  type TaskResult,
  type TaskOutput,
} from "../lib/home-tools";
import type { DocumentInfo, RecentFile } from "../lib/types";
import { Button, IconButton, Input, Label, Select } from "./ui";
import { ResizablePane } from "./ResizablePane";
import { useMediaQuery } from "../hooks/use-media-query";
import clsx from "clsx";

type Entry = TaskFile & {
  status: "loading" | "ready" | "locked" | "error";
  info?: DocumentInfo;
  error?: string;
};
const defaults = (id: HomeToolId): TaskOptions => ({
  name: id === "images-pdf" ? "Images.pdf" : "Combined.pdf",
  every: "1",
  angle: "90",
  pages: "",
  format: "PNG",
  scale: "2",
  textFormat: "Plain text",
  pageSize: "A4",
  text: "DRAFT",
  userPassword: "",
  ownerPassword: "",
  certificatePassword: "",
  reason: "Document approval",
});
const fileSize = (size: number) =>
  size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;

function ToolSettings({
  tool,
  options,
  onChange,
  disabled,
  certificate,
  onCertificate,
}: {
  tool: HomeToolId;
  options: TaskOptions;
  onChange: (key: string, value: string) => void;
  disabled: boolean;
  certificate?: string;
  onCertificate: (file: File) => void;
}) {
  const certificateInput = useRef<HTMLInputElement>(null);
  const field = (
    key: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label className="block" key={key}>
      <Label>{label}</Label>
      <Input
        aria-label={label}
        type={type}
        value={options[key] || ""}
        required={required}
        min={type === "number" ? 1 : undefined}
        autoComplete={type === "password" ? "new-password" : undefined}
        onChange={(e) => onChange(key, e.target.value)}
      />
    </label>
  );
  const select = (key: string, label: string, values: string[]) => (
    <label className="block">
      <Label>{label}</Label>
      <Select
        aria-label={label}
        value={options[key]}
        onChange={(e) => onChange(key, e.target.value)}
      >
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </Select>
    </label>
  );
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-3 text-sm font-medium text-white">Options</legend>
      {["combine", "images-pdf"].includes(tool) &&
        field("name", "Output filename", "text", true)}
      {["combine", "images-pdf"].includes(tool) &&
        select("pageSize", "Image page size", ["A4", "US Letter", "Fit image"])}
      {["extract", "rotate", "watermark", "pdf-images", "pdf-text"].includes(
        tool,
      ) && (
        <label className="block">
          <Label>Pages</Label>
          <Input
            aria-label="Pages"
            value={options.pages}
            placeholder="All pages, or 1, 3-5"
            onChange={(e) => onChange("pages", e.target.value)}
          />
        </label>
      )}
      {tool === "split" && field("every", "Pages per file", "number", true)}
      {tool === "rotate" &&
        select("angle", "Rotation (degrees)", ["90", "180", "270"])}
      {tool === "watermark" && field("text", "Watermark text", "text", true)}
      {tool === "protect" && (
        <>
          {field("userPassword", "Password to open", "password", true)}
          {field("ownerPassword", "Owner password", "password", true)}
          <p className="text-xs leading-5 text-studio-400">
            These passwords apply to every output file. They stay on this
            device.
          </p>
        </>
      )}
      {tool === "pdf-images" && (
        <>
          {select("format", "Image format", ["PNG", "JPG", "SVG"])}
          <label className="block">
            <Label>Resolution</Label>
            <Select
              aria-label="Resolution"
              value={options.scale}
              onChange={(e) => onChange("scale", e.target.value)}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {72 * n} dpi ({n}×)
                </option>
              ))}
            </Select>
          </label>
        </>
      )}
      {tool === "pdf-text" &&
        select("textFormat", "Text format", ["Plain text", "HTML", "JSON"])}
      {tool === "certificate-sign" && (
        <>
          <input
            ref={certificateInput}
            aria-label="Certificate file"
            type="file"
            accept=".p12,.pfx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onCertificate(file);
              e.target.value = "";
            }}
          />
          <Button
            className="w-full"
            type="button"
            onClick={() => certificateInput.current?.click()}
          >
            Choose certificate
          </Button>
          {certificate && (
            <p className="break-all text-xs text-studio-400">{certificate}</p>
          )}
          {field("certificatePassword", "Certificate password", "password")}
          {field("reason", "Reason for signing")}
          <p className="text-xs leading-5 text-studio-400">
            A local P12/PFX signature. No timestamp or online validation service
            is contacted.
          </p>
        </>
      )}
      {tool === "compress" && (
        <p className="text-xs leading-5 text-studio-400">
          Lossless stream/font compression and removal of unused objects. Images
          are not downsampled. An already-smaller original is kept unchanged.
        </p>
      )}
      {tool === "fill-sign" && (
        <p className="text-xs leading-5 text-studio-400">
          Continue to a workspace for form fields, text, and drawn or uploaded
          signatures.
        </p>
      )}
      {tool === "combine" && (
        <p className="text-xs leading-5 text-studio-400">
          Files combine in the order shown. Each source gets a bookmark. Forms,
          links, layers, and attachments are carried over.
        </p>
      )}
      {tool === "compare" && (
        <p className="text-xs leading-5 text-studio-400">
          Choose exactly two PDFs. This compares extracted text, not images or
          visual layout.
        </p>
      )}
      {["edit-pdf", "organize", "crop", "redact", "ocr"].includes(tool) && (
        <p className="text-xs leading-5 text-studio-400">
          Choose a PDF here, then continue directly to this tool.
        </p>
      )}
      {["numbers", "sanitize", "flatten", "extract", "split"].includes(
        tool,
      ) && (
        <p className="text-xs leading-5 text-studio-400">
          A new copy is created. Your source files are unchanged.
        </p>
      )}
    </fieldset>
  );
}

export function ToolWorkspace({
  id,
  library,
  onClose,
}: {
  id: HomeToolId;
  library: RecentFile[];
  onClose: () => void;
}) {
  const tool = getHomeTool(id),
    desktop = useMediaQuery("(min-width: 1024px)");
  const [entries, setEntries] = useState<Entry[]>([]),
    [options, setOptions] = useState<TaskOptions>(() => defaults(id));
  const [adding, setAdding] = useState(false),
    [running, setRunning] = useState(false),
    [error, setError] = useState("");
  const [result, setResult] = useState<TaskResult | null>(null),
    [certificate, setCertificate] = useState<{
      name: string;
      bytes: Uint8Array;
    }>();
  const input = useRef<HTMLInputElement>(null),
    client = useRef(new EngineClient()),
    alive = useRef(true),
    generation = useRef(0),
    counter = useRef(0),
    dragged = useRef<string | null>(null);
  const blocked = adding || running;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      client.current.dispose();
    };
  }, []);
  const update = (key: string, patch: Partial<Entry>) =>
    setEntries((current) =>
      current.map((file) => (file.id === key ? { ...file, ...patch } : file)),
    );
  const assess = async (file: Entry) => {
    update(file.id, { status: "loading", error: "" });
    try {
      const info = await client.current.call("inspectTaskFile", file);
      const problem = fileProblem(id, info);
      if (alive.current)
        update(file.id, {
          info,
          status: problem ? "locked" : "ready",
          error: problem,
        });
    } catch (e) {
      if (alive.current)
        update(file.id, {
          status:
            (e as Error).message === "PASSWORD_REQUIRED" ? "locked" : "error",
          error:
            (e as Error).message === "PASSWORD_REQUIRED"
              ? "Password required or not accepted."
              : (e as Error).message,
        });
    }
  };
  const add = async (
    files: {
      name: string;
      bytes: Uint8Array;
      mime: string;
      libraryId?: string;
    }[],
  ) => {
    if (blocked || !files.length) return;
    const max =
      "maxFiles" in tool ? tool.maxFiles : tool.multiple ? Infinity : 1;
    if (tool.multiple && entries.length + files.length > max) {
      setError(`Choose at most ${max} files.`);
      return;
    }
    setAdding(true);
    setError("");
    setResult(null);
    const added: Entry[] = files
      .slice(0, tool.multiple ? undefined : 1)
      .map((file) => ({
        ...file,
        id: `input-${++counter.current}`,
        status: "loading",
      }));
    setEntries((current) => (tool.multiple ? [...current, ...added] : added));
    for (const file of added) {
      if (!alive.current) break;
      const image =
        (file.bytes[0] === 137 && file.bytes[1] === 80) ||
        (file.bytes[0] === 255 && file.bytes[1] === 216);
      if (
        (tool.accept === "images" && !image) ||
        (tool.accept === "pdf" && image)
      ) {
        update(file.id, {
          status: "error",
          error:
            tool.accept === "images"
              ? "Choose a PNG or JPEG image."
              : "Choose a PDF for this tool.",
        });
        continue;
      }
      await assess(file);
    }
    if (alive.current) setAdding(false);
  };
  const addUploads = async (files: File[]) => {
    if (blocked) return;
    setAdding(true);
    try {
      const values = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
          mime: file.type,
        })),
      );
      if (alive.current) {
        setAdding(false);
        await add(values);
      }
    } catch (e) {
      if (alive.current) {
        setAdding(false);
        setError((e as Error).message);
      }
    }
  };
  const reorder = (from: number, to: number) => {
    if (!blocked && to >= 0 && to < entries.length)
      setEntries((current) => {
        const next = [...current];
        next.splice(to, 0, next.splice(from, 1)[0]);
        return next;
      });
  };
  const cancel = () => {
    generation.current++;
    client.current.dispose();
    client.current = new EngineClient();
    setRunning(false);
    setError("");
  };
  const min = "minFiles" in tool ? tool.minFiles : 1;
  const ready =
    entries.length >= min && entries.every((file) => file.status === "ready");
  const run = async () => {
    if (!ready || blocked) return;
    setError("");
    if (tool.kind === "interactive") {
      const file = entries[0],
        sourceAction = useApp.getState().homeAction;
      const key = file.libraryId || `tool-${Date.now()}-${counter.current}`;
      setRunning(true);
      await useApp
        .getState()
        .open(
          file.bytes,
          file.name,
          key,
          id === "fill-sign" ? "fill-sign" : "edit",
          file.password || "",
        );
      if (useApp.getState().id === key && useApp.getState().info) {
        const action =
          sourceAction || ("action" in tool ? tool.action : undefined);
        if (action === "image") {
          useApp.setState({ panel: "tools" });
          useApp
            .getState()
            .notify("Choose Insert image to add an image to this PDF.");
        } else if (action) await runAction(action);
      } else if (alive.current) setRunning(false);
      return;
    }
    const runId = ++generation.current;
    setRunning(true);
    try {
      const response = await client.current.call("runTask", {
        tool: id,
        files: entries.map(({ info, status, error, ...file }) => file),
        options,
        certificate: certificate?.bytes,
      });
      if (alive.current && generation.current === runId) setResult(response);
    } catch (e) {
      if (alive.current && generation.current === runId)
        setError((e as Error).message);
    } finally {
      if (alive.current && generation.current === runId) setRunning(false);
    }
  };
  const downloadAll = async () => {
    if (!result?.outputs.length || running) return;
    const runId = ++generation.current;
    setRunning(true);
    try {
      download(
        await client.current.call("archiveOutputs", result.outputs),
        `${id}-results.zip`,
        "application/zip",
      );
    } catch (e) {
      if (alive.current && generation.current === runId)
        setError((e as Error).message);
    } finally {
      if (alive.current && generation.current === runId) setRunning(false);
    }
  };
  const settings = (
    <ToolSettings
      tool={id}
      options={options}
      onChange={(key, value) =>
        setOptions((current) => ({ ...current, [key]: value }))
      }
      disabled={blocked || !!result}
      certificate={certificate?.name}
      onCertificate={async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (alive.current) setCertificate({ name: file.name, bytes });
      }}
    />
  );
  const accept =
    tool.accept === "images"
      ? "image/png,image/jpeg"
      : tool.accept === "mixed"
        ? ".pdf,application/pdf,image/png,image/jpeg"
        : ".pdf,application/pdf";
  return (
    <main
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      data-testid="tool-workspace"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files.length)
          void addUploads(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 p-3">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-0">
          <IconButton label="Back to home tools" onClick={onClose}>
            <ArrowLeft size={18} />
          </IconButton>
          <tool.icon size={22} className="shrink-0 text-lime-300" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-white">{tool.label}</h1>
            <p className="text-xs text-studio-400">{tool.description}</p>
          </div>
        </div>
        <div className="flex w-full shrink-0 [&>button]:w-full sm:w-auto sm:[&>button]:w-auto">
          {running ? (
            <Button onClick={cancel}>Cancel processing</Button>
          ) : result ? (
            <Button
              onClick={() => {
                setResult(null);
                setError("");
              }}
            >
              Change files or options
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={
                !ready || blocked || (id === "certificate-sign" && !certificate)
              }
              onClick={() => void run()}
            >
              {tool.kind === "interactive"
                ? `Continue to ${tool.label}`
                : id === "combine"
                  ? "Combine files"
                  : id === "compress"
                    ? "Compress files"
                    : `Run ${tool.label}`}
            </Button>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {desktop && (
          <ResizablePane
            id={`task-${id}`}
            label={`${tool.label} options`}
            defaultWidth={240}
            maxWidth={360}
            reserve={320}
            className="border-r border-white/10 p-3"
          >
            <div className="min-h-0 overflow-y-auto">{settings}</div>
          </ResizablePane>
        )}
        <div className="min-w-0 flex-1 overflow-y-auto p-3">
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}
          {running && (
            <p
              role="status"
              className="mb-3 flex items-center gap-2 text-sm text-studio-200"
            >
              <LoaderCircle size={17} className="animate-spin text-lime-300" />
              Processing on your device…
            </p>
          )}
          {result ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Check size={20} className="text-lime-300" />
                <h2 className="flex-1 text-base font-medium text-white">
                  {result.outputs.length}{" "}
                  {result.outputs.length === 1 ? "file" : "files"} ready
                  {result.errors.length
                    ? ` · ${result.errors.length} failed`
                    : ""}
                </h2>
                {result.outputs.length > 1 && (
                  <Button
                    variant="primary"
                    disabled={running}
                    onClick={() => void downloadAll()}
                  >
                    <Download size={16} />
                    Download all as ZIP
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {result.outputs.map((output) => (
                  <ResultFile
                    key={output.name}
                    file={output}
                    tool={id}
                    disabled={running}
                  />
                ))}
              </div>
              {result.errors.map((failure) => (
                <div
                  key={failure.id}
                  role="alert"
                  className="mt-2 rounded-lg border border-red-400/20 p-3 text-sm text-red-300"
                >
                  <strong>{failure.name}</strong>
                  <p className="mt-1 text-xs">{failure.message}</p>
                </div>
              ))}
              {result.comparison && (
                <section className="mt-4 space-y-2">
                  <h2 className="text-base text-white">Text differences</h2>
                  {result.comparison
                    .filter((page) => !page.same)
                    .slice(0, 100)
                    .map((page) => (
                      <details
                        key={page.page}
                        className="rounded-lg border border-white/10 p-3"
                      >
                        <summary className="cursor-pointer text-sm text-studio-200">
                          Page {page.page}
                        </summary>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <pre className="whitespace-pre-wrap break-words bg-white/5 p-2 font-sans text-xs text-studio-400">
                            {page.before.slice(0, 2000) || "(No page)"}
                          </pre>
                          <pre className="whitespace-pre-wrap break-words bg-white/5 p-2 font-sans text-xs text-studio-400">
                            {page.after.slice(0, 2000) || "(No page)"}
                          </pre>
                        </div>
                      </details>
                    ))}
                  <p className="text-xs text-studio-400">
                    The JSON download includes the complete comparison. Up to
                    100 changed pages and 2,000 characters per side are
                    previewed here.
                  </p>
                </section>
              )}
            </>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  ref={input}
                  aria-label="Source files"
                  type="file"
                  accept={accept}
                  multiple={tool.multiple}
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = "";
                    void addUploads(files);
                  }}
                />
                <Button
                  disabled={blocked}
                  onClick={() => input.current?.click()}
                >
                  <Plus size={16} />
                  {entries.length && !tool.multiple
                    ? "Replace file"
                    : "Choose files"}
                </Button>
                {tool.accept !== "images" && library.length > 0 && (
                  <Select
                    aria-label="Choose a library document"
                    className="w-full sm:w-56"
                    disabled={blocked}
                    value=""
                    onChange={(e) => {
                      const file = library.find((f) => f.id === e.target.value);
                      if (file)
                        void add([
                          {
                            name: file.name,
                            bytes: file.bytes,
                            mime: "application/pdf",
                            libraryId: file.id,
                          },
                        ]);
                    }}
                  >
                    <option value="">From your library…</option>
                    {library.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                  </Select>
                )}
                <span className="text-xs text-studio-400">
                  {entries.length} {entries.length === 1 ? "file" : "files"}
                  {min > 1 ? ` · ${min} required` : ""}
                </span>
              </div>
              {!entries.length ? (
                <button
                  onClick={() => input.current?.click()}
                  className="flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-white/20 p-4 text-center hover:border-lime-400/50"
                >
                  <Upload size={30} className="text-lime-300" />
                  <span className="text-base text-white">
                    Choose{" "}
                    {tool.accept === "images"
                      ? "images"
                      : tool.multiple
                        ? "files"
                        : "a PDF"}{" "}
                    to get started
                  </span>
                  <span className="text-xs text-studio-400">
                    Or drop{" "}
                    {tool.accept === "images"
                      ? "PNG or JPEG images"
                      : tool.accept === "mixed"
                        ? "PDF, PNG, or JPEG files"
                        : "PDF files"}{" "}
                    here. Processing stays on this device.
                  </span>
                </button>
              ) : (
                <ol className="space-y-2">
                  {entries.map((file, index) => (
                    <li
                      key={file.id}
                      data-task-file={file.id}
                      draggable={!blocked && tool.multiple}
                      className="rounded-lg border border-white/10 bg-white/[.02] p-3"
                      onDragStart={(e) => {
                        dragged.current = file.id;
                        e.dataTransfer.setData("text/x-pdfweld-file", file.id);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        if (dragged.current) {
                          e.preventDefault();
                          e.stopPropagation();
                          reorder(
                            entries.findIndex((f) => f.id === dragged.current),
                            index,
                          );
                          dragged.current = null;
                        }
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <FileText
                          size={20}
                          className="mt-1 shrink-0 text-studio-400"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words text-sm font-medium text-white">
                            {file.name}
                          </h3>
                          <p className="mt-1 text-xs text-studio-400">
                            {fileSize(file.bytes.length)}
                            {file.info
                              ? ` · ${file.info.pages.length} pages`
                              : ""}{" "}
                            ·{" "}
                            {file.status === "loading"
                              ? "Checking…"
                              : file.status === "ready"
                                ? "Ready"
                                : file.status === "locked"
                                  ? "Password needed"
                                  : "Cannot read file"}
                          </p>
                        </div>
                        {tool.multiple && (
                          <>
                            <IconButton
                              disabled={blocked || index === 0}
                              label={`Move ${file.name} earlier`}
                              onClick={() => reorder(index, index - 1)}
                              className="h-9 w-9"
                            >
                              <ArrowUp size={15} />
                            </IconButton>
                            <IconButton
                              disabled={blocked || index === entries.length - 1}
                              label={`Move ${file.name} later`}
                              onClick={() => reorder(index, index + 1)}
                              className="h-9 w-9"
                            >
                              <ArrowDown size={15} />
                            </IconButton>
                          </>
                        )}
                        <IconButton
                          disabled={blocked}
                          label={`Remove ${file.name}`}
                          onClick={() =>
                            setEntries((current) =>
                              current.filter((f) => f.id !== file.id),
                            )
                          }
                          className="h-9 w-9"
                        >
                          <X size={15} />
                        </IconButton>
                      </div>
                      {id === "combine" && (
                        <label className="mt-2 block">
                          <Label>Pages from {file.name}</Label>
                          <Input
                            aria-label={`Pages from ${file.name}`}
                            disabled={blocked}
                            value={file.pages || ""}
                            placeholder="All pages, or 1, 3-5"
                            onChange={(e) =>
                              update(file.id, { pages: e.target.value })
                            }
                          />
                        </label>
                      )}
                      {file.status === "locked" && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Input
                            aria-label={`Password for ${file.name}`}
                            type="password"
                            autoComplete="off"
                            className="min-w-0 flex-1"
                            value={file.password || ""}
                            disabled={blocked}
                            onChange={(e) =>
                              update(file.id, { password: e.target.value })
                            }
                          />
                          <Button
                            disabled={blocked}
                            onClick={async () => {
                              setAdding(true);
                              await assess(file);
                              if (alive.current) setAdding(false);
                            }}
                          >
                            <LockKeyhole size={14} />
                            Unlock
                          </Button>
                        </div>
                      )}
                      {file.error && (
                        <p className="mt-2 text-xs text-red-300">
                          {file.error}
                        </p>
                      )}
                      {!!file.info?.signedFields && (
                        <p className="mt-2 text-xs leading-5 text-amber-200">
                          This PDF has a certificate signature. Rewritten output
                          may invalidate it.
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {!desktop && (
                <div className="mt-3 rounded-lg border border-white/10 p-3">
                  {settings}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
function ResultFile({
  file,
  tool,
  disabled,
}: {
  file: TaskOutput;
  tool: HomeToolId;
  disabled: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[.02] p-3"
      data-task-output={file.name}
    >
      <div className="flex min-w-0 flex-1 basis-full items-start gap-3 sm:basis-0">
        <FileText size={22} className="shrink-0 text-lime-300" />
        <div className="min-w-0 flex-1">
          <h3 className="break-all text-sm font-medium text-white">
            {file.name}
          </h3>
          <p className="mt-1 text-xs text-studio-400">
            {fileSize(file.bytes.length)}
            {tool === "compress" && file.inputBytes
              ? ` · from ${fileSize(file.inputBytes)} · ${Math.max(0, Math.round((1 - file.bytes.length / file.inputBytes) * 100))}% smaller`
              : ""}
          </p>
          {file.note && (
            <p className="mt-1 text-xs leading-5 text-studio-400">
              {file.note}
            </p>
          )}
        </div>
      </div>
      <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
        {file.mime === "application/pdf" && (
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() => void useApp.getState().open(file.bytes, file.name)}
          >
            Open result
            <ArrowUpRight size={14} />
          </Button>
        )}
        <Button
          variant="primary"
          disabled={disabled}
          onClick={() => download(file.bytes, file.name, file.mime)}
        >
          <Download size={15} />
          Download
        </Button>
      </div>
    </div>
  );
}
