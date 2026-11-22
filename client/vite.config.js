import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// În dezvoltare, Vite trimite /api și /socket.io către Express → aceeași origine, fără CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
});
