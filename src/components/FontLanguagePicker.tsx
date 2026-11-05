import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { fontLanguages, googleFonts } from "../lib/font-catalog";

const languages = [
  { id: "", label: "All languages" },
  ...fontLanguages.filter((entry) =>
    googleFonts.some((font) => font.subsets.includes(entry.id)),
  ),
];

export function FontLanguagePicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (language: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const typeahead = useRef({ text: "", time: 0 });
  const selected = Math.max(
    0,
    languages.findIndex((entry) => entry.id === value),
  );
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    const option = document.getElementById(`${listId}-${active}`);
    option?.focus({ preventScroll: true });
    option?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  return (
    <div
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (!open) {
            setActive(selected);
            setOpen(true);
          } else
            setActive(
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? languages.length - 1
                  : (active +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      languages.length) %
                    languages.length,
            );
        } else if (
          event.key.length === 1 &&
          event.key !== " " &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          const now = Date.now();
          const text =
            (now - typeahead.current.time < 600 ? typeahead.current.text : "") +
            event.key.toLocaleLowerCase();
          typeahead.current = { text, time: now };
          const index = languages.findIndex((entry) =>
            entry.label.toLocaleLowerCase().startsWith(text),
          );
          if (index >= 0) {
            event.preventDefault();
            setActive(index);
            setOpen(true);
          }
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label="Font language"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => {
          setActive(selected);
          setOpen(!open);
        }}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-studio-950/50 px-3 text-left text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-lime-400 disabled:opacity-40"
      >
        <span className="min-w-0 truncate">{languages[selected].label}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`shrink-0 text-studio-400 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Font languages"
          className="mt-1 max-h-48 overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-studio-950 p-1 shadow-panel"
        >
          {languages.map((entry, index) => (
            <button
              key={entry.id}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={value === entry.id}
              tabIndex={active === index ? 0 : -1}
              onFocus={() => setActive(index)}
              onClick={() => {
                onChange(entry.id);
                close();
              }}
              className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-lime-400 ${active === index ? "bg-white/10 text-white" : "text-studio-300 hover:bg-white/5"}`}
            >
              <span className="min-w-0">{entry.label}</span>
              {value === entry.id && (
                <Check
                  size={13}
                  className="shrink-0 text-lime-300"
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
