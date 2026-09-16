const fs = require("node:fs");
const path = require("node:path");

const siteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(siteRoot, "..");
const filename = "auto-director-idea-to-novel.detailed.workflow.html";
const source = path.join(repoRoot, "docs", "architecture", filename);
const outputDir = path.join(siteRoot, "public", "architecture");

fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(source, path.join(outputDir, filename));
console.log(`synced architecture/${filename}`);
