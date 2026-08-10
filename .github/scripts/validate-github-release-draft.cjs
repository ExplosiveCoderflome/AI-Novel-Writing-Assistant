const fs = require("node:fs");
const path = require("node:path");

function parseArgs(args) {
  const parsed = {};
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!value || !["--release-json", "--assets-dir", "--tag", "--prerelease"].includes(option)) {
      throw new Error(`Invalid release-draft option ${option || "<missing>"}.`);
    }
    if (seen.has(option)) {
      throw new Error(`${option} may only be provided once.`);
    }
    parsed[option] = value;
    seen.add(option);
  }
  for (const required of ["--release-json", "--assets-dir", "--tag", "--prerelease"]) {
    if (!parsed[required]) {
      throw new Error(`Missing required option ${required}.`);
    }
  }
  if (!["true", "false"].includes(parsed["--prerelease"])) {
    throw new Error("--prerelease must be exactly true or false.");
  }
  return parsed;
}

function localAssets(directory) {
  return new Map(
    fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [entry.name, fs.statSync(path.join(directory, entry.name)).size]),
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const release = JSON.parse(fs.readFileSync(options["--release-json"], "utf8"));
  const expectedPrerelease = options["--prerelease"] === "true";
  if (release.tag_name !== options["--tag"] || release.draft !== true || release.prerelease !== expectedPrerelease) {
    throw new Error("GitHub draft tag, draft state, or prerelease state does not match the validated contract.");
  }

  const local = localAssets(path.resolve(options["--assets-dir"]));
  const remote = new Map((release.assets || []).map((asset) => [asset.name, asset.size]));
  if (local.size !== remote.size) {
    throw new Error(`GitHub draft has ${remote.size} assets; expected ${local.size}.`);
  }
  for (const [name, size] of local) {
    if (remote.get(name) !== size || size <= 0) {
      throw new Error(`GitHub draft asset ${name} is missing, empty, or has an unexpected size.`);
    }
  }
  process.stdout.write(`${JSON.stringify({ assets: local.size, draft: true, prerelease: expectedPrerelease })}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[validate-github-release-draft] ${error.message}`);
    process.exit(1);
  }
}

module.exports = { localAssets, main, parseArgs };
