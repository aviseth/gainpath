"use client";

import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { CheckIcon, CloseIcon } from "./icons";
import { inputClass } from "./ui";

/** Form and layout primitives: big tap targets, labelled inputs (Material 3 inspired). */

/** Id of the control a <Field> labels; inputs inside a Field adopt it. */
const FieldContext = createContext<string | undefined>(undefined);
function useFieldId(id: string | undefined): string | undefined {
  const fieldId = useContext(FieldContext);
  return id ?? fieldId;
}

/**
 * A labelled control. The label points at the input by id instead of wrapping
 * it, so wrapping a button group (Segmented) doesn't make the label name, or
 * click, its first button. Groups carry their own aria-label.
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  // The hint isn't part of the label so it doesn't become part of the input's accessible name.
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id} className="px-1 font-medium text-on-surface-variant">
        {label}
      </label>
      <FieldContext.Provider value={id}>{children}</FieldContext.Provider>
      {hint && <span className="px-1 text-xs text-on-surface-variant">{hint}</span>}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useFieldId(props.id);
  return <input {...props} id={id} className={`${inputClass} ${props.className ?? ""}`} />;
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
  const id = useFieldId(rest.id);
  return (
    <input
      {...rest}
      id={id}
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
  const id = useFieldId(rest.id);
  return (
    <select
      {...rest}
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={`${inputClass} appearance-none bg-[length:20px] bg-[right_14px_center] bg-no-repeat pr-11`}
      style={{ backgroundImage: SELECT_ARROW }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const SELECT_ARROW =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23767680' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 10l5 5 5-5'/%3E%3C/svg%3E\")";

/** Pick one of a few options: M3 segmented buttons (selected segment is tonal, with a check). */
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
    <div
      role="radiogroup"
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col divide-x divide-outline overflow-hidden rounded-full border border-outline"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex min-h-12 items-center justify-center gap-1 px-1.5 text-sm font-semibold transition-colors ${
              active
                ? "bg-secondary-container text-on-secondary-container"
                : "text-on-surface hover:bg-on-surface/8"
            }`}
          >
            {active && <CheckIcon size={16} className="shrink-0" />}
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
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-chip px-3 text-sm font-medium transition-colors ${
        active
          ? "bg-secondary-container text-on-secondary-container"
          : "border border-outline-variant text-on-surface-variant hover:bg-on-surface/8"
      }`}
    >
      {active && <CheckIcon size={16} className="-ml-0.5 shrink-0" />}
      {children}
    </button>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
  children: ReactNode;
}) {
  // Tonal M3 chips, no borders: good = primary, warn/accent = tertiary, bad = error.
  const tones = {
    neutral: "bg-surface-container-highest text-on-surface-variant",
    good: "bg-primary-container text-on-primary-container",
    warn: "bg-tertiary-container text-on-tertiary-container",
    accent: "bg-tertiary-container text-on-tertiary-container",
    bad: "bg-error-container text-on-error-container",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-chip px-2 py-1 text-xs font-semibold whitespace-nowrap ${tones[tone]}`}
    >
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
      className="fixed inset-0 z-30 flex flex-col bg-surface"
    >
      <div className="bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-16 max-w-lg items-center gap-1 px-1">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/8"
            aria-label="Close"
          >
            <CloseIcon size={24} />
          </button>
          <h2 id={titleId} className="truncate text-[22px] leading-7 font-normal">
            {title}
          </h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-4">{children}</div>
      </div>
      {footer && (
        <div className="bg-surface-container pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-lg gap-2 px-4 py-3">{footer}</div>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card bg-surface-container-low px-6 py-8 text-center text-sm text-on-surface-variant">
      {children}
    </p>
  );
}
