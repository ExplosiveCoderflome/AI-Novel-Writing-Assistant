import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function clearStaleOptimizeCache(rootDir: string): void {
  const cacheDir = path.resolve(rootDir, "node_modules/.vite");
  const depsDir = path.join(cacheDir, "deps");
  const metadataPath = path.join(depsDir, "_metadata.json");
  if (!fs.existsSync(metadataPath)) {
    return;
  }

  try {
    const rawMetadata = fs.readFileSync(metadataPath, "utf8");
    const metadata = JSON.parse(rawMetadata) as {
      optimized?: Record<string, { src?: string }>;
    };
    const hasMissingSource = Object.values(metadata.optimized ?? {}).some((entry) => {
      if (!entry?.src) {
        return false;
      }
      const resolvedSource = path.resolve(depsDir, entry.src);
      return !fs.existsSync(resolvedSource);
    });
    if (!hasMissingSource) {
      return;
    }
  } catch {
    // Broken metadata should be treated the same as stale metadata.
  }

  fs.rmSync(cacheDir, { recursive: true, force: true });
  console.info("[vite] Cleared stale optimize cache because cached dependency sources no longer exist.");
}

clearStaleOptimizeCache(__dirname);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("@assistant-ui") || id.includes("@langchain/langgraph-sdk")) {
            return "assistant-ui";
          }
          if (id.includes("platejs") || id.includes("@platejs")) {
            return "plate-editor";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    host: true, // 允许局域网访问（监听 0.0.0.0）
  },
});
