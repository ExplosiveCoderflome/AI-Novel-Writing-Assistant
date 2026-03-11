const fs = require("fs");

const [filePath, startRaw, endRaw] = process.argv.slice(2);
if (!filePath) {
  process.stderr.write("Usage: node scripts/print-lines.js <file> [start] [end]\n");
  process.exit(1);
}

const start = Number(startRaw || 1);
const end = Number(endRaw || Number.MAX_SAFE_INTEGER);
const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

for (let index = Math.max(1, start); index <= Math.min(lines.length, end); index += 1) {
  process.stdout.write(`${String(index).padStart(4, " ")}: ${lines[index - 1]}\n`);
}
