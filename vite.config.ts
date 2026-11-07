// Lantern Hall — static single-page build for GitHub Pages (no server runtime).
// Relative base so the site works from any sub-path (e.g. /<repo>/).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", assetsDir: "assets", chunkSizeWarningLimit: 2000 },
  server: { host: "127.0.0.1", port: 5173 },
});
