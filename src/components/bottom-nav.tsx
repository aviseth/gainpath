"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Today" },
  { href: "/gym", label: "Gym" },
  { href: "/exercises", label: "Exercises" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 border-t-2 border-zinc-100 bg-zinc-950 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 items-center justify-center text-sm ${
                  active
                    ? "font-semibold text-zinc-100 underline decoration-lime-400 decoration-2 underline-offset-4"
                    : "text-zinc-500"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
