import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BID_ERROR_STATUS, evaluateBid, minimumBid, validateAmount } from "../../src/domain/bid-rules.js";
import { MAX_AMOUNT } from "../../src/models/index.js";

// Cazurile U-BID-1..7 și U-VAL-1 din docs/testing.md §2.1. Funcția este pură, deci nu avem nevoie
// de bază de date sau de ceas injectat: `now` este doar un argument.

const ENDS_AT = new Date("2026-12-01T18:05:00.000Z");
const BEFORE_END = new Date("2026-12-01T18:00:00.000Z");
const ANA = 12;
const BOGDAN = 13;

const auction = (extra = {}) => ({
  id: 7,
  status: "ACTIVE",
  startPrice: 1000,
  minIncrement: 50,
  currentPrice: null,
  leaderId: null,
  version: 1,
  startsAt: new Date("2026-12-01T17:55:00.000Z"),
  endsAt: ENDS_AT,
  ...extra,
});

// Licitație care are deja o ofertă acceptată: Ana conduce la 1200.
const withLeader = (extra = {}) => auction({ currentPrice: 1200, leaderId: ANA, version: 4, ...extra });

const bid = (amount, extra = {}) => ({ bidderId: BOGDAN, amount, role: "bidder", ...extra });

describe("evaluateBid — reguli de business", () => {
  it("U-BID-1: prima ofertă egală cu startPrice este acceptată (R1)", () => {
    assert.deepEqual(evaluateBid(auction(), bid(1000), BEFORE_END), { ok: true, minNextBid: 1050 });
  });

  it("U-BID-2: prima ofertă sub startPrice este respinsă cu BID_TOO_LOW (R1)", () => {
    const result = evaluateBid(auction(), bid(999), BEFORE_END);
    assert.equal(result.ok, false);
    assert.equal(result.code, "BID_TOO_LOW");
    assert.deepEqual(result.details, { minAmount: 1000 });
    assert.equal(result.message, "Oferta minimă acceptată este 1.000 lei.");
  });

  it("U-BID-3: oferta exact currentPrice + minIncrement este acceptată (R2, limita exactă)", () => {
    assert.deepEqual(evaluateBid(withLeader(), bid(1250), BEFORE_END), { ok: true, minNextBid: 1300 });
  });

  it("U-BID-4: oferta currentPrice + minIncrement − 1 este respinsă, cu minimul corect în details (R2)", () => {
    const result = evaluateBid(withLeader(), bid(1249), BEFORE_END);
    assert.equal(result.code, "BID_TOO_LOW");
    assert.deepEqual(result.details, { minAmount: 1250 });
  });

  it("U-BID-4: după prima ofertă, startPrice nu mai este suficient", () => {
    // currentPrice = startPrice: minimul devine startPrice + minIncrement, nu startPrice.
    const result = evaluateBid(withLeader({ currentPrice: 1000 }), bid(1000), BEFORE_END);
    assert.equal(result.code, "BID_TOO_LOW");
    assert.deepEqual(result.details, { minAmount: 1050 });
  });

  describe("U-BID-5: termenul este decis de ceasul serverului (R3)", () => {
    it("now = endsAt − 1 ms → acceptată", () => {
      const now = new Date(ENDS_AT.getTime() - 1);
      assert.equal(evaluateBid(auction(), bid(1000), now).ok, true);
    });

    it("now = endsAt → AUCTION_CLOSED (limita este exclusivă)", () => {
      const result = evaluateBid(auction(), bid(1000), new Date(ENDS_AT));
      assert.equal(result.code, "AUCTION_CLOSED");
      assert.deepEqual(result.details, { endsAt: ENDS_AT.toISOString() });
    });

    it("now > endsAt → AUCTION_CLOSED, chiar dacă planificatorul nu a trecut încă licitația în ENDED", () => {
      const now = new Date(ENDS_AT.getTime() + 1);
      assert.equal(evaluateBid(auction(), bid(1000), now).code, "AUCTION_CLOSED");
    });

    it("acceptă momente de timp date ca șir ISO (cum vin din JSON)", () => {
      assert.equal(evaluateBid(auction({ endsAt: ENDS_AT.toISOString() }), bid(1000), "2026-12-01T18:04:59.999Z").ok, true);
      assert.equal(evaluateBid(auction({ endsAt: ENDS_AT.toISOString() }), bid(1000), ENDS_AT.toISOString()).code, "AUCTION_CLOSED");
    });

    it("o licitație ACTIVE fără endsAt valid este tratată ca închisă, nu ca deschisă la nesfârșit", () => {
      assert.equal(evaluateBid(auction({ endsAt: null }), bid(1000), BEFORE_END).code, "AUCTION_CLOSED");
      assert.equal(evaluateBid(auction({ endsAt: "nu-e-data" }), bid(1000), BEFORE_END).code, "AUCTION_CLOSED");
    });
  });

  describe("U-BID-6: oferta este acceptată doar în starea ACTIVE (R3)", () => {
    const cases = [
      ["SCHEDULED", "AUCTION_NOT_ACTIVE"],
      ["ENDED", "AUCTION_CLOSED"],
      ["CANCELLED", "AUCTION_NOT_ACTIVE"],
      ["DRAFT", "AUCTION_NOT_ACTIVE"],
    ];
    for (const [status, code] of cases) {
      it(`${status} → ${code}`, () => {
        // endsAt în viitor: respingerea vine din stare, nu din termen.
        const result = evaluateBid(auction({ status }), bid(5000), BEFORE_END);
        assert.equal(result.ok, false);
        assert.equal(result.code, code);
      });
    }
  });

  it("U-BID-7: liderul curent nu își poate supralicita propria ofertă (R4)", () => {
    const result = evaluateBid(withLeader(), bid(5000, { bidderId: ANA }), BEFORE_END);
    assert.equal(result.code, "ALREADY_LEADING");
  });

  it("U-BID-7: ALREADY_LEADING are prioritate față de BID_TOO_LOW pentru lider", () => {
    // Mesajul relevant pentru lider este că deja conduce, nu că suma e mică.
    assert.equal(evaluateBid(withLeader(), bid(1, { bidderId: ANA }), BEFORE_END).code, "ALREADY_LEADING");
  });

  it("U-BID-7: alt licitator decât liderul poate supralicita", () => {
    assert.equal(evaluateBid(withLeader(), bid(1250, { bidderId: BOGDAN }), BEFORE_END).ok, true);
  });

  it("organizatorul nu poate licita (R5), chiar și pe o licitație activă și cu sumă validă", () => {
    const result = evaluateBid(auction(), bid(1000, { role: "admin" }), BEFORE_END);
    assert.equal(result.code, "FORBIDDEN");
    assert.equal(BID_ERROR_STATUS[result.code], 403);
  });

  it("un rol lipsă sau necunoscut este tratat ca interzis (implicit refuzat)", () => {
    assert.equal(evaluateBid(auction(), bid(1000, { role: undefined }), BEFORE_END).code, "FORBIDDEN");
    assert.equal(evaluateBid(auction(), bid(1000, { role: "root" }), BEFORE_END).code, "FORBIDDEN");
  });

  it("ordinea verificărilor: rol → format → stare → termen → lider → sumă", () => {
    const closed = auction({ status: "ENDED" });
    assert.equal(evaluateBid(closed, bid("x", { role: "admin" }), BEFORE_END).code, "FORBIDDEN");
    assert.equal(evaluateBid(closed, bid("x"), BEFORE_END).code, "VALIDATION_ERROR");
    assert.equal(evaluateBid(closed, bid(1), BEFORE_END).code, "AUCTION_CLOSED");
    assert.equal(evaluateBid(withLeader(), bid(1, { bidderId: ANA }), ENDS_AT).code, "AUCTION_CLOSED");
  });

  it("este pură: nu modifică licitația și dă același rezultat la apeluri repetate", () => {
    const input = withLeader();
    const copy = structuredClone(input);
    const first = evaluateBid(input, bid(1300), BEFORE_END);
    const second = evaluateBid(input, bid(1300), BEFORE_END);
    assert.deepEqual(first, second);
    assert.deepEqual(input, copy);
  });

  it("fiecare cod de respingere are un status HTTP din contractul API", () => {
    assert.deepEqual(BID_ERROR_STATUS, {
      VALIDATION_ERROR: 400,
      FORBIDDEN: 403,
      AUCTION_NOT_ACTIVE: 409,
      AUCTION_CLOSED: 409,
      ALREADY_LEADING: 409,
      BID_TOO_LOW: 409,
    });
  });
});

