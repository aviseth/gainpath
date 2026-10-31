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
  const over = remaining === 0;
  return (
    <div
      role="timer"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20"
    >
      <div
        className={`mx-auto flex max-w-lg items-center justify-between gap-3 rounded-[24px] py-2.5 pr-2.5 pl-5 shadow-lg ${
          over ? "bg-primary text-on-primary" : "bg-inverse-surface text-inverse-on-surface"
        }`}
      >
        <span className="flex flex-col">
          <span className="text-xs font-medium opacity-80">{over ? "Rest done" : "Rest"}</span>
          <span className="text-[28px] leading-8 font-bold tabular-nums">
            {over ? "Next set!" : `${mm}:${ss}`}
          </span>
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="min-h-12 rounded-full px-4 text-sm font-semibold hover:bg-current/10"
            onClick={onExtend}
          >
            +30s
          </button>
          <button
            type="button"
            className={`min-h-12 rounded-full px-5 text-sm font-semibold ${
              over ? "bg-on-primary text-primary" : "bg-inverse-primary text-on-primary-container"
            }`}
            onClick={onDismiss}
          >
            {over ? "OK" : "Skip"}
          </button>
        </div>
      </div>
    </div>
  );
}
