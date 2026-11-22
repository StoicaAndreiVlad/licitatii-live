import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ForeignKeyConstraintError, UniqueConstraintError, ValidationError } from "sequelize";
import { createTestDatabase } from "./helpers.js";

// Constrângerile de integritate din docs/architecture.md §4, verificate direct în baza de date.
describe("schema și constrângeri", () => {
  let db;
  let User;
  let Item;
  let Auction;
  let Bid;
  let admin;
  let bidder;
  let otherBidder;

  const auctionValues = (itemId, extra = {}) => ({
    itemId,
    createdById: admin.id,
    startPrice: 100,
    minIncrement: 10,
    durationSec: 300,
    ...extra,
  });

  const activeAuction = async (title) => {
    const item = await Item.create({ title, category: "arta", createdById: admin.id });
    return Auction.create(auctionValues(item.id, {
      status: "ACTIVE",
      startsAt: new Date("2026-12-01T18:00:00Z"),
      endsAt: new Date("2026-12-01T18:05:00Z"),
      version: 1,
    }));
  };

  before(async () => {
    db = await createTestDatabase();
    ({ User, Item, Auction, Bid } = db.models);
    admin = await User.create({ email: "  Organizator@Test.RO ", displayName: "Organizator", passwordHash: "$2b$04$hash-admin", role: "admin" });
    bidder = await User.create({ email: "ana@test.ro", displayName: "Ana", passwordHash: "$2b$04$hash-ana" });
    otherBidder = await User.create({ email: "bogdan@test.ro", displayName: "Bogdan", passwordHash: "$2b$04$hash-bogdan" });
  });

  after(() => db.cleanup());

  it("normalizează e-mailul și atribuie implicit rolul bidder", () => {
    assert.equal(admin.email, "organizator@test.ro");
    assert.equal(bidder.role, "bidder");
  });

  it("nu expune passwordHash nici implicit, nici la serializare", async () => {
    assert.equal(JSON.stringify(admin).includes("passwordHash"), false);
    const loaded = await User.findByPk(admin.id);
    assert.equal(loaded.get("passwordHash"), undefined);
    const withHash = await User.unscoped().findByPk(admin.id);
    assert.equal(withHash.passwordHash, "$2b$04$hash-admin");
    assert.equal(JSON.stringify(withHash).includes("hash-admin"), false);
  });

  it("respinge e-mail duplicat (indiferent de majuscule)", async () => {
    await assert.rejects(
      User.create({ email: "ANA@test.ro", displayName: "Alta Ana", passwordHash: "x" }),
      UniqueConstraintError,
    );
  });

  it("respinge roluri, stări și categorii necunoscute (STRING + isIn, nu ENUM)", async () => {
    await assert.rejects(User.create({ email: "root@test.ro", displayName: "Root", passwordHash: "x", role: "root" }), ValidationError);
    await assert.rejects(Item.create({ title: "Obiect", category: "arme", createdById: admin.id }), ValidationError);
    const item = await Item.create({ title: "Obiect pentru stare", category: "arta", createdById: admin.id });
    await assert.rejects(Auction.create(auctionValues(item.id, { status: "FOO" })), ValidationError);
  });

  it("validează parametrii licitației (preț, pas, durată)", async () => {
    const item = await Item.create({ title: "Obiect parametri", category: "carti", createdById: admin.id });
    await assert.rejects(Auction.create(auctionValues(item.id, { startPrice: 0 })), ValidationError);
    await assert.rejects(Auction.create(auctionValues(item.id, { minIncrement: -5 })), ValidationError);
    await assert.rejects(Auction.create(auctionValues(item.id, { durationSec: 10 })), ValidationError);
    await assert.rejects(Auction.create(auctionValues(item.id, { startPrice: 10.5 })), ValidationError);
  });

  it("impune reguli între câmpuri: endsAt > startsAt, outcome doar în ENDED, lider și preț împreună", async () => {
    const item = await Item.create({ title: "Obiect reguli", category: "carti", createdById: admin.id });
    await assert.rejects(Auction.create(auctionValues(item.id, {
      startsAt: new Date("2026-12-01T18:05:00Z"),
      endsAt: new Date("2026-12-01T18:00:00Z"),
    })), ValidationError);
    await assert.rejects(Auction.create(auctionValues(item.id, { status: "ENDED" })), ValidationError);
    await assert.rejects(Auction.create(auctionValues(item.id, { outcome: "SOLD" })), ValidationError);
    await assert.rejects(Auction.create(auctionValues(item.id, { leaderId: bidder.id })), ValidationError);
  });

  it("I7: permite o singură licitație nefinalizată per obiect", async () => {
    const item = await Item.create({ title: "Obiect unic", category: "colectii", createdById: admin.id });
    const first = await Auction.create(auctionValues(item.id));
    await assert.rejects(Auction.create(auctionValues(item.id)), UniqueConstraintError);

    await first.update({ status: "CANCELLED" });
    const second = await Auction.create(auctionValues(item.id));
    assert.equal(second.status, "DRAFT");
  });

  it("I4: două oferte acceptate nu pot avea aceeași sumă sau același seq", async () => {
    const auction = await activeAuction("Obiect licitat");
    await Bid.create({ auctionId: auction.id, bidderId: bidder.id, amount: 100, status: "ACCEPTED", seq: 2 });

    await assert.rejects(
      Bid.create({ auctionId: auction.id, bidderId: otherBidder.id, amount: 100, status: "ACCEPTED", seq: 3 }),
      UniqueConstraintError,
    );
    await assert.rejects(
      Bid.create({ auctionId: auction.id, bidderId: otherBidder.id, amount: 110, status: "ACCEPTED", seq: 2 }),
      UniqueConstraintError,
    );

    // O ofertă respinsă la aceeași sumă este permisă (rămâne în istoric, I3).
    const rejected = await Bid.create({ auctionId: auction.id, bidderId: otherBidder.id, amount: 100, status: "REJECTED", rejectReason: "BID_TOO_LOW" });
    await rejected.reload();
    assert.equal(rejected.seq, null);

    // Aceeași sumă este permisă în altă licitație.
    const other = await activeAuction("Alt obiect licitat");
    await Bid.create({ auctionId: other.id, bidderId: bidder.id, amount: 100, status: "ACCEPTED", seq: 2 });
  });

  it("o ofertă acceptată are seq; una respinsă are motiv și nu are seq", async () => {
    const auction = await activeAuction("Obiect seq");
    await assert.rejects(Bid.create({ auctionId: auction.id, bidderId: bidder.id, amount: 100, status: "ACCEPTED" }), ValidationError);
    await assert.rejects(Bid.create({ auctionId: auction.id, bidderId: bidder.id, amount: 100, status: "REJECTED", seq: 2, rejectReason: "X" }), ValidationError);
    await assert.rejects(Bid.create({ auctionId: auction.id, bidderId: bidder.id, amount: 100, status: "REJECTED" }), ValidationError);
  });

  it("impune cheile externe", async () => {
    await assert.rejects(
      Bid.create({ auctionId: 999_999, bidderId: bidder.id, amount: 100, status: "REJECTED", rejectReason: "BID_TOO_LOW" }),
      ForeignKeyConstraintError,
    );
  });

  it("RESTRICT: un obiect cu licitații nu poate fi șters", async () => {
    const auction = await activeAuction("Obiect cu licitație");
    await assert.rejects(Item.destroy({ where: { id: auction.itemId } }), ForeignKeyConstraintError);
  });
});
