import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { checkInvariants } from "../src/invariants.js";
import { createRng, seedDatabase } from "../src/seed.js";
import { createTestDatabase } from "./helpers.js";

const NOW = new Date("2026-12-01T18:00:00.000Z");
const options = (seed = 2026) => ({
  now: NOW,
  rng: createRng(seed),
  adminPassword: "test-admin",
  bidderPassword: "test-bidder",
  bcryptCost: 4,
});

describe("seed sintetic", () => {
  const opened = [];
  const open = async () => {
    const db = await createTestDatabase();
    opened.push(db);
    return db;
  };

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((db) => db.cleanup()));
  });

  it("creează volumul descris în capacity.md și respectă invariantele I1–I7", async () => {
    const db = await open();
    const summary = await seedDatabase(db, options());
    assert.equal(summary.users, 51);
    assert.equal(summary.items, 120);
    assert.equal(summary.auctions, 200);
    assert.ok(summary.bids > 1000, `prea puține oferte: ${summary.bids}`);
    assert.deepEqual(await checkInvariants(db.models), []);

    const { Auction } = db.models;
    assert.equal(await Auction.count({ where: { status: "ACTIVE" } }), 40);
    const stillOpen = await Auction.count({ where: { status: "ACTIVE" } });
    const expiredActive = (await Auction.findAll({ where: { status: "ACTIVE" } })).filter((a) => a.endsAt <= NOW);
    assert.equal(stillOpen, 40);
    assert.equal(expiredActive.length, 0, "licitațiile ACTIVE trebuie să se termine după `now`");
  });

  it("este determinist pentru același seed și diferit pentru alt seed", async () => {
    const snapshot = async (seed) => {
      const db = await open();
      await seedDatabase(db, options(seed));
      const { Item, Bid } = db.models;
      const titles = (await Item.findAll({ order: [["id", "ASC"]] })).map((i) => i.title);
      const amounts = (await Bid.findAll({ order: [["id", "ASC"]] })).map((b) => `${b.auctionId}:${b.amount}:${b.status}`);
      return JSON.stringify({ titles, amounts });
    };
    const first = await snapshot(7);
    const second = await snapshot(7);
    const other = await snapshot(8);
    assert.equal(first, second);
    assert.notEqual(first, other);
  });

  it("checkInvariants detectează date corupte (I5, I6, I7)", async () => {
    const db = await open();
    await seedDatabase(db, { ...options(), counts: { bidders: 5, items: 10, active: 3, scheduled: 1, draft: 1, ended: 5, cancelled: 1 } });
    const { Auction, Bid } = db.models;

    // Corupere direct în SQL (ocolind validările modelului), ca un script sau o eroare de cod ar putea face.
    const sold = await Auction.findOne({ where: { status: "ENDED", outcome: "SOLD" } });
    await db.sequelize.query(
      "UPDATE Auctions SET currentPrice = currentPrice + 1, outcome = 'UNSOLD' WHERE id = ?",
      { replacements: [sold.id] },
    );

    const violations = await checkInvariants(db.models);
    assert.ok(violations.some((v) => v.startsWith("I5:")), violations.join("\n"));
    assert.ok(violations.some((v) => v.startsWith("I6:")), violations.join("\n"));

    const accepted = await Bid.count({ where: { auctionId: sold.id, status: "ACCEPTED" } });
    assert.ok(accepted > 0);
  });

  it("refuză să creeze mai multe licitații nefinalizate decât obiecte", async () => {
    const db = await open();
    await assert.rejects(
      seedDatabase(db, { ...options(), counts: { items: 2, active: 2, scheduled: 1, draft: 0 } }),
      /I7/,
    );
  });

  it("cere parolele conturilor sintetice", async () => {
    const db = await open();
    await assert.rejects(seedDatabase(db, { now: NOW }), /parolele/);
  });
});
