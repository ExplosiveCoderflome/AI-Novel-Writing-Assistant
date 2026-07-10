import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/AI-Novel-Writing-Assistant/",
  server: {
    port: 4173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    manifest: true,
    reportCompressedSize: false,
  },
  plugins: [react()],
});
