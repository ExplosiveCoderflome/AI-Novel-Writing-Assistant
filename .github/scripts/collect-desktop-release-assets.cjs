const fs = require("node:fs");
const path = require("node:path");

function parseArgs(args) {
  const sources = [];
  let output = "";
  let outputSeen = false;
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!value || !["--source", "--output"].includes(option)) {
      throw new Error(`Invalid asset collector option ${option || "<missing>"}.`);
    }
    if (option === "--source") {
      sources.push(path.resolve(value));
    } else {
      if (outputSeen) {
        throw new Error("--output may only be provided once.");
      }
      output = path.resolve(value);
      outputSeen = true;
    }
  }
  if (sources.length < 2 || !output) {
    throw new Error("Asset collection requires at least two --source directories and one --output directory.");
  }
  return { sources, output };
}

function collectFiles(directory) {
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

function main() {
  const { sources, output } = parseArgs(process.argv.slice(2));
  if (fs.existsSync(output) && fs.readdirSync(output).length > 0) {
    throw new Error(`Asset output directory must be empty: ${output}.`);
  }
  fs.mkdirSync(output, { recursive: true });

  const seenNames = new Map();
  for (const source of sources) {
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
      throw new Error(`Asset source directory does not exist: ${source}.`);
    }
    for (const filePath of collectFiles(source)) {
      const name = path.basename(filePath);
      if (seenNames.has(name)) {
        throw new Error(`Duplicate release asset ${name} in ${seenNames.get(name)} and ${filePath}.`);
      }
      const size = fs.statSync(filePath).size;
      if (size <= 0) {
        throw new Error(`Release asset is empty: ${filePath}.`);
      }
      seenNames.set(name, filePath);
      fs.copyFileSync(filePath, path.join(output, name));
    }
  }
  process.stdout.write(`${JSON.stringify({ assets: Array.from(seenNames.keys()).sort() })}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[collect-desktop-release-assets] ${error.message}`);
    process.exit(1);
  }
}

module.exports = { collectFiles, main, parseArgs };
