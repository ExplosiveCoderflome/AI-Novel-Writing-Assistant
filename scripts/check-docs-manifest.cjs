const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "site", "src", "docsManifest.ts");
const publicDocsDir = path.join(repoRoot, "docs", "public");
const releaseNotesPath = path.join(repoRoot, "docs", "releases", "release-notes.md");
const directorProgressPath = path.join(
  repoRoot,
  "server",
  "src",
  "services",
  "novel",
  "director",
  "projections",
  "novelDirectorProgress.ts",
);
const autoDirectorPipelineDocPath = path.join(
  repoRoot,
  "docs",
  "public",
  "flow",
  "auto-director-pipeline.md",
);

function walkMarkdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkMarkdownFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  });
}

function toManifestSourcePath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

const manifest = fs.readFileSync(manifestPath, "utf8");
const manifestPaths = [
  ...manifest.matchAll(/"(docs\/(?:public|releases)\/[^"]+\.md)"/g),
].map((match) => match[1]);
const manifestSet = new Set(manifestPaths);
const expectedPaths = [
  ...walkMarkdownFiles(publicDocsDir).map(toManifestSourcePath),
  toManifestSourcePath(releaseNotesPath),
].sort();
const expectedSet = new Set(expectedPaths);

const missing = expectedPaths.filter((sourcePath) => !manifestSet.has(sourcePath));
const stale = manifestPaths.filter((sourcePath) => !expectedSet.has(sourcePath));
const duplicate = manifestPaths.filter((sourcePath, index) => manifestPaths.indexOf(sourcePath) !== index);

function readDirectorProgressKeys() {
  const source = fs.readFileSync(directorProgressPath, "utf8");
  const match = /export type DirectorProgressItemKey\s*=([\s\S]*?);/.exec(source);
  if (!match) {
    throw new Error("Unable to locate DirectorProgressItemKey in novelDirectorProgress.ts.");
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]).sort();
}

function readDocumentedDirectorProgressKeys() {
  const source = fs.readFileSync(autoDirectorPipelineDocPath, "utf8");
  const match = /DIRECTOR_PROGRESS_ITEM_KEYS:\s*([^\n<]+)/.exec(source);
  if (!match) {
    throw new Error("Unable to locate DIRECTOR_PROGRESS_ITEM_KEYS marker in auto-director-pipeline.md.");
  }
  return match[1]
    .replace(/-->.*/, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .sort();
}

const codeProgressKeys = readDirectorProgressKeys();
const documentedProgressKeys = readDocumentedDirectorProgressKeys();
const documentedSet = new Set(documentedProgressKeys);
const codeSet = new Set(codeProgressKeys);
const missingProgressKeys = codeProgressKeys.filter((key) => !documentedSet.has(key));
const staleProgressKeys = documentedProgressKeys.filter((key) => !codeSet.has(key));

if (
  missing.length > 0
  || stale.length > 0
  || duplicate.length > 0
  || missingProgressKeys.length > 0
  || staleProgressKeys.length > 0
) {
  console.error("Docs manifest check failed.");

  if (missing.length > 0) {
    console.error("\nMissing from site/src/docsManifest.ts:");
    missing.forEach((sourcePath) => console.error(`  - ${sourcePath}`));
  }

  if (stale.length > 0) {
    console.error("\nRegistered but file does not exist:");
    stale.forEach((sourcePath) => console.error(`  - ${sourcePath}`));
  }

  if (duplicate.length > 0) {
    console.error("\nDuplicate public document paths:");
    duplicate.forEach((sourcePath) => console.error(`  - ${sourcePath}`));
  }

  if (missingProgressKeys.length > 0) {
    console.error("\nDirectorProgressItemKey values missing from auto-director-pipeline.md:");
    missingProgressKeys.forEach((key) => console.error(`  - ${key}`));
  }

  if (staleProgressKeys.length > 0) {
    console.error("\nDocumented director progress keys not found in code:");
    staleProgressKeys.forEach((key) => console.error(`  - ${key}`));
  }

  process.exit(1);
}

console.log(
  `Docs manifest check passed: ${expectedPaths.length} public documents registered; ${codeProgressKeys.length} director progress keys covered.`,
);
