import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { X, LoaderCircle, Check, ArrowUpRight, Search } from "lucide-react";
import clsx from "clsx";
import { useApp } from "../lib/store";
export function Button({
  children,
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:pointer-events-none disabled:opacity-35 motion-reduce:transition-none",
        variant === "primary"
          ? "bg-lime-400 text-studio-950 hover:bg-lime-300"
          : variant === "danger"
            ? "bg-red-400/15 text-red-300 hover:bg-red-400/25"
            : variant === "ghost"
              ? "text-studio-400 hover:bg-white/5 hover:text-white"
              : "border border-white/10 bg-white/5 text-studio-200 hover:bg-white/10",
        className,
      )}
    >
      {children}
    </button>
  );
}
export function IconButton({
  children,
  label,
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      {...props}
      className={clsx(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-300 disabled:pointer-events-none disabled:opacity-30 motion-reduce:transition-none",
        active
          ? "bg-lime-400/15 text-lime-300"
          : "text-studio-400 hover:bg-white/5 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}
export function NavigationButton({
  active,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      aria-pressed={active}
      className={clsx(
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-lime-300",
        active
          ? "bg-white/10 text-white"
          : "text-studio-400 hover:bg-white/5 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1 text-xs font-medium uppercase tracking-wider text-studio-400",
        className,
      )}
    >
      {children}
    </span>
  );
}
export function Input({
  className,
  compact = false,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }) {
  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-lg border border-white/10 bg-studio-950/50 px-3 text-base sm:text-sm max-sm:!text-base text-white outline-none placeholder:text-studio-600 focus:border-lime-400/60 focus:ring-2 focus:ring-lime-400/10",
        compact ? "h-10" : "h-11",
        className,
      )}
    />
  );
}
export function SearchField({
  className,
  compact = false,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }) {
  return (
    <div className={clsx("relative min-w-0", className)}>
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-studio-400"
      />
      <Input {...props} compact={compact} className="pl-9" />
    </div>
  );
}
export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "h-10 w-full rounded-lg border border-white/10 bg-studio-900 px-3 text-base sm:text-sm max-sm:!text-base outline-none focus:border-lime-400",
        className,
      )}
    />
  );
}
export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="mb-2 block text-xs font-medium text-studio-400">
      {children}
    </span>
  );
}
export function Divider() {
  return <div className="my-3 h-px bg-white/10" role="separator" />;
}
export function Empty({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-3 py-6 text-center text-xs leading-relaxed text-studio-400">
      <span className="rounded-lg bg-white/5 p-4 text-studio-600">{icon}</span>
      {children}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const root = ref.current;
    const focusables = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        ) || [],
      );
    const timer = setTimeout(() => {
      (
        (root?.querySelector("[autofocus], input, textarea") as HTMLElement) ||
        focusables()[0]
      )?.focus();
    }, 30);
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      }
      if (e.key === "Tab") {
        const list = focusables(),
          first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handler, true);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          "max-h-[92dvh] w-full overflow-auto rounded-t-lg border border-white/10 bg-studio-850 p-4 shadow-panel sm:rounded-lg",
          wide ? "max-w-4xl" : "max-w-md",
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-white">
              {title}
            </h2>
            {description && (
              <p className="mt-2 text-sm leading-relaxed text-studio-400">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
export function PromptDialog() {
  const prompt = useApp((s) => s.prompt);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    setValues(
      Object.fromEntries(
        prompt?.fields.map((f) => [f.key, f.value || ""]) || [],
      ),
    );
  }, [prompt]);
  if (!prompt) return null;
  const close = () => {
    useApp.setState({ prompt: null });
    prompt.resolve(null);
  };
  return (
    <Modal
      title={prompt.title}
      description={prompt.description}
      onClose={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          useApp.setState({ prompt: null });
          prompt.resolve(values);
        }}
      >
        <div className="space-y-4">
          {prompt.fields.map((f) => (
            <label key={f.key} className="block">
              <Label>{f.label}</Label>
              {f.options ? (
                <Select
                  value={values[f.key] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                  required={f.required}
                >
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              ) : f.type === "textarea" ? (
                <textarea
                  className="min-h-28 w-full rounded-lg border border-white/10 bg-studio-950/50 p-3 text-base sm:text-sm outline-none focus:border-lime-400"
                  value={values[f.key] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                  required={f.required}
                />
              ) : (
                <Input
                  type={f.type || "text"}
                  value={values[f.key] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                  required={f.required}
                />
              )}
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant={prompt.danger ? "danger" : "primary"} type="submit">
            {prompt.submit || "Apply"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function Notifications() {
  const busy = useApp((s) => s.busy),
    toast = useApp((s) => s.toast),
    error = useApp((s) => s.error);
  return (
    <>
      {(busy || toast) && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-24 left-1/2 z-[60] flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-lg border border-white/10 bg-studio-800 px-3 py-3 text-xs text-white shadow-panel sm:bottom-7"
        >
          {busy ? (
            <LoaderCircle className="animate-spin text-lime-300" size={15} />
          ) : (
            <Check className="text-lime-300" size={15} />
          )}
          <span>{busy || toast}</span>
        </div>
      )}
      {error && (
        <Modal
          title="Something needs your attention"
          description={
            error === "PASSWORD_REQUIRED"
              ? "The password was not accepted. Please open the file again and try another password."
              : error
          }
          onClose={() => useApp.setState({ error: "" })}
        >
          <Button
            className="w-full"
            onClick={() => useApp.setState({ error: "" })}
          >
            Got it
          </Button>
        </Modal>
      )}
    </>
  );
}
export { ArrowUpRight, Search };
