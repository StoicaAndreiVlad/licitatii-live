import http from "node:http";
import { createApp } from "./app.js";
import { assertProductionConfig, config } from "./config.js";
import { createDatabase } from "./db.js";

assertProductionConfig();

const db = await createDatabase({ storage: config.databaseFile });
const app = createApp({
  db,
  clientDist: config.nodeEnv === "production" ? config.clientDist : null,
});

// M2: Socket.IO se atașează la același server HTTP; planificatorul pornește aici.
const server = http.createServer(app);

server.listen(config.port, () => {
  console.log(`API pornit pe http://localhost:${config.port} (${config.nodeEnv})`);
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  await db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
