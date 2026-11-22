import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { systemClock } from "./clock.js";
import { createErrorHandler, notFound } from "./errors.js";

// Creează aplicația Express fără a porni serverul, ca să poată fi testată cu supertest.
export function createApp({ db, clock = systemClock, clientDist = null, logger = console }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20kb" }));

  app.get("/api/health", async (_req, res) => {
    try {
      await db.sequelize.query("SELECT 1");
      res.json({ status: "ok", serverTime: clock.now().toISOString() });
    } catch {
      res.status(503).json({ status: "unavailable", serverTime: clock.now().toISOString() });
    }
  });

  // M2: aici se montează rutele /api/auth, /api/items, /api/auctions, /api/me, /api/rates.

  app.use("/api", (_req, _res, next) => next(notFound()));

  // În producție, Express servește și SPA-ul construit (aceeași origine, fără CORS).
  if (clientDist && existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  app.use(createErrorHandler({ logger }));
  return app;
}
