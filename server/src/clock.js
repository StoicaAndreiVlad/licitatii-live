// Ceasul serverului este singura sursă de timp pentru termene (regula R3).
// În teste se injectează un ceas controlabil, ca să nu depindem de sleep().

export const systemClock = Object.freeze({
  now: () => new Date(),
});

export function createTestClock(start = "2026-12-01T18:00:00.000Z") {
  let current = new Date(start).getTime();
  return {
    now: () => new Date(current),
    advance(ms) {
      current += ms;
    },
    set(value) {
      current = new Date(value).getTime();
    },
  };
}
