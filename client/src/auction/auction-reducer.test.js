import { describe, it, expect } from "vitest";
import { applyAuctionEvent } from "./auction-reducer.js";

function initialState() {
  return {
    lastSeq: 4,
    status: "ACTIVE",
    currentPrice: 1000,
    minNextBid: 1050,
    leader: null,
    endsAt: "2026-12-01T18:05:00.000Z",
    needsResync: false,
  };
}

function bidEvent(seq, price) {
  return {
    type: "bid:accepted",
    seq,
    currentPrice: price,
    minNextBid: price + 50,
    leader: { id: seq, displayName: "Licitator " + seq },
    endsAt: "2026-12-01T18:05:00.000Z",
  };
}

describe("applyAuctionEvent", () => {
  it("U-RTM-1: aplică evenimentele în ordine", () => {
    let state = initialState();
    state = applyAuctionEvent(state, bidEvent(5, 1100));
    state = applyAuctionEvent(state, bidEvent(6, 1200));
    state = applyAuctionEvent(state, bidEvent(7, 1300));

    expect(state.lastSeq).toBe(7);
    expect(state.currentPrice).toBe(1300);
    expect(state.minNextBid).toBe(1350);
    expect(state.leader.id).toBe(7);
    expect(state.needsResync).toBe(false);
  });

  it("U-RTM-2: la ordinea 5, 7, 6 detectează golul și nu regresează", () => {
    let state = initialState();
    state = applyAuctionEvent(state, bidEvent(5, 1100));
    state = applyAuctionEvent(state, bidEvent(7, 1300));

    expect(state.needsResync).toBe(true);
    expect(state.lastSeq).toBe(5);
    expect(state.currentPrice).toBe(1100);

    state = applyAuctionEvent(state, bidEvent(6, 1200));

    expect(state.lastSeq).toBe(6);
    expect(state.currentPrice).toBe(1200);
    expect(state.needsResync).toBe(true);
  });

  it("U-RTM-3: ignoră evenimentul duplicat", () => {
    let state = initialState();
    state = applyAuctionEvent(state, bidEvent(5, 1100));
    state = applyAuctionEvent(state, bidEvent(6, 1200));
    const afterFirst = state;
    state = applyAuctionEvent(state, bidEvent(6, 1200));

    expect(state).toBe(afterFirst);
    expect(state.lastSeq).toBe(6);
    expect(state.needsResync).toBe(false);
  });

  it("U-RTM-4: ignoră un instantaneu mai vechi decât lastSeq", () => {
    const state = { ...initialState(), lastSeq: 8, currentPrice: 1500 };
    const snapshot = {
      type: "snapshot",
      version: 6,
      status: "ACTIVE",
      currentPrice: 1200,
      minNextBid: 1250,
      leader: null,
      endsAt: "2026-12-01T18:05:00.000Z",
    };

    const result = applyAuctionEvent(state, snapshot);

    expect(result).toBe(state);
    expect(result.lastSeq).toBe(8);
    expect(result.currentPrice).toBe(1500);
  });
});
