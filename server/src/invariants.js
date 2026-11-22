// Verifică invariantele I1–I7 (docs/requirements.md §6) direct din baza de date.
// Folosit de teste, de seed și, din M2, de load/verify-invariants.js după testele de încărcare.

import { OPEN_AUCTION_STATUSES } from "./models/index.js";

export async function checkInvariants({ Auction, Bid }) {
  const violations = [];
  const auctions = (await Auction.findAll({ order: [["id", "ASC"]] })).map((a) => a.get({ plain: true }));
  const accepted = (await Bid.findAll({
    where: { status: "ACCEPTED" },
    order: [["auctionId", "ASC"], ["seq", "ASC"]],
  })).map((b) => b.get({ plain: true }));

  const acceptedByAuction = new Map();
  for (const bid of accepted) {
    if (!acceptedByAuction.has(bid.auctionId)) acceptedByAuction.set(bid.auctionId, []);
    acceptedByAuction.get(bid.auctionId).push(bid);
  }

  const openByItem = new Map();
  for (const auction of auctions) {
    const tag = `licitația ${auction.id}`;
    const bids = acceptedByAuction.get(auction.id) ?? [];

    if (OPEN_AUCTION_STATUSES.includes(auction.status)) {
      if (openByItem.has(auction.itemId)) violations.push(`I7: obiectul ${auction.itemId} are mai multe licitații nefinalizate`);
      openByItem.set(auction.itemId, auction.id);
    }

    if (bids.length > 0 && !["ACTIVE", "ENDED"].includes(auction.status)) {
      violations.push(`I1: ${tag} are oferte acceptate în starea ${auction.status}`);
    }

    bids.forEach((bid, index) => {
      const minimum = index === 0 ? auction.startPrice : bids[index - 1].amount + auction.minIncrement;
      if (bid.amount < minimum) violations.push(`I1: ${tag}, oferta ${bid.id} (${bid.amount}) < minimul ${minimum}`);
      if (index > 0 && bid.seq <= bids[index - 1].seq) violations.push(`I4: ${tag}, seq necrescător la oferta ${bid.id}`);
      if (auction.endsAt && bid.createdAt >= auction.endsAt) violations.push(`I2: ${tag}, oferta ${bid.id} acceptată după endsAt`);
      if (bid.seq > auction.version) violations.push(`I4: ${tag}, oferta ${bid.id} are seq > version`);
    });

    const last = bids.at(-1);
    if (last) {
      if (auction.currentPrice !== last.amount || auction.leaderId !== last.bidderId) {
        violations.push(`I5: ${tag}, preț/lider (${auction.currentPrice}/${auction.leaderId}) ≠ ultima ofertă acceptată (${last.amount}/${last.bidderId})`);
      }
    } else if (auction.currentPrice !== null || auction.leaderId !== null) {
      violations.push(`I5: ${tag} are preț/lider fără oferte acceptate`);
    }

    if (auction.status === "ENDED") {
      const expected = bids.length > 0 ? "SOLD" : "UNSOLD";
      if (auction.outcome !== expected) violations.push(`I6: ${tag} are outcome ${auction.outcome}, așteptat ${expected}`);
    }
  }

  return violations;
}