describe("minimumBid", () => {
  it("este startPrice fără oferte și currentPrice + minIncrement după prima ofertă", () => {
    assert.equal(minimumBid(auction()), 1000);
    assert.equal(minimumBid(withLeader()), 1250);
  });
});

describe("U-VAL-1: validarea sumei (R6)", () => {
  const invalid = [
    ["șirul \"100\"", "100"],
    ["zecimal 10.5", 10.5],
    ["negativ -1", -1],
    ["zero", 0],
    ["lipsă (undefined)", undefined],
    ["1e12 (peste maxim)", 1e12],
    ["null", null],
    ["MAX_AMOUNT + 1", MAX_AMOUNT + 1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["boolean true", true],
    ["obiect", { value: 100 }],
  ];

  for (const [label, amount] of invalid) {
    it(`${label} → VALIDATION_ERROR`, () => {
      const result = evaluateBid(auction(), bid(amount), BEFORE_END);
      assert.equal(result.ok, false);
      assert.equal(result.code, "VALIDATION_ERROR");
      assert.equal(result.details.field, "amount");
    });
  }

  it("limitele 1 și MAX_AMOUNT sunt valide", () => {
    assert.deepEqual(validateAmount(1), { ok: true });
    assert.deepEqual(validateAmount(MAX_AMOUNT), { ok: true });
    assert.equal(evaluateBid(auction({ startPrice: 1, minIncrement: 1 }), bid(MAX_AMOUNT), BEFORE_END).ok, true);
  });
});
