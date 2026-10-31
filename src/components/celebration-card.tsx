import type { ReactNode } from "react";
import type { Celebration } from "@/lib/celebrate";

/**
 * Celebratory tertiary-container card (Peak-End): opens the session finish
 * and Progress. Copy comes from lib/celebrate, which only states what the
 * logged data supports.
 */
export function CelebrationCard({
  label,
  celebration,
  children,
}: {
  label: string;
  celebration: Celebration;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="flex flex-col gap-1.5 rounded-card bg-tertiary-container p-5 text-on-tertiary-container"
    >
      <span className="text-[13px] font-semibold opacity-80">{label}</span>
      <span className="text-[32px] leading-tight font-extrabold tracking-tight">
        {celebration.headline}
      </span>
      <p className="text-sm leading-snug">{celebration.body}</p>
      {children}
    </section>
  );
}

/**
 * Segmented progress (Goal-gradient): one segment per planned item, filled up
 * to `done`. Sits on primary- or tertiary-container cards.
 */
export function SegmentedProgress({
  done,
  total,
  tone = "tertiary",
  label,
}: {
  done: number;
  total: number;
  tone?: "primary" | "tertiary";
  label: string;
}) {
  const segments = Math.max(1, Math.min(total, 12));
  const filled = Math.min(done, segments);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(done, total)}
      className="mt-2 grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={`h-3 rounded-full ${
            i < filled
              ? tone === "tertiary"
                ? "bg-tertiary"
                : "bg-primary"
              : tone === "tertiary"
                ? "bg-surface-container-lowest/80"
                : "bg-on-primary-container/15"
          }`}
        />
      ))}
    </div>
  );
}
