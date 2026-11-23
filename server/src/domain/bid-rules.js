// Regulile de ofertare R1–R6 (docs/requirements.md §5) ca funcție pură: nu citește baza de date, nu citește ceasul,
// nu aruncă excepții. Serviciul tranzacțional de ofertare (M2) o apelează în interiorul tranzacției IMMEDIATE,
// cu licitația citită în acea tranzacție și cu `now = clock.now()` (ceasul serverului, R3).
//
//   evaluateBid(auction, { bidderId, amount, role }, now)
//     → { ok: true, minNextBid }
//     → { ok: false, code, message, details? }

import { MAX_AMOUNT } from "../models/index.js";

// Statusul HTTP pentru fiecare cod de respingere (docs/architecture.md §5).
// Doar respingerile 409 ajung în istoricul ofertelor (R12); 400 și 403 sunt oprite înainte de tranzacție.
export const BID_ERROR_STATUS = Object.freeze({
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  AUCTION_NOT_ACTIVE: 409,
  AUCTION_CLOSED: 409,
  ALREADY_LEADING: 409,
  BID_TOO_LOW: 409,
});

const formatLei = (value) => `${value.toLocaleString("ro-RO")} lei`;

const reject = (code, message, details) => (details === undefined
  ? { ok: false, code, message }
  : { ok: false, code, message, details });

// R6: sume întregi de lei în [1, MAX_AMOUNT]. Nu convertim: "100" (șir) este respins, nu transformat în 100.
export function validateAmount(amount) {
  if (amount === undefined || amount === null) {
    return reject("VALIDATION_ERROR", "Suma ofertei este obligatorie.", { field: "amount" });
  }
  if (typeof amount !== "number" || !Number.isInteger(amount)) {
    return reject("VALIDATION_ERROR", "Suma ofertei trebuie să fie un număr întreg de lei.", { field: "amount" });
  }
  if (amount < 1 || amount > MAX_AMOUNT) {
    return reject("VALIDATION_ERROR", `Suma ofertei trebuie să fie între 1 și ${formatLei(MAX_AMOUNT)}.`, {
      field: "amount",
      min: 1,
      max: MAX_AMOUNT,
    });
  }
  return { ok: true };
}

// R1 / R2: prima ofertă ≥ startPrice; următoarele ≥ currentPrice + minIncrement.
export function minimumBid(auction) {
  return auction.currentPrice === null || auction.currentPrice === undefined
    ? auction.startPrice
    : auction.currentPrice + auction.minIncrement;
}

const toTime = (value) => (value === null || value === undefined ? Number.NaN : new Date(value).getTime());

export function evaluateBid(auction, { bidderId, amount, role }, now) {
  // Ordinea verificărilor este deliberată: întâi cine trimite (403), apoi formatul (400),
  // apoi starea licitației și termenul (409), abia la final suma — un licitator nu află minimul
  // unei licitații în care oricum nu poate licita.

  // R5: organizatorii nu pot licita.
  if (role !== "bidder") {
    return reject("FORBIDDEN", "Doar licitatorii pot plasa oferte.");
  }

  // R6
  const validation = validateAmount(amount);
  if (!validation.ok) return validation;

  // R3: doar o licitație ACTIVE, și doar strict înainte de endsAt după ceasul serverului.
  if (auction.status === "ENDED") {
    return reject("AUCTION_CLOSED", "Licitația s-a încheiat.");
  }
  if (auction.status !== "ACTIVE") {
    return reject("AUCTION_NOT_ACTIVE", "Licitația nu este activă.", { status: auction.status });
  }
  const endsAt = toTime(auction.endsAt);
  // Un endsAt lipsă sau invalid nu trebuie să lase licitația deschisă la nesfârșit: comparația cu NaN e mereu falsă.
  if (!(toTime(now) < endsAt)) {
    return reject("AUCTION_CLOSED", "Licitația s-a încheiat.", {
      endsAt: Number.isNaN(endsAt) ? null : new Date(endsAt).toISOString(),
    });
  }

  // R4: liderul curent nu se poate supralicita singur.
  if (auction.leaderId !== null && auction.leaderId !== undefined && auction.leaderId === bidderId) {
    return reject("ALREADY_LEADING", "Sunteți deja liderul acestei licitații.");
  }

  // R1 / R2
  const minAmount = minimumBid(auction);
  if (amount < minAmount) {
    return reject("BID_TOO_LOW", `Oferta minimă acceptată este ${formatLei(minAmount)}.`, { minAmount });
  }

  return { ok: true, minNextBid: amount + auction.minIncrement };
}
