const { execFileSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const supportedPlatforms = ["win", "mac"];
const defaultArchByPlatform = {
  win: "x64",
  mac: "arm64",
};

function parsePublishArgs(argv) {
  const options = {
    platform: "win",
    arch: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--platform") {
      options.platform = String(argv[index + 1] ?? "").trim().toLowerCase();
      index += 1;
      continue;
    }
    if (arg.startsWith("--platform=")) {
      options.platform = arg.slice("--platform=".length).trim().toLowerCase();
      continue;
    }
    if (arg === "--arch") {
      options.arch = String(argv[index + 1] ?? "").trim().toLowerCase();
      index += 1;
      continue;
    }
    if (arg.startsWith("--arch=")) {
      options.arch = arg.slice("--arch=".length).trim().toLowerCase();
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown publish argument: ${arg}`);
  }

  if (!supportedPlatforms.includes(options.platform)) {
    throw new Error(`Unsupported publish platform "${options.platform}". Expected one of: ${supportedPlatforms.join(", ")}.`);
  }

  if (!options.arch) {
    options.arch = defaultArchByPlatform[options.platform];
  }

  return options;
}

function resolveBuilderArgs(options, winTargets = []) {
  const platformArgs = options.platform === "mac" ? ["--mac"] : ["--win", ...winTargets];
  return [...platformArgs, `--${options.arch}`];
}

function printUsage(scriptName) {
  console.log(`Usage: node desktop/scripts/${scriptName}.cjs [--platform win|mac] [--arch <arch>]`);
  console.log("");
  console.log("  --platform  Target platform. Defaults to win.");
  console.log("  --arch      Target architecture. Defaults to x64 on win and arm64 on mac.");
}

function runDesktopPublish(options) {
  const parsed = parsePublishArgs(options.argv);

  if (parsed.help) {
    printUsage(options.scriptName);
    return;
  }

  // The Windows beta channel publishes the NSIS installer only; macOS always
  // publishes the dmg + zip pair defined in the builder config.
  const winTargets = parsed.platform === "win" && options.winTargets ? options.winTargets : [];
  const builderArgs = resolveBuilderArgs(parsed, winTargets);
  console.log(
    `[${options.label}] publishing platform=${parsed.platform} arch=${parsed.arch} channel=${options.channel}`,
  );

  execFileSync(process.execPath, [
    path.join("desktop", "scripts", "run-electron-builder.cjs"),
    ...builderArgs,
    "--publish",
    "always",
  ], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      AI_NOVEL_RELEASE_CHANNEL: options.channel,
    },
  });
}

module.exports = {
  defaultArchByPlatform,
  parsePublishArgs,
  resolveBuilderArgs,
  runDesktopPublish,
};
