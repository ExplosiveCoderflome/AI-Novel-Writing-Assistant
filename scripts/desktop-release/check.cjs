const path = require("node:path");
const { checkRevision } = require("./guard.cjs");
try { checkRevision(path.resolve(__dirname, "../..")); }
catch (error) { console.error(`[desktop-release] ${error.message}`); process.exitCode = 1; }
