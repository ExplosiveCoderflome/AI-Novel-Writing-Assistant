const path = require("node:path");
const { checkRevision } = require("./guard.cjs");

const args = process.argv.slice(2);
const unknownArg = args.find(arg => arg !== "--force-tests");
if (unknownArg) {
  console.error(`[desktop-release] Unknown argument: ${unknownArg}`);
  process.exitCode = 1;
} else {
  try { checkRevision(path.resolve(__dirname, "../.."), { forceTests: args.includes("--force-tests") }); }
  catch (error) { console.error(`[desktop-release] ${error.message}`); process.exitCode = 1; }
}
