"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { ExercisesIcon, GymIcon, ProgressIcon, SettingsIcon, TodayIcon } from "./icons";

const items: Array<{ href: string; label: string; Icon: ComponentType<{ size?: number }> }> = [
  { href: "/", label: "Today", Icon: TodayIcon },
  { href: "/gym", label: "Gym", Icon: GymIcon },
  { href: "/exercises", label: "Exercises", Icon: ExercisesIcon },
  { href: "/progress", label: "Progress", Icon: ProgressIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

/** M3 navigation bar: 80px, icon + label, the active item gets a 64×32 pill indicator. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 bg-surface-container pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid h-20 max-w-lg grid-cols-5">
        {items.map(({ href, label, Icon }) => {
          const active =
            href === "/"
              ? pathname === "/" || pathname.startsWith("/session")
              : pathname.startsWith(href);
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-1 text-xs ${
                  active ? "font-semibold text-on-surface" : "font-medium text-on-surface-variant"
                }`}
              >
                <span
                  className={`flex h-8 w-16 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-secondary-container text-on-secondary-container" : ""
                  }`}
                >
                  <Icon size={22} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
