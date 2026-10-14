import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Shared primitives: large tap targets for one-thumb use (see globals.css for the palette). */

type Variant = "primary" | "secondary" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-zinc-100 text-zinc-950 hover:bg-zinc-300 disabled:bg-zinc-600 font-display text-lg uppercase tracking-wider",
  secondary:
    "bg-transparent text-zinc-100 hover:bg-zinc-800 disabled:text-zinc-600 border border-zinc-100",
  danger: "bg-transparent text-red-500 hover:bg-red-500/10 border border-red-500",
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
      className={`min-h-12 w-full rounded-sm px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
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
    <section className="border-t-2 border-zinc-100 pt-3">
      <h2 className="text-xl">{title}</h2>
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
    info: "border-zinc-700 bg-zinc-900 text-zinc-300",
    error: "border-red-500 bg-red-500/5 text-red-300",
    success: "border-zinc-100 bg-zinc-900 text-zinc-100",
  };
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`whitespace-pre-line border-l-2 border-y-0 border-r-0 p-3 text-sm ${tones[tone]}`}
    >
      {children}
    </p>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-4 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-100 focus:outline-none";
