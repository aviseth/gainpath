import { afterEach, describe, expect, it, vi } from "vitest";
import { freshDB, gymInput } from "@/test/fixtures";
import { getOwnerId, LOCAL_OWNER, nextTimestamp, onLocalWrite, repo, setOwnerId } from "./repo";

afterEach(() => vi.useRealTimers());

describe("repo", () => {
  it("stamps base fields, owner and dirty on create", async () => {
    const db = freshDB();
    const gym = await repo("gyms", db).create(gymInput());
    expect(gym.user_id).toBe(LOCAL_OWNER);
    expect(gym.deleted_at).toBeNull();
    expect(gym.created_at).toBe(gym.updated_at);
    expect((await db.gyms.get(gym.id))?.dirty).toBe(1);
  });

  it("uses the device owner once one is set", async () => {
    const db = freshDB();
    await setOwnerId("user-1", db);
    expect(await getOwnerId(db)).toBe("user-1");
    expect((await repo("gyms", db).create(gymInput())).user_id).toBe("user-1");
  });

  it("keeps updated_at increasing even if the clock goes backwards (LWW)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(10_000);
    const db = freshDB();
    const gyms = repo("gyms", db);
    const gym = await gyms.create(gymInput());
    vi.setSystemTime(5_000);
    const updated = await gyms.update(gym.id, { name: "Renamed" });
    expect(updated.updated_at).toBe(10_001);
    expect(nextTimestamp(updated.updated_at)).toBe(10_002);
  });

  it("soft-deletes: hidden from reads, tombstone kept and queued for sync", async () => {
    const db = freshDB();
    const gyms = repo("gyms", db);
    const gym = await gyms.create(gymInput());
    await db.gyms.update(gym.id, { dirty: 0 });
    await gyms.remove(gym.id);
    expect(await gyms.get(gym.id)).toBeUndefined();
    expect(await gyms.list()).toEqual([]);
    const row = await db.gyms.get(gym.id);
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.dirty).toBe(1);
  });

  it("validates records against the table schema", async () => {
    const db = freshDB();
    await expect(
      repo("equipment", db).create({
        gym_id: "g",
        name: "Cable",
        type: "cable_station",
        brand: null,
        model: null,
        min_kg: 2.5,
        max_kg: 100,
        increment_kg: 0, // must be positive
        micro_increment_kg: null,
        photo_path: null,
        notes: null,
        status: "active",
        broken_since: null,
        status_reason: null,
      }),
    ).rejects.toThrow();
  });

  it("requires a muscle mapping on custom exercises (VOL-2)", async () => {
    const db = freshDB();
    const exercise = {
      name: "Mystery press",
      pattern: "horizontal_push" as const,
      vector: {},
      kind: "compound" as const,
      equipment_types: ["selectorized" as const],
      fatigue_cost: 1.2,
      rep_range: { strength: [3, 6] as [number, number], hypertrophy: [6, 12] as [number, number] },
    };
    await expect(repo("exercises", db).create(exercise)).rejects.toThrow(/muscle/);
    const ok = await repo("exercises", db).create({
      ...exercise,
      vector: { chest: 1, triceps: 0.5 },
    });
    expect(ok.vector).toEqual({ chest: 1, triceps: 0.5 });
  });

  it("notifies local-write listeners", async () => {
    const db = freshDB();
    const seen: string[] = [];
    const off = onLocalWrite((table) => seen.push(table));
    await repo("gyms", db).create(gymInput());
    off();
    await repo("gyms", db).create(gymInput());
    expect(seen).toEqual(["gyms"]);
  });
});
