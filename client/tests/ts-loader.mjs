import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../");
const pnpmDir = path.join(rootDir, "node_modules/.pnpm");
let esbuildPath = "";
if (fs.existsSync(pnpmDir)) {
  const match = fs.readdirSync(pnpmDir).find(d => d.startsWith("esbuild@"));
  if (match) {
    esbuildPath = path.join(pnpmDir, match, "node_modules/esbuild/lib/main.js");
  }
}

const { transformSync } = await import(pathToFileURL(esbuildPath).href);

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.endsWith(".js")) {
      const tsSpecifier = specifier.slice(0, -3) + ".ts";
      try {
        return await nextResolve(tsSpecifier, context);
      } catch {
        const tsxSpecifier = specifier.slice(0, -3) + ".tsx";
        return await nextResolve(tsxSpecifier, context);
      }
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const cleanPath = fileURLToPath(url);
    const source = fs.readFileSync(cleanPath, "utf8");
    const { code } = transformSync(source, {
      loader: url.endsWith(".tsx") ? "tsx" : "ts",
      format: "esm",
      target: "node20",
      jsx: "automatic",
    });
    return {
      format: "module",
      shortCircuit: true,
      source: code,
    };
  }
  return nextLoad(url, context);
}
