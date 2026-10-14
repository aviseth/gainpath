"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getProfile } from "@/data/actions";
import { useProfile } from "@/hooks/use-data";

export function TodayScreen() {
  const profile = useProfile();
  const router = useRouter();
  useEffect(() => {
    if (profile !== null) return;
    // Next keeps visited routes alive (Activity), so `profile` may be stale from an
    // earlier visit; confirm against the database before redirecting.
    let cancelled = false;
    void getProfile().then((fresh) => {
      if (!fresh && !cancelled) router.replace("/onboarding");
    });
    return () => {
      cancelled = true;
    };
  }, [profile, router]);

  if (!profile) return <p className="text-zinc-400">Loading…</p>;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Today</h1>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-300">
        <p>Workout generation arrives in a later milestone. Set up your gym in the meantime.</p>
        <Link
          href="/gym"
          className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-lime-400 font-semibold text-zinc-950"
        >
          My gym
        </Link>
      </div>
    </div>
  );
}
