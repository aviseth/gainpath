"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Segmented, TextInput } from "@/components/forms";
import { Button, Notice } from "@/components/ui";
import { addFromTemplate, createGym, saveProfile } from "@/data/actions";
import type { Profile } from "@/data/schema";
import { useRecords } from "@/hooks/use-data";
import { EQUIPMENT_TYPE_LABELS } from "@/lib/labels";
import { EQUIPMENT_TEMPLATES } from "@/seed/catalog";

const STARTER = new Set([
  "barbell_power_rack",
  "adjustable_bench",
  "dumbbells_light",
  "functional_trainer",
  "lat_pulldown",
  "leg_press_45",
  "leg_extension",
  "seated_leg_curl",
]);

type Step = "goal" | "schedule" | "gym";

export default function OnboardingPage() {
  const router = useRouter();
  const gyms = useRecords("gyms");
  const [step, setStep] = useState<Step>("goal");
  const [goal, setGoal] = useState<Profile["goal"]>("hypertrophy");
  const [experience, setExperience] = useState<Profile["experience"]>("intermediate");
  const [sessions, setSessions] = useState(3);
  const [minutes, setMinutes] = useState(60);
  const [gymName, setGymName] = useState("My gym");
  const [existingGym, setExistingGym] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Set<string>>(STARTER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      let gymId = existingGym;
      if (!gymId) {
        const gym = await createGym(gymName || "My gym");
        gymId = gym.id;
        for (const t of EQUIPMENT_TEMPLATES)
          if (templates.has(t.id)) await addFromTemplate(gym.id, t);
      }
      await saveProfile({
        goal,
        experience,
        sessions_per_week: sessions,
        session_minutes: minutes,
        current_gym_id: gymId,
      });
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Welcome to Liftwise</h1>
      {step === "goal" && (
        <>
          <Field label="Main goal">
            <Segmented
              label="Main goal"
              value={goal}
              onChange={setGoal}
              options={[
                { value: "hypertrophy", label: "Muscle" },
                { value: "strength", label: "Strength" },
                { value: "general", label: "General" },
              ]}
            />
          </Field>
          <Field label="Training experience">
            <Segmented
              label="Training experience"
              value={experience}
              onChange={setExperience}
              options={[
                { value: "novice", label: "< 1 year" },
                { value: "intermediate", label: "1–3 years" },
                { value: "advanced", label: "3+ years" },
              ]}
            />
          </Field>
          <Button variant="primary" onClick={() => setStep("schedule")}>
            Next
          </Button>
        </>
      )}

      {step === "schedule" && (
        <>
          <Field label="Sessions per week">
            <Segmented
              label="Sessions per week"
              value={sessions}
              onChange={setSessions}
              options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
            />
          </Field>
          <Field label="Session length">
            <Segmented
              label="Session length"
              value={minutes}
              onChange={setMinutes}
              options={[30, 45, 60, 75, 90].map((n) => ({ value: n, label: `${n}m` }))}
            />
          </Field>
          <div className="flex gap-2">
            <Button onClick={() => setStep("goal")}>Back</Button>
            <Button variant="primary" onClick={() => setStep("gym")}>
              Next
            </Button>
          </div>
        </>
      )}

      {step === "gym" && (
        <>
          {gyms && gyms.length > 0 && (
            <Field label="Use a gym that's already set up">
              <div className="flex flex-col gap-2">
                {gyms.map((g) => (
                  <Button
                    key={g.id}
                    variant={existingGym === g.id ? "primary" : "secondary"}
                    onClick={() => setExistingGym(existingGym === g.id ? null : g.id)}
                  >
                    {g.name}
                  </Button>
                ))}
              </div>
            </Field>
          )}
          {!existingGym && (
            <>
              <Field label="Gym name">
                <TextInput value={gymName} onChange={(e) => setGymName(e.target.value)} />
              </Field>
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-300">What&apos;s in your gym?</p>
                <p className="mb-3 text-xs text-zinc-500">
                  Starting points only: you can edit every item, add your own machines and set exact
                  weight ranges in My gym.
                </p>
                {Object.entries(EQUIPMENT_TYPE_LABELS).map(([type, label]) => {
                  const items = EQUIPMENT_TEMPLATES.filter((t) => t.type === type);
                  if (items.length === 0) return null;
                  return (
                    <div key={type} className="mb-3">
                      <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{label}</p>
                      <div className="flex flex-col gap-1">
                        {items.map((t) => (
                          <label
                            key={t.id}
                            className="flex min-h-12 items-center gap-3 rounded-xl border border-zinc-800 px-3"
                          >
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-lime-400"
                              checked={templates.has(t.id)}
                              onChange={() => toggle(t.id)}
                            />
                            <span>{t.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex gap-2">
            <Button onClick={() => setStep("schedule")}>Back</Button>
            <Button variant="primary" disabled={busy} onClick={finish}>
              Finish
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
