import { describe, expect, it } from "vitest";
import { freshDB, gymInput } from "@/test/fixtures";
import { BackupError, exportBackup, importBackup } from "./backup";
import { repo, setOwnerId } from "./repo";

async function seeded() {
  const db = freshDB();
  const gyms = repo("gyms", db);
  const kept = await gyms.create(gymInput("Main"));
  const gone = await gyms.create(gymInput("Hotel"));
  await gyms.remove(gone.id);
  await repo("checkins", db).create({
    date: "2026-10-14",
    sleep_quality: 4,
    energy: 3,
    sleep_hours: 7.5,
    soreness: { quads: 2 },
  });
  return { db, kept, gone };
}

describe("export / import", () => {
  it("exports every table, including tombstones, without local-only fields", async () => {
    const { db, gone } = await seeded();
    const backup = await exportBackup(db);
    expect(backup.format).toBe("gainpath-backup");
    expect(backup.tables.gyms).toHaveLength(2);
    expect(backup.tables.gyms?.find((g) => g.id === gone.id)?.deleted_at).not.toBeNull();
    expect(backup.tables.checkins).toHaveLength(1);
    expect(JSON.stringify(backup)).not.toContain('"dirty"');
  });

  it("round-trips into a fresh device and re-owns rows to that device's user", async () => {
    const { db, kept } = await seeded();
    const json = JSON.stringify(await exportBackup(db));
    const target = freshDB();
    await setOwnerId("user-2", target);
    const summary = await importBackup(target, json);
    expect(summary).toEqual({ applied: 3, skipped: 0 });
    expect((await repo("gyms", target).list()).map((g) => g.name)).toEqual(["Main"]);
    expect(await target.gyms.get(kept.id)).toMatchObject({ user_id: "user-2", dirty: 1 });
  });

  it("is idempotent: importing the same file twice changes nothing", async () => {
    const { db } = await seeded();
    const json = JSON.stringify(await exportBackup(db));
    const target = freshDB();
    await importBackup(target, json);
    expect(await importBackup(target, json)).toEqual({ applied: 0, skipped: 3 });
  });

  it("does not overwrite newer local edits", async () => {
    const { db, kept } = await seeded();
    const json = JSON.stringify(await exportBackup(db));
    await repo("gyms", db).update(kept.id, { name: "Edited after export" });
    await importBackup(db, json);
    expect((await repo("gyms", db).get(kept.id))?.name).toBe("Edited after export");
  });

  it("rejects the whole file if any row is invalid", async () => {
    const { db } = await seeded();
    const backup = await exportBackup(db);
    backup.tables.checkins![0] = { ...backup.tables.checkins![0], energy: 9 };
    const target = freshDB();
    await expect(importBackup(target, JSON.stringify(backup))).rejects.toThrow(/checkins\[0\]/);
    expect(await target.gyms.count()).toBe(0);
  });

  it("rejects non-backups, unknown tables and newer schema versions", async () => {
    const db = freshDB();
    await expect(importBackup(db, "not json")).rejects.toBeInstanceOf(BackupError);
    await expect(importBackup(db, JSON.stringify({ hello: 1 }))).rejects.toThrow(
      /Not a Gainpath backup/,
    );
    const base = await exportBackup(db);
    await expect(
      importBackup(db, JSON.stringify({ ...base, tables: { mystery: [] } })),
    ).rejects.toThrow(/unknown table/);
    await expect(importBackup(db, JSON.stringify({ ...base, schema_version: 99 }))).rejects.toThrow(
      /newer version/,
    );
  });
});
