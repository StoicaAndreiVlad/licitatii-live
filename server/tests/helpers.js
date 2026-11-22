import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../src/db.js";

// Fiecare test primește propria bază SQLite temporară → teste independente, rulabile în paralel.
export async function createTestDatabase() {
  const storage = path.join(os.tmpdir(), `licitatii-test-${randomUUID()}.sqlite`);
  const db = await createDatabase({ storage });
  return {
    ...db,
    storage,
    async cleanup() {
      await db.close();
      await Promise.all(["", "-wal", "-shm"].map((suffix) => rm(storage + suffix, { force: true })));
    },
  };
}

export const silentLogger = { error() {} };
