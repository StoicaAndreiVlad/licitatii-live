export function applyAuctionEvent(state, event) {
  if (event.type === "snapshot") {
    if (event.version < state.lastSeq) {
      return state;
    }
    return {
      lastSeq: event.version,
      status: event.status,
      currentPrice: event.currentPrice,
      minNextBid: event.minNextBid,
      leader: event.leader,
      endsAt: event.endsAt,
      needsResync: false,
    };
  }

  if (event.seq <= state.lastSeq) {
    return state;
  }

  if (event.seq > state.lastSeq + 1) {
    return { ...state, needsResync: true };
  }

  if (event.type === "bid:accepted") {
    return {
      ...state,
      lastSeq: event.seq,
      currentPrice: event.currentPrice,
      minNextBid: event.minNextBid,
      leader: event.leader,
      endsAt: event.endsAt,
    };
  }

  if (event.type === "auction:status") {
    return {
      ...state,
      lastSeq: event.seq,
      status: event.status,
      endsAt: event.endsAt ?? state.endsAt,
    };
  }

  return state;
}
