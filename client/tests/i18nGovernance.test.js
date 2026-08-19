import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const clientSrc = path.join(rootDir, "client", "src");
const zhPath = path.join(clientSrc, "locales", "zh", "translation.json");
const enPath = path.join(clientSrc, "locales", "en", "translation.json");

test("i18n locale files exist and are valid JSON documents", () => {
  assert.ok(fs.existsSync(zhPath), "zh/translation.json must exist");
  assert.ok(fs.existsSync(enPath), "en/translation.json must exist");

  const zhContent = fs.readFileSync(zhPath, "utf-8");
  const enContent = fs.readFileSync(enPath, "utf-8");

  assert.doesNotThrow(() => JSON.parse(zhContent), "zh/translation.json must be valid JSON");
  assert.doesNotThrow(() => JSON.parse(enContent), "en/translation.json must be valid JSON");
});

test("i18n locale files contain valid semantic namespaces and zero orphaned top-level pseudo keys", () => {
  const zh = JSON.parse(fs.readFileSync(zhPath, "utf-8"));
  const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));

  assert.ok("components" in zh || "dict" in zh || "sidebar" in zh, "zh/translation.json should contain semantic namespaces");
  assert.ok("components" in en || "dict" in en || "sidebar" in en, "en/translation.json should contain semantic namespaces");
  assert.equal(typeof zh.dict, "object", "dict namespace should exist in zh/translation.json");
  assert.equal(typeof en.dict, "object", "dict namespace should exist in en/translation.json");
});

test("i18n Chinese and English top-level namespaces align", () => {
  const zh = JSON.parse(fs.readFileSync(zhPath, "utf-8"));
  const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));

  const zhKeys = Object.keys(zh).sort();
  const enKeys = Object.keys(en).sort();

  for (const key of zhKeys) {
    assert.ok(key in en, `Top-level namespace "${key}" in zh/translation.json must exist in en/translation.json`);
  }
  for (const key of enKeys) {
    assert.ok(key in zh, `Top-level namespace "${key}" in en/translation.json must exist in zh/translation.json`);
  }
});

function getAllSourceFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== "node_modules" && file !== "locales" && file !== ".git") {
        getAllSourceFiles(filePath, fileList);
      }
    } else if (filePath.endsWith(".tsx") || filePath.endsWith(".ts")) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

test("client source code contains zero pseudo key (gen_*) t() invocations", () => {
  const files = getAllSourceFiles(clientSrc);
  const pseudoKeyViolations = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      if (line.includes("gen_") && (line.includes("i18next.t(") || line.includes("t("))) {
        const match = line.match(/(?:i18next\.)?t\(\s*["'`](gen\.[^"'`]+)["'`]/);
        if (match) {
          pseudoKeyViolations.push(`${path.relative(rootDir, filePath)}:${idx + 1} - ${match[0]}`);
        }
      }
    });
  }

  assert.equal(
    pseudoKeyViolations.length,
    0,
    `Source code contains pseudo key (gen_*) calls:\n${pseudoKeyViolations.join("\n")}`,
  );
});

test("i18n configuration supports multi-language extensions and fallback", () => {
  const i18nConfigPath = path.join(clientSrc, "i18n.ts");
  assert.ok(fs.existsSync(i18nConfigPath), "i18n.ts configuration file must exist");

  const configContent = fs.readFileSync(i18nConfigPath, "utf-8");
  assert.match(configContent, /fallbackLng/, "i18n.ts must define fallbackLng");
  assert.match(configContent, /resources/, "i18n.ts must define resources for locale bundles");
});
