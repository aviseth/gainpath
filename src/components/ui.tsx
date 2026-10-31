import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Shared primitives (Material 3 inspired; colour roles live in globals.css).
 * Large tap targets for one-thumb use: every button is at least 48px tall and
 * a full pill.
 */

type Variant = "primary" | "secondary" | "tonal" | "text" | "danger";

const variants: Record<Variant, string> = {
  // Filled: the one main action on a screen.
  primary:
    "bg-primary text-on-primary hover:bg-primary/90 disabled:bg-on-surface/12 disabled:text-on-surface/38",
  // Outlined: an alternative that's still a real choice.
  secondary:
    "border border-outline text-primary hover:bg-primary/8 disabled:border-on-surface/12 disabled:text-on-surface/38",
  // Filled tonal: secondary actions that sit next to the primary one.
  tonal:
    "bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80 disabled:bg-on-surface/12 disabled:text-on-surface/38",
  text: "text-primary hover:bg-primary/8 disabled:text-on-surface/38",
  danger: "border border-error text-error hover:bg-error/8 disabled:text-on-surface/38",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "lg" }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-6 font-semibold transition-colors disabled:cursor-not-allowed ${
        size === "lg" ? "min-h-14 text-lg" : "min-h-12 text-[15px]"
      } ${variants[variant]} ${className}`}
    />
  );
}

/** A grouped block of content: M3 card on surface-container-low. */
export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Small trailing control in the header row. */
  action?: ReactNode;
}) {
  return (
    <section className="rounded-card bg-surface-container-low p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg">{title}</h2>
        {action}
      </div>
      {description && <p className="mt-1 text-sm text-on-surface-variant">{description}</p>}
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** Screen title row: headline plus an optional supporting line above and trailing action. */
export function PageHeader({
  title,
  overline,
  action,
}: {
  title: string;
  overline?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-3 px-1">
      <div className="flex min-w-0 flex-col">
        {overline && <span className="text-sm text-on-surface-variant">{overline}</span>}
        <h1 className="truncate">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success" | "warn";
  children: ReactNode;
}) {
  const tones = {
    info: "bg-surface-container-high text-on-surface",
    error: "bg-error-container text-on-error-container",
    success: "bg-primary-container text-on-primary-container",
    warn: "bg-tertiary-container text-on-tertiary-container",
  };
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}
    >
      {children}
    </p>
  );
}

/** Text link styled as an M3 text button (for <Link> or <a>). */
export const linkClass =
  "inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary/8";

/** Filled pill for <Link> primary actions. */
export const primaryLinkClass =
  "flex min-h-14 items-center justify-center gap-2 rounded-full bg-primary px-6 text-lg font-semibold text-on-primary hover:bg-primary/90";

export const inputClass =
  "min-h-14 w-full rounded-xl border border-outline bg-transparent px-4 text-base text-on-surface placeholder:text-on-surface-variant/70 focus:border-2 focus:border-primary focus:px-[15px] focus:outline-none";
