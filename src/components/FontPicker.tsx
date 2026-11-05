import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Download, LoaderCircle } from "lucide-react";
import { engine } from "../lib/client";
import { cachedFontIds } from "../lib/font-assets";
import { loadEditorFont } from "../lib/editor-font";
import {
  DEFAULT_FONT,
  findFont,
  fontFamilyCSS,
  fontPreviewText,
  googleFonts,
  matchesFont,
} from "../lib/font-catalog";
import { Input, Label } from "./ui";
import { FontLanguagePicker } from "./FontLanguagePicker";

function recentFonts(): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem("pdfweld-recent-fonts") || "[]",
    );
    return Array.isArray(value)
      ? value.filter((id) => typeof id === "string" && findFont(id)).slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export function FontPicker({
  value,
  text,
  disabled,
  contextKey,
  onChange,
}: {
  value: string;
  text: string;
  disabled: boolean;
  contextKey: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [active, setActive] = useState(0);
  const [cached, setCached] = useState(new Set<string>());
  const [ready, setReady] = useState(new Set<string>());
  const [recent, setRecent] = useState(recentFonts);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [failed, setFailed] = useState("");
  const [missing, setMissing] = useState(false);
  const request = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const family = findFont(value)?.family || "Helvetica";
  const sample = fontPreviewText(value, text, language);

  useEffect(() => {
    request.current++;
    setLoading("");
    setError("");
    setMissing(false);
    setFailed("");
    return () => {
      request.current++;
    };
  }, [contextKey]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus({ preventScroll: true });
    let active = true;
    void cachedFontIds().then(async (ids) => {
      if (!active) return;
      setCached(ids);
      const loaded = await Promise.all(
        [...ids]
          .filter((id) => findFont(id))
          .map(async (id) => {
            try {
              await loadEditorFont(id);
              return id;
            } catch {
              return "";
            }
          }),
      );
      if (active) setReady(new Set(loaded.filter(Boolean)));
    });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    void loadEditorFont(value)
      .then(() => setReady((ids) => new Set([...ids, value])))
      .catch(() => {});
  }, [value]);

  const filtered = googleFonts.filter((font) =>
    matchesFont(font, query, language),
  );
  const showDefault =
    !language &&
    (!query.trim() ||
      "helvetica default built in".includes(query.toLowerCase().trim()));
  const recentVisible =
    !query.trim() && !language
      ? recent.filter((id) => filtered.some((font) => font.id === id))
      : [];
  const rows = [
    ...(showDefault
      ? [
          {
            id: DEFAULT_FONT,
            family: "Helvetica",
            sample: "The quick brown fox",
            bytes: 0,
          },
        ]
      : []),
    ...recentVisible.map((id) => findFont(id)!),
    ...filtered.filter((font) => !recentVisible.includes(font.id)),
  ];
  const position = Math.min(active, rows.length - 1);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${listId}-${position}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [position, open, listId]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  const choose = async (id: string) => {
    if (disabled || loading) return;
    const ticket = ++request.current;
    setLoading(id);
    setError("");
    setFailed("");
    try {
      await loadEditorFont(id);
      const coverage = await engine.call("prepareTextFont", id, text);
      if (ticket !== request.current) return;
      setMissing(coverage.missing.length > 0);
      setReady((ids) => new Set([...ids, id]));
      const downloaded = await cachedFontIds();
      if (ticket !== request.current) return;
      setCached(downloaded);
      if (id !== DEFAULT_FONT) {
        const next = [id, ...recent.filter((item) => item !== id)].slice(0, 5);
        setRecent(next);
        try {
          localStorage.setItem("pdfweld-recent-fonts", JSON.stringify(next));
        } catch {
          /* Optional preference. */
        }
      }
      setLoading("");
      close();
      onChange(id);
    } catch {
      if (ticket !== request.current) return;
      setLoading("");
      setFailed(id);
      setError(
        "Could not load this font. Check your connection and try again.",
      );
    }
  };

  return (
    <div
      ref={root}
      data-font-picker
      data-font-picker-open={open || undefined}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <Label>Font</Label>
      <button
        ref={trigger}
        type="button"
        aria-label="Font"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
          setActive(0);
        }}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-studio-950/50 px-3 text-left text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-lime-400 disabled:opacity-40"
      >
        <span className="min-w-0 truncate">{family}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={open ? "rotate-180" : ""}
        />
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-studio-900 p-2">
          <Input
            ref={search}
            role="combobox"
            aria-label="Search fonts"
            placeholder="Search fonts or languages…"
            autoComplete="off"
            compact
            aria-expanded={true}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={
              position >= 0 ? `${listId}-${position}` : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                setActive(
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? rows.length - 1
                      : Math.max(
                          0,
                          Math.min(
                            rows.length - 1,
                            position + (event.key === "ArrowDown" ? 1 : -1),
                          ),
                        ),
                );
              }
              if (event.key === "Enter" && rows[position]) {
                event.preventDefault();
                void choose(rows[position].id);
              }
            }}
          />
          <FontLanguagePicker
            value={language}
            disabled={disabled || !!loading}
            onChange={(language) => {
              setLanguage(language);
              setActive(0);
            }}
          />
          <div className="rounded-md bg-white/5 px-2 py-2">
            <div className="mb-1 truncate text-[10px] text-studio-400">
              {language && !findFont(value)?.subsets.includes(language)
                ? "Language sample"
                : `Preview · ${family}`}
            </div>
            <p
              dir="auto"
              data-font-preview
              className="max-h-16 overflow-hidden whitespace-pre-wrap break-words text-lg leading-snug text-white"
              style={{ fontFamily: fontFamilyCSS(value) }}
            >
              {sample}
            </p>
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label="Fonts"
            aria-busy={!!loading}
            className="max-h-48 overflow-y-auto overscroll-contain"
          >
            {rows.map((font, index) => (
              <button
                key={font.id}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-label={font.family}
                aria-selected={value === font.id}
                tabIndex={-1}
                disabled={disabled || !!loading}
                onMouseMove={() => {
                  if (active !== index) setActive(index);
                }}
                onClick={() => void choose(font.id)}
                className={`flex min-h-14 w-full items-center gap-2 rounded-md px-2 py-2 text-left outline-none disabled:opacity-50 ${position === index ? "bg-white/10" : "hover:bg-white/5"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">
                    {font.family}
                  </span>
                  <span
                    dir="auto"
                    data-font-specimen
                    className="block truncate text-base leading-7 text-studio-200"
                    style={
                      ready.has(font.id)
                        ? { fontFamily: fontFamilyCSS(font.id) }
                        : undefined
                    }
                  >
                    {fontPreviewText(font.id, text, language)}
                  </span>
                  <span className="block truncate text-[10px] text-studio-400">
                    {recentVisible.includes(font.id) ? "Recent · " : ""}
                    {font.id === DEFAULT_FONT || cached.has(font.id)
                      ? "Available offline"
                      : `Google Fonts · ${font.bytes < 1048576 ? `${Math.ceil(font.bytes / 1024)} KB` : `${(font.bytes / 1048576).toFixed(1)} MB`}`}
                  </span>
                </span>
                {loading === font.id ? (
                  <LoaderCircle
                    size={14}
                    className="animate-spin text-lime-300"
                    aria-hidden="true"
                  />
                ) : value === font.id ? (
                  <Check
                    size={14}
                    className="text-lime-300"
                    aria-hidden="true"
                  />
                ) : !cached.has(font.id) && font.id !== DEFAULT_FONT ? (
                  <Download
                    size={13}
                    className="text-studio-500"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            ))}
            {!rows.length && (
              <p className="px-2 py-4 text-xs text-studio-400">
                No matching fonts. Try another name or language.
              </p>
            )}
          </div>
          <p className="text-[10px] leading-4 text-studio-400">
            {rows.length} fonts · Fonts download when selected.
          </p>
        </div>
      )}
      {loading && (
        <p role="status" className="mt-2 text-xs text-studio-300">
          Loading {findFont(loading)?.family || "Helvetica"}…
        </p>
      )}
      {error && (
        <div role="alert" className="mt-2 text-xs leading-5 text-red-300">
          {error}{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            disabled={disabled}
            onClick={() => void choose(failed)}
          >
            Retry
          </button>
        </div>
      )}
      {missing && (
        <p role="status" className="mt-2 text-xs leading-5 text-amber-200">
          Some characters need a fallback font. Choose a font for your language
          for the best match.
        </p>
      )}
    </div>
  );
}
