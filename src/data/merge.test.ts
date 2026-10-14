import { describe, expect, it } from "vitest";
import { freshDB, gymInput } from "@/test/fixtures";
import { mergeRecords } from "./merge";
import { repo } from "./repo";

describe("mergeRecords (last-write-wins)", () => {
  it("applies newer remote versions as clean and skips older ones", async () => {
    const db = freshDB();
    const gym = await repo("gyms", db).create(gymInput("Local name"));

    const older = { ...gym, name: "Stale", updated_at: gym.updated_at - 1 };
    expect(await mergeRecords(db, "gyms", [older], "remote")).toEqual({ applied: 0, skipped: 1 });
    expect((await db.gyms.get(gym.id))?.name).toBe("Local name");

    const newer = { ...gym, name: "From cloud", updated_at: gym.updated_at + 1 };
    expect(await mergeRecords(db, "gyms", [newer], "remote")).toEqual({ applied: 1, skipped: 0 });
    const row = await db.gyms.get(gym.id);
    expect(row?.name).toBe("From cloud");
    expect(row?.dirty).toBe(0);
  });

  it("clears dirty when the cloud echoes back exactly our pending version", async () => {
    const db = freshDB();
    const gym = await repo("gyms", db).create(gymInput());
    await mergeRecords(db, "gyms", [gym], "remote");
    expect((await db.gyms.get(gym.id))?.dirty).toBe(0);
  });

  it("marks imported winners dirty so they get pushed", async () => {
    const db = freshDB();
    const gym = await repo("gyms", db).create(gymInput());
    await db.gyms.update(gym.id, { dirty: 0 });
    await mergeRecords(
      db,
      "gyms",
      [{ ...gym, name: "Imported", updated_at: gym.updated_at + 5 }],
      "import",
    );
    expect(await db.gyms.get(gym.id)).toMatchObject({ name: "Imported", dirty: 1 });
  });

  it("propagates tombstones", async () => {
    const db = freshDB();
    const gym = await repo("gyms", db).create(gymInput());
    const tombstone = { ...gym, deleted_at: gym.updated_at + 1, updated_at: gym.updated_at + 1 };
    await mergeRecords(db, "gyms", [tombstone], "remote");
    expect(await repo("gyms", db).get(gym.id)).toBeUndefined();
  });
});
