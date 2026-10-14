import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Shared primitives: large tap targets for one-thumb use, dark theme. */

type Variant = "primary" | "secondary" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-lime-400 text-zinc-950 hover:bg-lime-300 disabled:bg-lime-400/40",
  secondary:
    "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:text-zinc-500 border border-zinc-700",
  danger: "bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`min-h-12 w-full rounded-xl px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    />
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success";
  children: ReactNode;
}) {
  const tones = {
    info: "border-zinc-700 bg-zinc-800/60 text-zinc-300",
    error: "border-red-500/30 bg-red-500/10 text-red-200",
    success: "border-lime-400/30 bg-lime-400/10 text-lime-200",
  };
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`whitespace-pre-line rounded-xl border p-3 text-sm ${tones[tone]}`}
    >
      {children}
    </p>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-base text-zinc-100 placeholder:text-zinc-500 focus:border-lime-400 focus:outline-none";
