// Date sintetice deterministe: același seed → aceleași obiecte, sume și ordine a ofertelor.
// Momentele de timp sunt relative la `now`, ca licitațiile active să fie active la rulare.
//   npm run seed            (recreează baza din DATABASE_FILE)

import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { CATEGORIES } from "./models/index.js";

export function createRng(seed = 2026) {
  // mulberry32 — generator mic, determinist
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOUNS = {
  arta: ["Tablou în ulei", "Acuarelă", "Sculptură din bronz", "Gravură"],
  electronice: ["Radio vintage", "Aparat foto", "Pick-up", "Consolă retro"],
  carti: ["Ediție princeps", "Atlas ilustrat", "Carte cu autograf", "Almanah"],
  colectii: ["Set de timbre", "Monedă comemorativă", "Ceas de buzunar", "Carte poștală"],
  mobilier: ["Fotoliu art deco", "Comodă", "Oglindă venețiană", "Lampă de birou"],
  altele: ["Glob pământesc", "Mașină de scris", "Vază de porțelan", "Cutie muzicală"],
};

const DEFAULT_COUNTS = { bidders: 50, items: 120, active: 40, scheduled: 10, draft: 10, ended: 120, cancelled: 20 };
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const pad = (n) => String(n).padStart(2, "0");

export async function seedDatabase(db, {
  now = new Date(),
  rng = createRng(),
  adminPassword,
  bidderPassword,
  bcryptCost = 12,
  counts = {},
} = {}) {
  if (!adminPassword || !bidderPassword) throw new Error("seedDatabase: lipsesc parolele conturilor sintetice.");
  const c = { ...DEFAULT_COUNTS, ...counts };
  const openCount = c.active + c.scheduled + c.draft;
  if (openCount > c.items) throw new Error("Prea multe licitații nefinalizate pentru numărul de obiecte (I7).");

  const { sequelize, models: { User, Item, Auction, Bid } } = db;
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const between = (min, max) => min + Math.floor(rng() * (max - min + 1));
  const t0 = now.getTime();

  // O singură hash-uire per parolă (bcrypt este intenționat lent).
  const [adminHash, bidderHash] = await Promise.all([
    bcrypt.hash(adminPassword, bcryptCost),
    bcrypt.hash(bidderPassword, bcryptCost),
  ]);

  const users = [{ id: 1, email: "organizator@licitatii.test", displayName: "Organizator", passwordHash: adminHash, role: "admin" }];
  for (let i = 1; i <= c.bidders; i += 1) {
    users.push({ id: i + 1, email: `licitator${pad(i)}@licitatii.test`, displayName: `Licitator ${pad(i)}`, passwordHash: bidderHash, role: "bidder" });
  }
  const bidderIds = users.filter((u) => u.role === "bidder").map((u) => u.id);

  const items = [];
  for (let id = 1; id <= c.items; id += 1) {
    const category = CATEGORIES[(id - 1) % CATEGORIES.length];
    items.push({
      id,
      title: `${pick(NOUNS[category])} #${id}`,
      description: `Obiect fictiv generat pentru demonstrație (categoria ${category}).`,
      category,
      createdById: 1,
      createdAt: new Date(t0 - 60 * 24 * HOUR + id * MINUTE),
      updatedAt: new Date(t0 - 60 * 24 * HOUR + id * MINUTE),
    });
  }

  const auctions = [];
  const bids = [];
  let auctionId = 0;

  function generateBids(auction, from, until) {
    // Ofertele acceptate: sume strict crescătoare cu pas ≥ minIncrement, lider diferit de cel anterior (R4).
    const count = rng() < 0.2 ? 0 : between(1, 25);
    const span = Math.max(1, until - from - 1000);
    const times = Array.from({ length: count }, () => from + 1 + Math.floor(rng() * span)).sort((a, b) => a - b);
    let amount = null;
    let leader = null;
    times.forEach((time, index) => {
      amount = index === 0
        ? auction.startPrice + auction.minIncrement * between(0, 1)
        : amount + auction.minIncrement * between(1, 3);
      let bidder = pick(bidderIds);
      while (bidder === leader) bidder = pick(bidderIds);
      leader = bidder;
      bids.push({ auctionId: auction.id, bidderId: bidder, amount, status: "ACCEPTED", seq: index + 2, createdAt: new Date(time) });

      if (rng() < 0.1) {
        let late = pick(bidderIds);
        while (late === leader) late = pick(bidderIds);
        bids.push({ auctionId: auction.id, bidderId: late, amount, status: "REJECTED", rejectReason: "BID_TOO_LOW", seq: null, createdAt: new Date(time + 1) });
      }
    });
    return { count, amount, leader };
  }

  function baseAuction(itemId) {
    auctionId += 1;
    const startPrice = pick([50, 100, 200, 500, 1000, 2500]) * between(1, 4);
    const minIncrement = startPrice >= 2000 ? pick([50, 100]) : pick([5, 10, 25]);
    return {
      id: auctionId,
      itemId,
      createdById: 1,
      startPrice,
      minIncrement,
      durationSec: pick([300, 900, 3600, 86_400]),
      currentPrice: null,
      leaderId: null,
      version: 0,
      extensionsUsed: 0,
      startsAt: null,
      endsAt: null,
      outcome: null,
      endedAt: null,
      createdAt: new Date(t0 - 30 * 24 * HOUR + auctionId * MINUTE),
      updatedAt: new Date(t0 - 30 * 24 * HOUR + auctionId * MINUTE),
    };
  }

  let itemCursor = 0;
  const nextOpenItem = () => {
    itemCursor += 1;
    return itemCursor;
  };

  for (let i = 0; i < c.active; i += 1) {
    const a = baseAuction(nextOpenItem());
    const durationMs = a.durationSec * 1000;
    const elapsed = Math.floor(rng() * Math.max(0, durationMs - 2 * MINUTE));
    a.status = "ACTIVE";
    a.startsAt = new Date(t0 - elapsed);
    a.endsAt = new Date(a.startsAt.getTime() + durationMs);
    const { count, amount, leader } = generateBids(a, a.startsAt.getTime(), t0);
    if (count > 0) Object.assign(a, { currentPrice: amount, leaderId: leader });
    a.version = 1 + count;
    auctions.push(a);
  }

  for (let i = 0; i < c.scheduled; i += 1) {
    const a = baseAuction(nextOpenItem());
    a.status = "SCHEDULED";
    a.startsAt = new Date(t0 + between(1, 48) * HOUR);
    a.endsAt = new Date(a.startsAt.getTime() + a.durationSec * 1000);
    a.version = 1;
    auctions.push(a);
  }

  for (let i = 0; i < c.draft; i += 1) {
    const a = baseAuction(nextOpenItem());
    a.status = "DRAFT";
    auctions.push(a);
  }

  for (let i = 0; i < c.ended; i += 1) {
    const a = baseAuction(between(1, c.items));
    a.status = "ENDED";
    a.endsAt = new Date(t0 - between(1, 30 * 24) * HOUR);
    a.startsAt = new Date(a.endsAt.getTime() - a.durationSec * 1000);
    const { count, amount, leader } = generateBids(a, a.startsAt.getTime(), a.endsAt.getTime());
    if (count > 0) Object.assign(a, { currentPrice: amount, leaderId: leader });
    a.outcome = count > 0 ? "SOLD" : "UNSOLD";
    a.endedAt = a.endsAt;
    a.version = 2 + count;
    auctions.push(a);
  }

  for (let i = 0; i < c.cancelled; i += 1) {
    const a = baseAuction(between(1, c.items));
    a.status = "CANCELLED";
    a.version = 1;
    auctions.push(a);
  }

  await sequelize.transaction(async (transaction) => {
    await User.bulkCreate(users, { transaction, validate: true });
    await Item.bulkCreate(items, { transaction, validate: true });
    await Auction.bulkCreate(auctions, { transaction, validate: true });
    await Bid.bulkCreate(bids, { transaction, validate: true });
  });

  return {
    users: users.length,
    items: items.length,
    auctions: auctions.length,
    bids: bids.length,
    acceptedBids: bids.filter((b) => b.status === "ACCEPTED").length,
  };
}

// Rulare din linia de comandă: node src/seed.js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = await import("./config.js");
  const { createDatabase } = await import("./db.js");
  const { checkInvariants } = await import("./invariants.js");

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const bidderPassword = process.env.SEED_BIDDER_PASSWORD;
  if (!adminPassword || !bidderPassword) {
    console.error("Lipsesc SEED_ADMIN_PASSWORD / SEED_BIDDER_PASSWORD. Copiați .env.example în .env.");
    process.exit(1);
  }

  const db = await createDatabase({ storage: config.databaseFile, reset: true });
  const summary = await seedDatabase(db, { adminPassword, bidderPassword });
  const violations = await checkInvariants(db.models);
  await db.close();

  console.log("Seed finalizat:", summary);
  if (violations.length > 0) {
    console.error("Invariante încălcate:", violations);
    process.exit(1);
  }
  console.log("Invariantele I1–I7 sunt respectate.");
}
