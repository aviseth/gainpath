"use client";

import { useSyncExternalStore } from "react";

/**
 * Resolved colour-role values (globals.css) for libraries that take colours as
 * SVG attributes (Recharts). Follows the light/dark scheme.
 */
const ROLES = [
  "primary",
  "tertiary",
  "on-surface",
  "on-surface-variant",
  "outline-variant",
  "surface-container-highest",
  "surface-container-lowest",
] as const;
export type ThemeColors = Record<(typeof ROLES)[number], string>;

const FALLBACK: ThemeColors = {
  primary: "#4355b9",
  tertiary: "#8f4c38",
  "on-surface": "#1b1b21",
  "on-surface-variant": "#46464f",
  "outline-variant": "#c6c5d0",
  "surface-container-highest": "#e3e1e9",
  "surface-container-lowest": "#ffffff",
};

let cache: { key: string; value: ThemeColors } | null = null;

function read(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const value = Object.fromEntries(
    ROLES.map((r) => [r, style.getPropertyValue(`--md-${r}`).trim() || FALLBACK[r]]),
  ) as ThemeColors;
  const key = JSON.stringify(value);
  // Stable identity while nothing changed (useSyncExternalStore compares by reference).
  if (cache?.key !== key) cache = { key, value };
  return cache.value;
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useThemeColors(): ThemeColors {
  return useSyncExternalStore(subscribe, read, () => FALLBACK);
}
