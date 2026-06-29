const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "site", "src", "docsManifest.ts");
const publicDocsDir = path.join(repoRoot, "docs", "public");
const releaseNotesPath = path.join(repoRoot, "docs", "releases", "release-notes.md");

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

if (missing.length > 0 || stale.length > 0 || duplicate.length > 0) {
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

  process.exit(1);
}

console.log(`Docs manifest check passed: ${expectedPaths.length} public documents registered.`);
