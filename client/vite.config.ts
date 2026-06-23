import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on LAN so a real iPad/iPhone can connect
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
