"use client";

import { useEffect, useState } from "react";

/** Rest countdown that vibrates when it ends (PROMPT.md: "rest timer with vibration"). */
export function RestTimer({
  endsAt,
  onExtend,
  onDismiss,
}: {
  endsAt: number;
  onExtend: () => void;
  onDismiss: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const remaining = Math.max(0, Math.round((endsAt - now) / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (remaining === 0 && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([250, 120, 250]);
    }
  }, [remaining]);

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");
  return (
    <div
      role="timer"
      aria-live="polite"
      className={`fixed inset-x-0 bottom-14 z-20 border-t px-4 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] ${
        remaining === 0
          ? "border-lime-400 bg-lime-400 text-zinc-950"
          : "border-zinc-800 bg-zinc-900"
      }`}
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {remaining === 0 ? "Rest done. Next set!" : "Rest"}
        </span>
        <span className="text-2xl font-bold tabular-nums">
          {mm}:{ss}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-current px-3 text-sm"
            onClick={onExtend}
          >
            +30s
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-current px-3 text-sm"
            onClick={onDismiss}
          >
            {remaining === 0 ? "OK" : "Skip"}
          </button>
        </div>
      </div>
    </div>
  );
}
