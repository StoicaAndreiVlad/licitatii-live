// Mașina de stări a licitației (docs/requirements.md §7), ca tabel explicit + funcție pură.
// Toate tranzițiile permise sunt într-un singur loc, nu condiții răspândite prin rute și servicii.

import { AUCTION_STATUSES } from "../models/index.js";

export const ACTORS = ["admin", "system", "bidder"];
export const FINAL_STATUSES = ["ENDED", "CANCELLED"];

// guard: întoarce un cod de eroare dacă tranziția nu este permisă în contextul dat, altfel null.
const TRANSITIONS = [
  { from: "DRAFT", to: "SCHEDULED", actors: ["admin"] },
  { from: "DRAFT", to: "ACTIVE", actors: ["admin"] },
  { from: "DRAFT", to: "CANCELLED", actors: ["admin"] },
  { from: "SCHEDULED", to: "ACTIVE", actors: ["admin", "system"] },
  { from: "SCHEDULED", to: "DRAFT", actors: ["admin"] },
  { from: "SCHEDULED", to: "CANCELLED", actors: ["admin"] },
  {
    from: "ACTIVE",
    to: "CANCELLED",
    actors: ["admin"],
    guard: ({ hasAcceptedBids }) => (hasAcceptedBids ? "AUCTION_HAS_BIDS" : null), // R9
  },
  { from: "ACTIVE", to: "ENDED", actors: ["system"] }, // doar ceasul serverului închide licitația
];

const findTransition = (from, to) => TRANSITIONS.find((t) => t.from === from && t.to === to);

export function canTransition(from, to, actor, { hasAcceptedBids = false } = {}) {
  if (!AUCTION_STATUSES.includes(from) || !AUCTION_STATUSES.includes(to) || !ACTORS.includes(actor)) {
    return { ok: false, code: "VALIDATION_ERROR" };
  }

  // Licitatorii nu schimbă niciodată starea unei licitații.
  if (actor === "bidder") return { ok: false, code: "FORBIDDEN" };

  // Cerere repetată către starea curentă: succes fără efect (PUT idempotent).
  if (from === to) return { ok: true, noop: true };

  const transition = findTransition(from, to);
  if (!transition) return { ok: false, code: "INVALID_TRANSITION" };

  // Tranziția există, dar nu pentru acest actor (ex. organizatorul nu poate cere ENDED).
  if (!transition.actors.includes(actor)) return { ok: false, code: "FORBIDDEN" };

  const blocked = transition.guard?.({ hasAcceptedBids });
  if (blocked) return { ok: false, code: blocked };

  return { ok: true, noop: false };
}

// Pentru interfață: ce butoane de tranziție să afișeze organizatorului.
export function allowedTransitions(from, actor, context = {}) {
  return TRANSITIONS
    .filter((t) => t.from === from)
    .map((t) => t.to)
    .filter((to) => canTransition(from, to, actor, context).ok);
}

export const isFinal = (status) => FINAL_STATUSES.includes(status);
