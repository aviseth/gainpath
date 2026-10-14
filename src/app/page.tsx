import Link from "next/link";

export default function TodayPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Today</h1>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-300">
        <p>
          Workout generation arrives in a later milestone. For now you can sign in, sync and back up
          your data.
        </p>
        <Link
          href="/settings"
          className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-lime-400 font-semibold text-zinc-950"
        >
          Open settings
        </Link>
      </div>
    </div>
  );
}
