import { mkdirSync } from "node:fs";
import path from "node:path";
import { Sequelize, Transaction } from "sequelize";
import { defineModels } from "./models/index.js";

export async function createDatabase({ storage, logging = false, reset = false } = {}) {
  if (!storage) throw new Error("createDatabase: lipsește calea către fișierul SQLite.");
  const inMemory = storage === ":memory:";
  if (!inMemory) mkdirSync(path.dirname(storage), { recursive: true });

  const sequelize = new Sequelize({
    dialect: "sqlite",
    storage,
    logging,
    // BEGIN IMMEDIATE: lock-ul de scriere se ia la începutul tranzacției (vezi ADR-0002).
    transactionType: Transaction.TYPES.IMMEDIATE,
  });

  const models = defineModels(sequelize);

  await sequelize.authenticate();
  // WAL permite citiri în paralel cu scriitorul unic; setarea persistă în fișier.
  if (!inMemory) await sequelize.query("PRAGMA journal_mode = WAL;");
  await sequelize.query("PRAGMA foreign_keys = ON;");
  await sequelize.sync({ force: reset });

  return {
    sequelize,
    models,
    close: () => sequelize.close(),
  };
}
