import { describe, expect, it } from "vitest";
import type { GymManifest } from "@/seed/gyms/manifest";
import { freshDB } from "@/test/fixtures";
import { applyGymManifests, manifestEquipmentId, stableUuid } from "./manifest";
import { repo } from "./repo";

const manifest: GymManifest = {
  version: 1_760_000_000_000,
  gym: { key: "home_gym", name: "Home Gym" },
  equipment: [
    {
      key: "chest_press",
      name: "Technogym Selection Chest Press",
      type: "selectorized",
      brand: "Technogym",
      model: "Selection 700",
      min_kg: 5,
      max_kg: 100,
      increment_kg: 5,
      micro_increment_kg: null,
      weights_kg: null,
      notes: null,
      exercise_ids: ["machine_chest_press", "machine_incline_chest_press"],
      photos: ["IMG_0001.jpg"],
      unverified: ["max_kg"],
    },
  ],
};

describe("gym manifests", () => {
  it("derives stable, UUID-shaped ids", () => {
    expect(stableUuid("a")).toBe(stableUuid("a"));
    expect(stableUuid("a")).not.toBe(stableUuid("b"));
    expect(stableUuid("gym:x")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("creates the gym, equipment and links, flagged for sync, and is idempotent", async () => {
    const db = freshDB();
    expect(await applyGymManifests(db, [manifest])).toBe(1);
    const eq = await repo("equipment", db).get(manifestEquipmentId(manifest, "chest_press"));
    expect(eq).toMatchObject({ name: "Technogym Selection Chest Press", model: "Selection 700" });
    expect(eq?.notes).toContain("Please confirm: max_kg");
    expect(await repo("equipment_exercises", db).list()).toHaveLength(2);
    expect((await db.equipment.get(eq!.id))?.dirty).toBe(1);
    expect(await applyGymManifests(db, [manifest])).toBe(0);
  });

  it("never overwrites the user's own edits", async () => {
    const db = freshDB();
    await applyGymManifests(db, [manifest]);
    const id = manifestEquipmentId(manifest, "chest_press");
    await repo("equipment", db).update(id, { max_kg: 110 });
    await applyGymManifests(db, [{ ...manifest, version: manifest.version + 1 }]);
    expect((await repo("equipment", db).get(id))?.max_kg).toBe(110);
  });

  it("removes links a newer manifest no longer lists", async () => {
    const db = freshDB();
    await applyGymManifests(db, [manifest]);
    const next: GymManifest = {
      ...manifest,
      version: manifest.version + 1,
      equipment: [{ ...manifest.equipment[0], exercise_ids: ["machine_chest_press"] }],
    };
    await applyGymManifests(db, [next]);
    const links = await repo("equipment_exercises", db).list();
    expect(links.map((l) => l.exercise_id)).toEqual(["machine_chest_press"]);
  });
});

describe("committed gym manifests", () => {
  it("reference only exercises that exist in the catalogue", async () => {
    const { GYM_MANIFESTS } = await import("@/seed/gyms");
    const { SEED_EXERCISES } = await import("@/seed/catalog");
    const ids = new Set(SEED_EXERCISES.map((e) => e.id));
    for (const m of GYM_MANIFESTS) {
      const keys = new Set<string>();
      for (const item of m.equipment) {
        expect(keys.has(item.key), `duplicate key ${item.key}`).toBe(false);
        keys.add(item.key);
        expect(item.max_kg).toBeGreaterThanOrEqual(item.min_kg);
        for (const id of item.exercise_ids)
          expect(ids.has(id), `${m.gym.key}/${item.key} → ${id}`).toBe(true);
      }
    }
  });
});
