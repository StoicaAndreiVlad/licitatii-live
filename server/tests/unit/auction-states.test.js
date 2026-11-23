import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedTransitions, canTransition, isFinal } from "../../src/domain/auction-states.js";
import { AUCTION_STATUSES } from "../../src/models/index.js";

// Cazurile U-STA-1..3 din docs/testing.md §2.1.
// Lista așteptată este scrisă independent de tabelul din cod, direct după docs/requirements.md §7.
const EXPECTED_ALLOWED = new Map([
  ["DRAFT>SCHEDULED", ["admin"]],
  ["DRAFT>ACTIVE", ["admin"]],
  ["DRAFT>CANCELLED", ["admin"]],
  ["SCHEDULED>ACTIVE", ["admin", "system"]],
  ["SCHEDULED>DRAFT", ["admin"]],
  ["SCHEDULED>CANCELLED", ["admin"]],
  ["ACTIVE>CANCELLED", ["admin"]],
  ["ACTIVE>ENDED", ["system"]],
]);

describe("canTransition — mașina de stări", () => {
  describe("U-STA-1: tabelul complet (5 × 5 stări × 3 actori)", () => {
    for (const from of AUCTION_STATUSES) {
      for (const to of AUCTION_STATUSES) {
        for (const actor of ["admin", "system", "bidder"]) {
          const key = `${from}>${to}`;
          it(`${from} → ${to} de către ${actor}`, () => {
            const result = canTransition(from, to, actor);
            if (actor === "bidder") {
              assert.deepEqual(result, { ok: false, code: "FORBIDDEN" });
            } else if (from === to) {
              assert.deepEqual(result, { ok: true, noop: true });
            } else if (!EXPECTED_ALLOWED.has(key)) {
              assert.deepEqual(result, { ok: false, code: "INVALID_TRANSITION" });
            } else if (EXPECTED_ALLOWED.get(key).includes(actor)) {
              assert.deepEqual(result, { ok: true, noop: false });
            } else {
              assert.deepEqual(result, { ok: false, code: "FORBIDDEN" });
            }
          });
        }
      }
    }
  });

  it("U-STA-2: ACTIVE → CANCELLED este blocată dacă există oferte acceptate (R9)", () => {
    assert.deepEqual(canTransition("ACTIVE", "CANCELLED", "admin", { hasAcceptedBids: true }), {
      ok: false,
      code: "AUCTION_HAS_BIDS",
    });
    assert.deepEqual(canTransition("ACTIVE", "CANCELLED", "admin", { hasAcceptedBids: false }), { ok: true, noop: false });
  });

  it("U-STA-3: tranziția repetată către starea curentă este idempotentă (fără efect)", () => {
    assert.deepEqual(canTransition("ACTIVE", "ACTIVE", "admin"), { ok: true, noop: true });
    assert.deepEqual(canTransition("CANCELLED", "CANCELLED", "admin"), { ok: true, noop: true });
  });

  it("stările finale nu mai pot fi părăsite", () => {
    for (const from of ["ENDED", "CANCELLED"]) {
      assert.equal(isFinal(from), true);
      for (const to of AUCTION_STATUSES.filter((s) => s !== from)) {
        assert.equal(canTransition(from, to, "admin").code, "INVALID_TRANSITION");
        assert.equal(canTransition(from, to, "system").code, "INVALID_TRANSITION");
      }
    }
    assert.equal(isFinal("ACTIVE"), false);
  });

  it("organizatorul nu poate închide manual o licitație (ENDED este doar pentru sistem)", () => {
    assert.deepEqual(canTransition("ACTIVE", "ENDED", "admin"), { ok: false, code: "FORBIDDEN" });
  });

  it("valori necunoscute pentru stare sau actor → VALIDATION_ERROR", () => {
    assert.equal(canTransition("FOO", "ACTIVE", "admin").code, "VALIDATION_ERROR");
    assert.equal(canTransition("DRAFT", "BAR", "admin").code, "VALIDATION_ERROR");
    assert.equal(canTransition("DRAFT", "ACTIVE", "root").code, "VALIDATION_ERROR");
  });
});

describe("allowedTransitions — pentru butoanele din interfață", () => {
  it("întoarce doar tranzițiile permise actorului, ținând cont de context", () => {
    assert.deepEqual(allowedTransitions("DRAFT", "admin"), ["SCHEDULED", "ACTIVE", "CANCELLED"]);
    assert.deepEqual(allowedTransitions("SCHEDULED", "system"), ["ACTIVE"]);
    assert.deepEqual(allowedTransitions("ACTIVE", "admin", { hasAcceptedBids: true }), []);
    assert.deepEqual(allowedTransitions("ACTIVE", "admin"), ["CANCELLED"]);
    assert.deepEqual(allowedTransitions("ACTIVE", "bidder"), []);
    assert.deepEqual(allowedTransitions("ENDED", "admin"), []);
  });
});
