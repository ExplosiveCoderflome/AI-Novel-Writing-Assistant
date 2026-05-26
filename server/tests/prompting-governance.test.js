const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SERVER_ROOT = path.join(__dirname, "..");
const SOURCE_ROOT = path.join(SERVER_ROOT, "src");
const PROMPT_ROOT = path.join(SOURCE_ROOT, "prompting", "prompts");
const {
  listRegisteredPromptAssets,
} = require("../dist/prompting/registry.js");

const GOVERNED_DIRECTORIES = [
  path.join(SOURCE_ROOT, "services"),
  path.join(SOURCE_ROOT, "agents"),
  path.join(SOURCE_ROOT, "routes"),
  path.join(SOURCE_ROOT, "graphs"),
];

const INLINE_PROMPT_ALLOWED_FILES = new Set([
  "src/routes/chat.ts",
  "src/services/title/titlePromptBuilder.ts",
  "src/services/novel/novelCoreGenerationService.ts",
]);

const INLINE_PROMPT_ALLOWED_PREFIXES = [
  "src/graphs/",
];

const DIRECT_GET_LLM_ALLOWED_FILES = new Set([
  "src/routes/chat.ts",
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

const CORE_AUDIT_PROMPTS = [
  "planner.intent.parse",
  "novel.chapter.writer",
  "audit.chapter.full",
  "audit.chapter.light",
  "novel.director.workspace_analysis",
  "novel.director.manual_edit_impact",
  "novel.chapter_editor.user_intent",
  "novel.chapter_editor.workspace_diagnosis",
  "novel.chapter_editor.rewrite_candidates",
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

test("prompt governance keeps registered prompt assets auditable", () => {
  const incomplete = listRegisteredPromptAssets()
    .filter((asset) => !asset.id
      || !asset.version
      || !asset.taskType
      || !asset.mode
      || !asset.contextPolicy
      || typeof asset.render !== "function")
    .map((asset) => `${asset.id || "<missing-id>"}@${asset.version || "<missing-version>"}`);

  assert.deepEqual(incomplete, []);
});

test("core prompt management surfaces expose context and low-risk slot metadata", () => {
  const assets = new Map(listRegisteredPromptAssets().map((asset) => [asset.id, asset]));
  const missingContext = CORE_AUDIT_PROMPTS
    .filter((id) => !Array.isArray(assets.get(id)?.contextRequirements)
      || assets.get(id).contextRequirements.length === 0);

  assert.deepEqual(missingContext, []);
  assert.ok(assets.get("novel.chapter.writer").editableSlots.some((slot) => slot.key === "writer.tonePreference"));
  assert.ok(assets.get("audit.chapter.full").editableSlots.some((slot) => slot.key === "audit.reportStyle"));
  assert.ok(assets.get("novel.chapter_editor.rewrite_candidates").editableSlots.some((slot) => slot.key === "chapterEditor.candidateStyle"));
});

test("prompt quality telemetry stays in-process and schema-free", () => {
  const source = fs.readFileSync(
    path.join(SOURCE_ROOT, "prompting", "core", "promptQualityTelemetry.ts"),
    "utf8",
  );

  assert.equal(source.includes("prisma"), false);
  assert.equal(source.includes("@prisma"), false);
  assert.equal(source.includes("db/"), false);
});

test("prompt editable slots cannot override post validation governance fields", () => {
  const forbiddenSlotKeys = [
    "outputSchema",
    "postValidate",
    "postValidateFailureRecovery",
    "semanticRetryPolicy",
    "repairPolicy",
  ];
  const offenders = listRegisteredPromptAssets()
    .flatMap((asset) => (asset.editableSlots ?? [])
      .filter((slot) => forbiddenSlotKeys.includes(slot.key))
      .map((slot) => `${asset.id}@${asset.version}:${slot.key}`));

  assert.deepEqual(offenders, []);
});
