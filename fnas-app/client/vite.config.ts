import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true, // 允许局域网访问（监听 0.0.0.0）
    allowedHosts: ["aibook.kklin.cc.cd"], // 允许的主机名
  },
});
