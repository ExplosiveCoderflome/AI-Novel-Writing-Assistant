const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const moduleRoot = path.resolve(__dirname, "../../src/modules/director");

function listTsFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTsFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

test("the director module exists and has source files", () => {
  assert.equal(fs.existsSync(moduleRoot), true);
  assert.ok(listTsFiles(moduleRoot).length > 0);
});

test("the director module only imports files inside itself", () => {
  const violations = [];
  const infrastructureRoot = path.join(moduleRoot, "infrastructure");
  const runtimeFile = path.join(moduleRoot, "application", "runtime.ts");
  const httpRoot = path.join(moduleRoot, "http");
  const applicationRoot = path.join(moduleRoot, "application");
  const allowedInfrastructureImports = new Set([
    "@prisma/client",
    "../../../db/prisma",
    "node:crypto",
  ]);
  const allowedHttpImports = new Set([
    "express",
    "zod",
    "@ai-novel/shared/types/director/characterCandidates",
  ]);
  for (const file of listTsFiles(moduleRoot)) {
    const source = fs.readFileSync(file, "utf8");
    const isInfrastructure = file === infrastructureRoot || file.startsWith(`${infrastructureRoot}${path.sep}`);
    const isRuntime = file === runtimeFile;
    const isHttp = file === httpRoot || file.startsWith(`${httpRoot}${path.sep}`);
    const isApplication = file === applicationRoot || file.startsWith(`${applicationRoot}${path.sep}`);
    for (const specifier of importSpecifiers(source)) {
      const relative = path.relative(moduleRoot, file);
      if (!specifier.startsWith(".")) {
        const allowedRuntimeImport = isRuntime && (specifier === "node:crypto" || specifier === "node:os");
        const allowedHttpImport = isHttp && allowedHttpImports.has(specifier);
        if ((!isInfrastructure || !allowedInfrastructureImports.has(specifier)) && !allowedRuntimeImport && !allowedHttpImport) {
          violations.push(`${relative} imports package or alias "${specifier}"`);
        }
        continue;
      }
      const resolved = path.resolve(path.dirname(file), specifier);
      if ((isApplication || isHttp) && resolved === infrastructureRoot || (isApplication || isHttp) && resolved.startsWith(`${infrastructureRoot}${path.sep}`)) {
        violations.push(`${relative} imports infrastructure directly: "${specifier}"`);
        continue;
      }
      if (resolved !== moduleRoot && !resolved.startsWith(`${moduleRoot}${path.sep}`)) {
        if (!isInfrastructure || specifier !== "../../../db/prisma") {
          violations.push(`${relative} imports outside the module: "${specifier}"`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("the domain layer contains no persistence, clock or randomness calls", () => {
  const domainRoot = path.join(moduleRoot, "domain");
  const forbidden = [/\bDate\.now\s*\(/, /\bnew Date\s*\(/, /\bMath\.random\s*\(/, /\bprocess\.env\b/];
  const violations = [];
  for (const file of listTsFiles(domainRoot)) {
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(source)) {
        violations.push(`${path.relative(moduleRoot, file)} matches ${pattern}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
