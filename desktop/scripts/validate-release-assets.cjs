const fs = require("node:fs");
const path = require("node:path");
const {
  parseDesktopReleaseVersion,
} = require("./release-contract.cjs");
const {
  ReleaseAssetContractError,
  buildReleaseDownloadUrl,
  fail,
  parseUpdateMetadata,
  sha512File,
  validateMetadataFile,
} = require("./release-asset-metadata.cjs");

const RELEASE_ASSET_MANIFEST_SCHEMA_VERSION = 1;
const PLATFORMS = new Set(["win", "mac", "all"]);
const SIGNING_STATUSES = new Set(["none", "full"]);
const UPDATE_METADATA_NAMES = new Set([
  "beta.yml",
  "latest.yml",
  "beta-mac.yml",
  "latest-mac.yml",
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseExpectedRepository(value) {
  const source = typeof value === "string" ? value.trim() : "";
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(source);
  if (!match) {
    fail("INVALID_EXPECTED_REPOSITORY", `Expected repository must be owner/repo; received ${source || "<empty>"}.`);
  }
  return { owner: match[1], repo: match[2], slug: `${match[1]}/${match[2]}` };
}

function parseReleaseTag(tag) {
  const normalizedTag = typeof tag === "string" ? tag.trim() : "";
  if (!normalizedTag.startsWith("v")) {
    fail("INVALID_RELEASE_TAG", `Desktop release tag must be vX.Y.Z or vX.Y.Z-beta.N; received ${normalizedTag || "<empty>"}.`);
  }
  let parsedVersion;
  try {
    parsedVersion = parseDesktopReleaseVersion(normalizedTag.slice(1));
  } catch (_error) {
    fail("INVALID_RELEASE_TAG", `Desktop release tag must be vX.Y.Z or vX.Y.Z-beta.N; received ${normalizedTag}.`);
  }
  if (parsedVersion.tag !== normalizedTag) {
    fail("INVALID_RELEASE_TAG", `Desktop release tag must exactly equal ${parsedVersion.tag}.`);
  }
  return parsedVersion;
}

function parseCliArgs(argv) {
  const options = {
    help: false,
    tag: "",
    version: "",
    mode: "",
    platform: "",
    assetsDir: "",
    expectedRepo: "",
    signingStatus: "",
    windowsSigningStatus: "",
    macSigningStatus: "",
  };
  const valueFlags = new Map([
    ["--tag", "tag"],
    ["--version", "version"],
    ["--mode", "mode"],
    ["--platform", "platform"],
    ["--assets-dir", "assetsDir"],
    ["--expected-repo", "expectedRepo"],
    ["--signing-status", "signingStatus"],
    ["--windows-signing-status", "windowsSigningStatus"],
    ["--mac-signing-status", "macSigningStatus"],
  ]);
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    const property = valueFlags.get(argument);
    if (!property) {
      fail("UNKNOWN_ARGUMENT", `Unknown argument: ${argument}`);
    }
    if (seen.has(property)) {
      fail("DUPLICATE_ARGUMENT", `${argument} may only be provided once.`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail("MISSING_ARGUMENT_VALUE", `${argument} requires a value.`);
    }
    options[property] = value.trim();
    seen.add(property);
    index += 1;
  }
  return options;
}

function printHelp(write = process.stdout.write.bind(process.stdout)) {
  write([
    "Usage: node desktop/scripts/validate-release-assets.cjs --tag vX.Y.Z[-beta.N] --platform win|mac|all --assets-dir <dir> --expected-repo owner/repo [options]",
    "",
    "Options:",
    "  --version X.Y.Z[-beta.N]       Confirm the version derived from --tag.",
    "  --mode beta|stable             Confirm the release mode derived from --tag.",
    "  --signing-status none|full     Confirm signing for a single-platform validation.",
    "  --windows-signing-status ...   Confirm Windows signing when --platform all.",
    "  --mac-signing-status ...       Confirm macOS signing when --platform all.",
    "",
    "The command performs no network writes and prints one safe JSON manifest to stdout.",
    "",
  ].join("\n"));
}

function assertSigningStatus(value, flagName) {
  if (value && !SIGNING_STATUSES.has(value)) {
    fail("INVALID_SIGNING_STATUS", `${flagName} must be none or full; received ${value}.`);
  }
}

function normalizeValidationOptions(options) {
  const parsedVersion = parseReleaseTag(options.tag);
  if (!PLATFORMS.has(options.platform)) {
    fail("INVALID_ASSET_PLATFORM", `Asset platform must be win, mac, or all; received ${options.platform || "<empty>"}.`);
  }
  if (options.version && options.version !== parsedVersion.version) {
    fail("VERSION_TAG_MISMATCH", `Version ${options.version} does not match tag ${parsedVersion.tag}.`);
  }
  if (options.mode && options.mode !== parsedVersion.mode) {
    fail("MODE_TAG_MISMATCH", `Mode ${options.mode} does not match ${parsedVersion.mode} tag ${parsedVersion.tag}.`);
  }
  assertSigningStatus(options.signingStatus, "--signing-status");
  assertSigningStatus(options.windowsSigningStatus, "--windows-signing-status");
  assertSigningStatus(options.macSigningStatus, "--mac-signing-status");

  if (options.platform === "all" && options.signingStatus) {
    fail("AMBIGUOUS_SIGNING_STATUS", "Use platform-specific signing status flags when --platform all is selected.");
  }
  if (options.platform !== "all" && (options.windowsSigningStatus || options.macSigningStatus)) {
    fail("UNUSED_SIGNING_STATUS", "Platform-specific signing status flags are only valid with --platform all.");
  }

  const repository = parseExpectedRepository(options.expectedRepo);
  const assetsDir = path.resolve(options.assetsDir || "");
  if (!options.assetsDir || !fs.existsSync(assetsDir) || !fs.statSync(assetsDir).isDirectory()) {
    fail("ASSET_DIRECTORY_MISSING", `Release asset directory does not exist: ${options.assetsDir || "<empty>"}.`);
  }
  if (fs.lstatSync(assetsDir).isSymbolicLink()) {
    fail("SYMLINK_ASSET_FORBIDDEN", `Release asset directory must not be a symbolic link: ${options.assetsDir}.`);
  }

  return {
    parsedVersion,
    platform: options.platform,
    assetsDir,
    repository,
    expectedSigning: {
      win: options.platform === "win" ? options.signingStatus || null : options.windowsSigningStatus || null,
      mac: options.platform === "mac" ? options.signingStatus || null : options.macSigningStatus || null,
    },
  };
}

function collectFiles(assetsDir) {
  const files = [];
  const pending = [assetsDir];
  while (pending.length > 0) {
    const currentDirectory = pending.pop();
    const entries = fs.readdirSync(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        fail("SYMLINK_ASSET_FORBIDDEN", `Release asset directories must not contain symbolic links: ${absolutePath}.`);
      }
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        fail("UNSUPPORTED_ASSET_ENTRY", `Release asset entry is not a regular file: ${absolutePath}.`);
      }
      const relativePath = path.relative(assetsDir, absolutePath).split(path.sep).join("/");
      files.push({
        absolutePath,
        relativePath,
        name: entry.name,
        size: fs.statSync(absolutePath).size,
      });
    }
  }

  const byCaseFoldedName = new Map();
  for (const file of files) {
    const foldedName = file.name.toLocaleLowerCase("en-US");
    const previous = byCaseFoldedName.get(foldedName);
    if (previous) {
      fail(
        "DUPLICATE_ASSET_NAME",
        `Release assets must have unique filenames; ${previous.relativePath} and ${file.relativePath} collide.`,
      );
    }
    byCaseFoldedName.set(foldedName, file);
  }
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

function artifactPatterns(version) {
  const escapedVersion = escapeRegExp(version);
  return [
    { platform: "win", kind: "windows-nsis", pattern: new RegExp(`^(.+)-${escapedVersion}-setup-x64(-unsigned)?\\.exe$`) },
    { platform: "win", kind: "windows-portable", pattern: new RegExp(`^(.+)-${escapedVersion}-portable-x64(-unsigned)?\\.exe$`) },
    { platform: "mac", kind: "mac-dmg", pattern: new RegExp(`^(.+)-${escapedVersion}-mac-arm64(-unsigned)?\\.dmg$`) },
    { platform: "mac", kind: "mac-zip", pattern: new RegExp(`^(.+)-${escapedVersion}-mac-arm64(-unsigned)?\\.zip$`) },
  ];
}

function classifyPrimaryArtifacts(files, version, selectedPlatform) {
  const patterns = artifactPatterns(version);
  const artifacts = [];
  for (const file of files) {
    let matched = false;
    for (const candidate of patterns) {
      const match = candidate.pattern.exec(file.name);
      if (!match) {
        continue;
      }
      matched = true;
      if (selectedPlatform !== "all" && selectedPlatform !== candidate.platform) {
        fail("UNEXPECTED_PLATFORM_ASSET", `${file.name} does not belong to requested platform ${selectedPlatform}.`);
      }
      artifacts.push({
        ...file,
        platform: candidate.platform,
        kind: candidate.kind,
        productPrefix: match[1],
        signingStatus: match[2] ? "none" : "full",
      });
      break;
    }
    if (!matched && /\.(?:exe|dmg|zip)$/i.test(file.name)) {
      fail("UNRECOGNIZED_PRIMARY_ASSET", `Release artifact does not match version/platform naming contract: ${file.name}.`);
    }
  }
  return artifacts;
}

function requireArtifactKinds(artifacts, platform) {
  const requiredKinds = platform === "win"
    ? ["windows-nsis", "windows-portable"]
    : ["mac-dmg", "mac-zip"];
  const platformArtifacts = artifacts.filter((asset) => asset.platform === platform);
  for (const kind of requiredKinds) {
    const matches = platformArtifacts.filter((asset) => asset.kind === kind);
    if (matches.length !== 1) {
      fail("REQUIRED_ASSET_COUNT", `Expected exactly one ${kind} artifact; found ${matches.length}.`);
    }
  }
  const prefixes = new Set(platformArtifacts.map((asset) => asset.productPrefix));
  if (prefixes.size !== 1) {
    fail("PRODUCT_NAME_MISMATCH", `${platform} artifacts do not share one product-name prefix.`);
  }
  const signingStatuses = new Set(platformArtifacts.map((asset) => asset.signingStatus));
  if (signingStatuses.size !== 1) {
    fail("MIXED_SIGNING_ARTIFACTS", `${platform} artifacts mix signed and unsigned filenames.`);
  }
  return {
    artifacts: platformArtifacts,
    productPrefix: [...prefixes][0],
    signingStatus: [...signingStatuses][0],
  };
}

function toManifestAsset(file, classification, repository, tag) {
  if (!/^[0-9A-Za-z][0-9A-Za-z._ -]*$/.test(file.name) || file.name.trim() !== file.name) {
    fail("UNSAFE_PUBLISH_ASSET_NAME", `GitHub release asset filename is not safe: ${file.name}.`);
  }
  return {
    name: file.name,
    relativePath: file.relativePath,
    platform: classification.platform,
    kind: classification.kind,
    size: file.size,
    sha512: sha512File(file.absolutePath),
    downloadUrl: buildReleaseDownloadUrl(repository, tag, file.name),
  };
}

function validateReleaseAssets(options) {
  const normalized = normalizeValidationOptions(options);
  const files = collectFiles(normalized.assetsDir);
  const primaryArtifacts = classifyPrimaryArtifacts(
    files,
    normalized.parsedVersion.version,
    normalized.platform,
  );
  const selectedPlatforms = normalized.platform === "all" ? ["win", "mac"] : [normalized.platform];
  const platformContracts = {};
  const artifactsByName = new Map(primaryArtifacts.map((artifact) => [artifact.name, artifact]));
  const manifestAssets = [];
  const updateMetadata = [];

  for (const platform of selectedPlatforms) {
    const platformContract = requireArtifactKinds(primaryArtifacts, platform);
    const expectedSigning = normalized.expectedSigning[platform];
    if (expectedSigning && platformContract.signingStatus !== expectedSigning) {
      fail(
        "SIGNING_STATUS_MISMATCH",
        `${platform} artifacts imply ${platformContract.signingStatus} signing, expected ${expectedSigning}.`,
      );
    }
    platformContracts[platform] = {
      signingStatus: platformContract.signingStatus,
      productPrefix: platformContract.productPrefix,
      updatesEnabled: platform !== "mac" || platformContract.signingStatus === "full",
    };
    for (const artifact of platformContract.artifacts) {
      manifestAssets.push(toManifestAsset(artifact, artifact, normalized.repository, normalized.parsedVersion.tag));
    }
  }

  const expectedMetadataNames = {
    win: `${normalized.parsedVersion.updateChannel}.yml`,
    mac: `${normalized.parsedVersion.updateChannel}-mac.yml`,
  };
  const filesByName = new Map(files.map((file) => [file.name, file]));
  for (const file of files) {
    if (!UPDATE_METADATA_NAMES.has(file.name)) {
      continue;
    }
    const metadataPlatform = file.name.endsWith("-mac.yml") ? "mac" : "win";
    if (!selectedPlatforms.includes(metadataPlatform)) {
      fail("UNEXPECTED_PLATFORM_METADATA", `${file.name} does not belong to requested platform ${normalized.platform}.`);
    }
    if (file.name !== expectedMetadataNames[metadataPlatform]) {
      fail(
        "UNEXPECTED_UPDATE_CHANNEL_METADATA",
        `${file.name} does not match ${normalized.parsedVersion.updateChannel} channel tag ${normalized.parsedVersion.tag}.`,
      );
    }
  }

  for (const platform of selectedPlatforms) {
    const metadataName = expectedMetadataNames[platform];
    const metadataFile = filesByName.get(metadataName);
    const updatesEnabled = platformContracts[platform].updatesEnabled;
    if (!updatesEnabled) {
      if (metadataFile) {
        fail("UNSIGNED_MAC_FEED_FORBIDDEN", `Unsigned macOS release must not contain ${metadataName}.`);
      }
      continue;
    }
    if (!metadataFile) {
      fail("UPDATE_METADATA_MISSING", `${platform} release requires ${metadataName}.`);
    }
    const validatedMetadata = validateMetadataFile({
      metadataFile,
      platform,
      parsedVersion: normalized.parsedVersion,
      repository: normalized.repository,
      artifactsByName,
    });
    updateMetadata.push(validatedMetadata);
    manifestAssets.push(toManifestAsset(
      metadataFile,
      { platform, kind: `${platform}-update-metadata` },
      normalized.repository,
      normalized.parsedVersion.tag,
    ));
  }

  for (const file of files) {
    if (!file.name.endsWith(".blockmap")) {
      continue;
    }
    const primaryName = file.name.slice(0, -".blockmap".length);
    const primary = artifactsByName.get(primaryName);
    if (!primary || !selectedPlatforms.includes(primary.platform)) {
      fail("ORPHAN_BLOCKMAP", `${file.name} does not belong to a validated release artifact.`);
    }
    manifestAssets.push(toManifestAsset(
      file,
      { platform: primary.platform, kind: `${primary.kind}-blockmap` },
      normalized.repository,
      normalized.parsedVersion.tag,
    ));
  }

  const uniqueManifestNames = new Set(manifestAssets.map((asset) => asset.name));
  if (uniqueManifestNames.size !== manifestAssets.length) {
    fail("DUPLICATE_MANIFEST_ASSET", "Validated publisher manifest contains duplicate asset names.");
  }
  manifestAssets.sort((left, right) => left.name.localeCompare(right.name));
  updateMetadata.sort((left, right) => left.name.localeCompare(right.name));

  return {
    schemaVersion: RELEASE_ASSET_MANIFEST_SCHEMA_VERSION,
    repository: normalized.repository.slug,
    tag: normalized.parsedVersion.tag,
    version: normalized.parsedVersion.version,
    mode: normalized.parsedVersion.mode,
    channel: normalized.parsedVersion.updateChannel,
    releaseType: normalized.parsedVersion.releaseType,
    requestedPlatform: normalized.platform,
    platforms: platformContracts,
    assets: manifestAssets,
    updateMetadata,
  };
}

function main({ argv = process.argv.slice(2), write = process.stdout.write.bind(process.stdout) } = {}) {
  const options = parseCliArgs(argv);
  if (options.help) {
    printHelp(write);
    return null;
  }
  const manifest = validateReleaseAssets(options);
  write(`${JSON.stringify(manifest)}\n`);
  return manifest;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const code = error instanceof ReleaseAssetContractError ? ` ${error.code}` : "";
    process.stderr.write(`[release-assets]${code}: ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  RELEASE_ASSET_MANIFEST_SCHEMA_VERSION,
  ReleaseAssetContractError,
  buildReleaseDownloadUrl,
  collectFiles,
  main,
  parseCliArgs,
  parseExpectedRepository,
  parseReleaseTag,
  parseUpdateMetadata,
  validateReleaseAssets,
};
