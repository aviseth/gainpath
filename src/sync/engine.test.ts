import { describe, expect, it } from "vitest";
import { uuidv7 } from "uuidv7";
import { getOwnerId, repo, setOwnerId } from "@/data/repo";
import type { Gym } from "@/data/schema";
import { FakeRemote, freshDB, gymInput } from "@/test/fixtures";
import { countPending, OwnershipConflictError, PULL_PAGE, syncOnce } from "./engine";

const USER = "user-1";

function remoteGym(name: string, updatedAt = 1_000): Gym {
  return {
    id: uuidv7(),
    user_id: USER,
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
    name,
    is_default: false,
  };
}

describe("syncOnce", () => {
  it("claims signed-out rows on first sync, pushes them and clears the queue", async () => {
    const db = freshDB();
    const gym = await repo("gyms", db).create(gymInput());
    const remote = new FakeRemote(USER);

    const result = await syncOnce(db, remote, USER);

    expect(result.pushed).toBe(1);
    expect(await getOwnerId(db)).toBe(USER);
    expect(remote.get("gyms", gym.id)).toMatchObject({ name: "Home gym", user_id: USER });
    expect(await db.gyms.get(gym.id)).toMatchObject({ user_id: USER, dirty: 0 });
    expect(await countPending(db)).toBe(0);
  });

  it("never uploads another account's rows", async () => {
    const db = freshDB();
    await setOwnerId("someone-else", db);
    await repo("gyms", db).create(gymInput());
    const remote = new FakeRemote(USER);

    await expect(syncOnce(db, remote, USER)).rejects.toBeInstanceOf(OwnershipConflictError);
    expect(remote.pushCalls).toBe(0);
    expect(await countPending(db)).toBe(1);
  });

  it("pulls rows written by another device and only fetches new changes afterwards", async () => {
    const db = freshDB();
    const remote = new FakeRemote(USER);
    const fromPhone = remoteGym("Phone gym");
    remote.writeFromOtherDevice("gyms", fromPhone);

    expect((await syncOnce(db, remote, USER)).pulled).toBe(1);
    expect(await db.gyms.get(fromPhone.id)).toMatchObject({ name: "Phone gym", dirty: 0 });

    remote.writeFromOtherDevice("gyms", remoteGym("Hotel"));
    // The overlap window may re-read recent rows, but merging them again is a no-op.
    const second = await syncOnce(db, remote, USER);
    expect(second.pulled).toBeGreaterThanOrEqual(1);
    expect((await repo("gyms", db).list()).map((g) => g.name).sort()).toEqual([
      "Hotel",
      "Phone gym",
    ]);
  });

  it("resolves conflicts with last-write-wins in both directions", async () => {
    const db = freshDB();
    await setOwnerId(USER, db);
    const remote = new FakeRemote(USER);
    const gym = await repo("gyms", db).create(gymInput("Original"));
    await syncOnce(db, remote, USER);

    // Another device edits later than us: remote wins.
    remote.writeFromOtherDevice("gyms", {
      ...gym,
      name: "Remote edit",
      updated_at: gym.updated_at + 100,
    });
    await syncOnce(db, remote, USER);
    expect((await repo("gyms", db).get(gym.id))?.name).toBe("Remote edit");

    // We edit later still: local wins on the server too.
    await repo("gyms", db).update(gym.id, { name: "Local edit" });
    await syncOnce(db, remote, USER);
    expect(remote.get("gyms", gym.id)?.name).toBe("Local edit");
    expect((await repo("gyms", db).get(gym.id))?.name).toBe("Local edit");
  });

  it("keeps a row queued if it was edited while its push was in flight", async () => {
    const db = freshDB();
    const remote = new FakeRemote(USER);
    const gym = await repo("gyms", db).create(gymInput("v1"));
    let edited = false;
    remote.afterPush = async () => {
      if (edited) return;
      edited = true;
      await repo("gyms", db).update(gym.id, { name: "v2" });
    };

    await syncOnce(db, remote, USER);
    // The server took v1; v2 must stay queued (and survive the pull of v1).
    expect(remote.get("gyms", gym.id)?.name).toBe("v1");
    expect(await db.gyms.get(gym.id)).toMatchObject({ name: "v2", dirty: 1 });

    // The edit schedules another sync, which uploads v2.
    await syncOnce(db, remote, USER);
    expect(remote.get("gyms", gym.id)?.name).toBe("v2");
    expect(await countPending(db)).toBe(0);
  });

  it("propagates deletions to other devices", async () => {
    const remote = new FakeRemote(USER);
    const laptop = freshDB();
    const phone = freshDB();
    const gym = await repo("gyms", laptop).create(gymInput());
    await syncOnce(laptop, remote, USER);
    await syncOnce(phone, remote, USER);
    expect(await repo("gyms", phone).get(gym.id)).toBeDefined();

    await repo("gyms", laptop).remove(gym.id);
    await syncOnce(laptop, remote, USER);
    await syncOnce(phone, remote, USER);
    expect(await repo("gyms", phone).get(gym.id)).toBeUndefined();
  });

  it("pages through more rows than one pull page", async () => {
    const db = freshDB();
    const remote = new FakeRemote(USER);
    const total = PULL_PAGE * 2 + 7;
    for (let i = 0; i < total; i++) remote.writeFromOtherDevice("gyms", remoteGym(`Gym ${i}`));

    const result = await syncOnce(db, remote, USER);
    expect(result.pulled).toBe(total);
    expect(await db.gyms.count()).toBe(total);
  });

  it("leaves rows queued when a push fails, then succeeds on retry", async () => {
    const db = freshDB();
    const remote = new FakeRemote(USER);
    await repo("gyms", db).create(gymInput());
    remote.failNextPush = true;

    await expect(syncOnce(db, remote, USER)).rejects.toThrow("network down");
    expect(await countPending(db)).toBe(1);

    await syncOnce(db, remote, USER);
    expect(await countPending(db)).toBe(0);
  });

  it("skips rows that fail validation instead of stalling", async () => {
    const db = freshDB();
    const remote = new FakeRemote(USER);
    remote.writeFromOtherDevice("gyms", { ...remoteGym("ok") });
    remote.writeFromOtherDevice("gyms", { ...remoteGym("bad"), name: "" });

    const result = await syncOnce(db, remote, USER);
    expect(result).toMatchObject({ pulled: 1, invalid: 1 });
  });
});
