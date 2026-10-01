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
  for (const file of listTsFiles(moduleRoot)) {
    const source = fs.readFileSync(file, "utf8");
    for (const specifier of importSpecifiers(source)) {
      const relative = path.relative(moduleRoot, file);
      if (!specifier.startsWith(".")) {
        violations.push(`${relative} imports package or alias "${specifier}"`);
        continue;
      }
      const resolved = path.resolve(path.dirname(file), specifier);
      if (resolved !== moduleRoot && !resolved.startsWith(`${moduleRoot}${path.sep}`)) {
        violations.push(`${relative} imports outside the module: "${specifier}"`);
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
