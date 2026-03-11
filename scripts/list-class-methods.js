const fs = require("fs");

const [filePath] = process.argv.slice(2);
if (!filePath) {
  process.stderr.write("Usage: node scripts/list-class-methods.js <file>\n");
  process.exit(1);
}

const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (/^\s*(async|private\s+async)\s+[a-zA-Z0-9_]+\s*\(/.test(line)) {
    process.stdout.write(`${String(index + 1).padStart(4, " ")}: ${line.trim()}\n`);
  }
}
