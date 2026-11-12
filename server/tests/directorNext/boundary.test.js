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
  // The revision DTO is an explicit transport/application contract, never a domain dependency.
  const revisionContractConsumers = new Set([
    "application/commandService.ts", "application/ports.ts", "http/routes.ts",
    "infrastructure/commands/gateResolution.ts",
  ]);
  // Shared budget DTOs carry saved facts, not runtime or policy dependencies.
  const chapterBudgetContractConsumers = new Set([
    "application/commandService.ts", "application/ports.ts", "http/routes.ts",
    "infrastructure/commands/resumeRun.ts", "domain/projection.ts",
  ]);
  // The unknown-claim DTO carries one explicit user confirmation, never a service or policy.
  const unknownClaimContractConsumers = new Set([
    "application/commandService.ts", "application/ports.ts", "http/routes.ts",
    "domain/projection.ts",
  ]);
  // Chapter-list progress is a read-only DTO; volume-planning functions stay outside the kernel.
  const chapterListProgressContractConsumers = new Set([
    "application/factsLoader.ts", "domain/projection.ts", "steps/planning/volumeChapterList.ts",
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
        const allowedRevisionContract = specifier === "@ai-novel/shared/types/director/revision"
          && revisionContractConsumers.has(relative.replace(/\\/g, "/"));
        const allowedChapterBudgetContract = specifier === "@ai-novel/shared/types/director/chapterBudget"
          && chapterBudgetContractConsumers.has(relative.replace(/\\/g, "/"));
        const allowedUnknownClaimContract = specifier === "@ai-novel/shared/types/director/unknownClaims"
          && unknownClaimContractConsumers.has(relative.replace(/\\/g, "/"));
        const allowedWorkerContract = specifier === "@ai-novel/shared/types/director/worker"
          && relative.replace(/\\/g, "/") === "domain/projection.ts";
        const allowedChapterListProgressContract = specifier === "@ai-novel/shared/types/volumePlanning"
          && chapterListProgressContractConsumers.has(relative.replace(/\\/g, "/"));
        if (allowedChapterListProgressContract) {
          assert.match(source, /import\s+type\s*\{\s*VolumeChapterListProgress\s*\}\s*from\s*["']@ai-novel\/shared\/types\/volumePlanning["']/);
          assert.equal(importSpecifiers(source).filter(value => value === specifier).length, 1,
            "chapter-list progress permits one type-only import and no runtime imports or re-exports");
        }
        // Read-only transport facts carry no services, storage or policy into the application.
        const allowedRuntimeStatusContract = specifier === "@ai-novel/shared/types/director/runtimeStatus"
          && relative.replace(/\\/g, "/") === "application/diagnostics/runStatus.ts";
        if (allowedRuntimeStatusContract) {
          assert.match(source, /import\s+type\s*\{DirectorRuntimeStatus\}\s*from/);
        }
        if (allowedChapterBudgetContract && relative.replace(/\\/g, "/") === "domain/projection.ts") {
          assert.match(source, /import\s+type\s*\{\s*DirectorChapterBudgetView\s*\}\s*from\s*["']@ai-novel\/shared\/types\/director\/chapterBudget["']/);
        }
        if (allowedUnknownClaimContract && relative.replace(/\\/g, "/") === "domain/projection.ts") {
          assert.match(source, /import\s+type\s*\{\s*DirectorUnknownClaimsView\s*\}\s*from\s*["']@ai-novel\/shared\/types\/director\/unknownClaims["']/);
        }
        const allowedOutlineBindingContract = specifier === "@ai-novel/shared/types/outlineOpenBook"
          && relative.replace(/\\/g, "/") === "domain/types.ts";
        if (allowedOutlineBindingContract) {
          assert.match(source, /import\s+type\s*\{\s*OutlineBindingRef\s*\}\s*from/);
          assert.equal(importSpecifiers(source).filter(value => value === specifier).length, 1);
        }
        if ((!isInfrastructure || !allowedInfrastructureImports.has(specifier)) && !allowedRuntimeImport && !allowedHttpImport && !allowedRevisionContract && !allowedChapterBudgetContract && !allowedUnknownClaimContract && !allowedWorkerContract && !allowedRuntimeStatusContract && !allowedChapterListProgressContract && !allowedOutlineBindingContract) {
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
        const ownedExecutionAdapter = relative.replace(/\\/g, "/") === "infrastructure/execution/ExecutionScopeAdapter.ts"
          && specifier === "../../../../platform/runtime/execution";
        if ((!isInfrastructure || specifier !== "../../../db/prisma") && !ownedExecutionAdapter) {
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
