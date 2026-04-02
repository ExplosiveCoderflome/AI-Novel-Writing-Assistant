const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SERVER_ROOT = path.join(__dirname, "..");
const SOURCE_ROOT = path.join(SERVER_ROOT, "src");
const PROMPT_ROOT = path.join(SOURCE_ROOT, "prompting", "prompts");

const GOVERNED_DIRECTORIES = [
  path.join(SOURCE_ROOT, "services"),
  path.join(SOURCE_ROOT, "agents"),
  path.join(SOURCE_ROOT, "routes"),
  path.join(SOURCE_ROOT, "graphs"),
];

const INLINE_PROMPT_ALLOWED_FILES = new Set([
  "src/routes/chat.ts",
  "src/services/title/titlePromptBuilder.ts",
  "src/services/writingFormula/WritingFormulaService.ts",
  "src/services/novel/novelCoreGenerationService.ts",
]);

const INLINE_PROMPT_ALLOWED_PREFIXES = [
  "src/graphs/",
];

const DIRECT_GET_LLM_ALLOWED_FILES = new Set([
  "src/routes/chat.ts",
  "src/services/writingFormula/WritingFormulaService.ts",
  "src/services/world/worldDraftGeneration.ts",
  "src/services/novel/novelCoreGenerationService.ts",
]);

const SYSTEM_PROMPT_BUILDER_ALLOWED_FILES = new Set([
  "src/routes/chat.ts",
  "src/agents/planner/intentPromptSupport.ts",
  "src/services/novel/director/novelDirectorPrompts.ts",
]);

const DIRECT_STRUCTURED_INVOKE_ALLOWED_FILES = new Set([
  "src/routes/chat.ts",
]);

const PROMPT_SCHEMA_SERVICE_IMPORT_DENYLIST = [
  "../../../services/character/characterSchemas",
  "../../../services/title/titleSchemas",
  "../../../services/novel/storyWorldSlice/worldSliceSchemas",
  "../../../services/styleEngine/styleDetectionSchema",
  "../../../services/genre/genreSchemas",
  "../../../services/storyMode/storyModeSchemas",
  "../../../services/novel/characterPrep/characterPreparationSchemas",
];

function listSourceFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function toRelativePath(filePath) {
  return path.relative(SERVER_ROOT, filePath).replace(/\\/g, "/");
}

function isAllowed(relativePath, allowedFiles, allowedPrefixes = []) {
  if (allowedFiles.has(relativePath)) {
    return true;
  }
  return allowedPrefixes.some((prefix) => relativePath.startsWith(prefix));
}

function collectViolations({ lineMatcher, allowedFiles, allowedPrefixes = [] }) {
  const violations = [];
  for (const directory of GOVERNED_DIRECTORIES) {
    for (const filePath of listSourceFiles(directory)) {
      const relativePath = toRelativePath(filePath);
      if (isAllowed(relativePath, allowedFiles, allowedPrefixes)) {
        continue;
      }
      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/g);
      for (let index = 0; index < lines.length; index += 1) {
        if (lineMatcher(lines[index])) {
          violations.push(`${relativePath}:${index + 1}`);
        }
      }
    }
  }
  return violations;
}

test("prompt governance keeps unexpected direct getLLM calls out of governed code", () => {
  const violations = collectViolations({
    lineMatcher: (line) => line.includes("getLLM("),
    allowedFiles: DIRECT_GET_LLM_ALLOWED_FILES,
  });
  assert.deepEqual(violations, []);
});

test("prompt governance keeps inline SystemMessage/HumanMessage builders in the approved set", () => {
  const violations = collectViolations({
    lineMatcher: (line) => line.includes("new SystemMessage(") || line.includes("new HumanMessage("),
    allowedFiles: INLINE_PROMPT_ALLOWED_FILES,
    allowedPrefixes: INLINE_PROMPT_ALLOWED_PREFIXES,
  });
  assert.deepEqual(violations, []);
});

test("prompt governance keeps ad-hoc systemPrompt builders in the approved set", () => {
  const violations = collectViolations({
    lineMatcher: (line) => line.includes("systemPrompt"),
    allowedFiles: SYSTEM_PROMPT_BUILDER_ALLOWED_FILES,
  });
  assert.deepEqual(violations, []);
});

test("prompt governance keeps direct structured invoke calls inside the approved exceptions", () => {
  const violations = collectViolations({
    lineMatcher: (line) => line.includes("invokeStructuredLlm(") || line.includes("invokeStructuredLlmDetailed("),
    allowedFiles: DIRECT_STRUCTURED_INVOKE_ALLOWED_FILES,
  });
  assert.deepEqual(violations, []);
});

test("prompt governance keeps prompt-local schemas out of services schema files once migrated", () => {
  const violations = [];
  for (const filePath of listSourceFiles(PROMPT_ROOT)) {
    const relativePath = toRelativePath(filePath);
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/g);
    for (let index = 0; index < lines.length; index += 1) {
      if (PROMPT_SCHEMA_SERVICE_IMPORT_DENYLIST.some((importPath) => lines[index].includes(importPath))) {
        violations.push(`${relativePath}:${index + 1}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
