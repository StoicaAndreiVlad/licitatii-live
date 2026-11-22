import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createTestClock } from "../src/clock.js";
import { createTestDatabase, silentLogger } from "./helpers.js";

describe("schelet API", () => {
  let db;
  let app;
  const clock = createTestClock("2026-12-01T18:00:00.000Z");

  before(async () => {
    db = await createTestDatabase();
    app = createApp({ db, clock, logger: silentLogger });
  });

  after(() => db.cleanup());

  it("GET /api/health răspunde 200 cu ora serverului", async () => {
    const res = await request(app).get("/api/health").expect(200);
    assert.deepEqual(res.body, { status: "ok", serverTime: "2026-12-01T18:00:00.000Z" });
  });

  it("GET /api/health răspunde 503 când baza de date nu răspunde", async () => {
    const brokenDb = { sequelize: { query: async () => { throw new Error("db down"); } } };
    const brokenApp = createApp({ db: brokenDb, clock, logger: silentLogger });
    const res = await request(brokenApp).get("/api/health").expect(503);
    assert.equal(res.body.status, "unavailable");
  });

  it("o rută /api necunoscută răspunde 404 în formatul unic de eroare", async () => {
    const res = await request(app).get("/api/nu-exista").expect(404);
    assert.deepEqual(res.body, { error: { code: "NOT_FOUND", message: "Resursa nu a fost găsită." } });
  });

  it("un corp JSON invalid răspunde 400 INVALID_JSON", async () => {
    const res = await request(app)
      .post("/api/auctions/1/bids")
      .set("Content-Type", "application/json")
      .send("{ amount: ")
      .expect(400);
    assert.equal(res.body.error.code, "INVALID_JSON");
  });

  it("un corp prea mare răspunde 413", async () => {
    const res = await request(app)
      .post("/api/auctions/1/bids")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ amount: 1, padding: "x".repeat(30_000) }))
      .expect(413);
    assert.equal(res.body.error.code, "PAYLOAD_TOO_LARGE");
  });

  it("nu expune antetul X-Powered-By", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.headers["x-powered-by"], undefined);
  });
});
