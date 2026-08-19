const fs = require("fs");
const path = require("path");

const SHARED_TYPES_DIR = path.resolve(__dirname, "..", "shared", "types");
const SUBDIRS = ["character", "chapter", "director", "novel", "world", "style", "volume", "common"];

console.log("=== Generating Re-export files in shared/types ===");

let count = 0;
for (const sub of SUBDIRS) {
  const dirPath = path.join(SHARED_TYPES_DIR, sub);
  if (!fs.existsSync(dirPath)) continue;

  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    if (file.endsWith(".ts") && file !== "index.ts") {
      const baseName = path.basename(file, ".ts");
      const targetReexportFile = path.join(SHARED_TYPES_DIR, `${baseName}.ts`);

      const content = `export * from "./${sub}/${baseName}.js";\n`;
      fs.writeFileSync(targetReexportFile, content, "utf8");
      count++;
    }
  }
}

console.log(`✓ Successfully generated/updated ${count} re-export files in shared/types/`);
