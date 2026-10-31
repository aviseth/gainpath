"use client";

import { Field, Segmented } from "@/components/forms";
import { Section } from "@/components/ui";
import { saveProfile } from "@/data/actions";
import { useProfile } from "@/hooks/use-data";

export function TrainingSection() {
  const profile = useProfile();
  if (!profile) return null;

  return (
    <Section title="Training">
      <Field label="Goal">
        <Segmented
          label="Goal"
          value={profile.goal}
          onChange={(goal) => void saveProfile({ goal })}
          options={[
            { value: "hypertrophy", label: "Muscle" },
            { value: "strength", label: "Strength" },
            { value: "general", label: "General" },
          ]}
        />
      </Field>
      <Field label="Experience">
        <Segmented
          label="Experience"
          value={profile.experience}
          onChange={(experience) => void saveProfile({ experience })}
          options={[
            { value: "novice", label: "Novice" },
            { value: "intermediate", label: "Intermediate" },
            { value: "advanced", label: "Advanced" },
          ]}
        />
      </Field>
      <Field label="Sessions per week">
        <Segmented
          label="Sessions per week"
          value={profile.sessions_per_week}
          onChange={(sessions_per_week) => void saveProfile({ sessions_per_week })}
          options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
        />
      </Field>
      <Field label="Session length">
        <Segmented
          label="Session length"
          value={profile.session_minutes}
          onChange={(session_minutes) => void saveProfile({ session_minutes })}
          options={[30, 45, 60, 75, 90].map((n) => ({ value: n, label: `${n}m` }))}
        />
      </Field>
      <label className="flex min-h-12 items-center justify-between gap-3 text-sm">
        <span>
          <span className="font-medium">Time-saver mode</span>
          <span className="block text-xs text-on-surface-variant">
            60 s rests. Shorter rests trade a little muscle growth for time (REST-1).
          </span>
        </span>
        <input
          type="checkbox"
          className="h-6 w-6 accent-primary"
          checked={profile.time_saver_mode}
          onChange={(e) => void saveProfile({ time_saver_mode: e.target.checked })}
        />
      </label>
    </Section>
  );
}
