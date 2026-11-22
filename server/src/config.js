import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const envFile = path.join(serverRoot, "..", ".env");

// Valorile deja prezente în mediu au prioritate față de .env.
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

export const config = Object.freeze({
  nodeEnv: env.NODE_ENV ?? "development",
  port: Number(env.PORT ?? 3000),
  databaseFile: path.resolve(serverRoot, env.DATABASE_FILE ?? "./data/licitatii.sqlite"),
  jwtSecret: env.JWT_SECRET ?? "",
  clientOrigin: env.CLIENT_ORIGIN ?? "http://localhost:5173",
  ratesProvider: env.RATES_PROVIDER ?? "simulator",
  ratesBaseUrl: env.RATES_BASE_URL ?? "https://api.frankfurter.app",
  clientDist: path.resolve(serverRoot, "..", "client", "dist"),
});

export function assertProductionConfig(current = config) {
  if (current.nodeEnv === "production" && current.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET trebuie să aibă cel puțin 32 de caractere în producție.");
  }
}
