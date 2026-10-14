"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { inputClass } from "./ui";

/** Form and layout primitives: big tap targets, labelled inputs, dark theme. */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  // The hint stays outside <label> so it doesn't become part of the input's accessible name.
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-zinc-300">{label}</span>
        {children}
      </label>
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={`${inputClass} ${rest.className ?? ""}`}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  ...rest
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  return (
    <select
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={`${inputClass} appearance-none`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Pick one of a few options with large buttons. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-flow-col auto-cols-fr gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-h-12 rounded-xl border px-2 text-sm font-semibold ${
              active
                ? "border-lime-400 bg-lime-400/15 text-lime-300"
                : "border-zinc-700 bg-zinc-900 text-zinc-300"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 shrink-0 rounded-full border px-3 text-sm ${
        active ? "border-lime-400 bg-lime-400/15 text-lime-300" : "border-zinc-700 text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-zinc-800 text-zinc-300",
    good: "bg-lime-400/15 text-lime-300",
    warn: "bg-amber-400/15 text-amber-300",
    bad: "bg-red-500/15 text-red-300",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Full-screen sheet for detail views and forms (no route needed). */
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-30 flex flex-col bg-zinc-950"
    >
      <div className="border-b border-zinc-800 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 py-2">
          <h2 id={titleId} className="truncate text-lg font-semibold">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-full text-2xl leading-none text-zinc-400"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-4">{children}</div>
      </div>
      {footer && (
        <div className="border-t border-zinc-800 pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-lg gap-2 px-4 py-3">{footer}</div>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-400">
      {children}
    </p>
  );
}
