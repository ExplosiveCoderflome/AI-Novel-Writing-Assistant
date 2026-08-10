const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const RELEASE_CONTRACT_SCHEMA_VERSION = 1;
const CANONICAL_GITHUB_OWNER = "yangtzehina";
const CANONICAL_GITHUB_REPO = "AI-Novel-Writing-Assistant";
const RELEASE_MODES = new Set(["verify", "beta", "stable"]);
const RELEASE_PLATFORMS = new Set(["win", "mac"]);
const STABLE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BETA_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/;

class ReleaseContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReleaseContractError";
    this.code = code;
  }
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function assertMode(mode) {
  if (!RELEASE_MODES.has(mode)) {
    throw new ReleaseContractError(
      "INVALID_RELEASE_MODE",
      `Desktop release mode must be verify, beta, or stable; received ${mode || "<empty>"}.`,
    );
  }
}

function assertPlatform(platform) {
  if (!RELEASE_PLATFORMS.has(platform)) {
    throw new ReleaseContractError(
      "INVALID_RELEASE_PLATFORM",
      `Desktop release platform must be win or mac; received ${platform || "<empty>"}.`,
    );
  }
}

function assertVersionForMode(mode, version) {
  let parsedVersion;
  try {
    parsedVersion = parseDesktopReleaseVersion(version);
  } catch (error) {
    if (!(error instanceof ReleaseContractError) || error.code !== "INVALID_DESKTOP_RELEASE_VERSION") {
      throw error;
    }
  }
  const isStableVersion = parsedVersion?.mode === "stable";
  const isBetaVersion = parsedVersion?.mode === "beta";

  if (mode === "stable" && !isStableVersion) {
    throw new ReleaseContractError(
      "INVALID_STABLE_VERSION",
      `Stable desktop releases require X.Y.Z, received ${version || "<empty>"}.`,
    );
  }
  if (mode === "beta" && !isBetaVersion) {
    throw new ReleaseContractError(
      "INVALID_BETA_VERSION",
      `Beta desktop releases require X.Y.Z-beta.N and no other prerelease label, received ${version || "<empty>"}.`,
    );
  }
  if (mode === "verify" && !isStableVersion && !isBetaVersion) {
    throw new ReleaseContractError(
      "INVALID_VERIFY_VERSION",
      `Verification packages require X.Y.Z or X.Y.Z-beta.N, received ${version || "<empty>"}.`,
    );
  }
}

function parseDesktopReleaseVersion(version) {
  const stableMatch = STABLE_VERSION_PATTERN.exec(version);
  const betaMatch = BETA_VERSION_PATTERN.exec(version);
  if (!stableMatch && !betaMatch) {
    throw new ReleaseContractError(
      "INVALID_DESKTOP_RELEASE_VERSION",
      `Desktop versions must be X.Y.Z or X.Y.Z-beta.N, received ${version || "<empty>"}.`,
    );
  }

  const match = betaMatch || stableMatch;
  const mode = betaMatch ? "beta" : "stable";
  const core = match.slice(1, 4).map(Number);
  const betaNumber = betaMatch ? Number(betaMatch[4]) : null;
  return {
    version,
    coreVersion: core.join("."),
    core,
    mode,
    betaNumber,
    tag: `v${version}`,
    updateChannel: mode === "beta" ? "beta" : "latest",
    releaseType: mode === "beta" ? "prerelease" : "release",
  };
}

function compareDesktopReleaseVersions(leftVersion, rightVersion) {
  const left = parseDesktopReleaseVersion(leftVersion);
  const right = parseDesktopReleaseVersion(rightVersion);
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return left.core[index] < right.core[index] ? -1 : 1;
    }
  }
  if (left.mode !== right.mode) {
    return left.mode === "beta" ? -1 : 1;
  }
  if (left.mode === "stable") {
    return 0;
  }
  if (left.betaNumber === right.betaNumber) {
    return 0;
  }
  return left.betaNumber < right.betaNumber ? -1 : 1;
}

function parseGithubRepositoryUrl(value) {
  const source = typeof value === "string"
    ? value.trim()
    : value && typeof value.url === "string"
      ? value.url.trim()
      : "";
  if (!source) {
    return null;
  }

  let repositoryPath = "";
  const scpMatch = /^git@github\.com:([^/]+)\/(.+)$/i.exec(source);
  if (scpMatch) {
    repositoryPath = `${scpMatch[1]}/${scpMatch[2]}`;
  } else {
    try {
      const normalizedSource = source.startsWith("git+") ? source.slice(4) : source;
      const parsed = new URL(normalizedSource);
      if (parsed.hostname.toLowerCase() !== "github.com") {
        return null;
      }
      repositoryPath = parsed.pathname.replace(/^\//, "");
    } catch (_error) {
      return null;
    }
  }

  const parts = repositoryPath.replace(/\.git$/i, "").split("/").filter(Boolean);
  if (parts.length !== 2) {
    return null;
  }
  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    return null;
  }
  return { owner, repo };
}

function parseGithubRepositorySlug(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parts = value.trim().split("/");
  if (
    parts.length !== 2
    || !/^[A-Za-z0-9_.-]+$/.test(parts[0])
    || !/^[A-Za-z0-9_.-]+$/.test(parts[1])
  ) {
    return null;
  }
  return { owner: parts[0], repo: parts[1] };
}

function readRootRepository(repoRoot) {
  if (!repoRoot) {
    return null;
  }
  const packageJsonPath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return parseGithubRepositoryUrl(packageJson.repository);
}

function readOriginRepository(repoRoot) {
  if (!repoRoot) {
    return null;
  }
  try {
    const originUrl = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return parseGithubRepositoryUrl(originUrl);
  } catch (_error) {
    return null;
  }
}

function resolveGithubRepository({
  env = process.env,
  repoRoot,
  rootRepository,
  originUrl,
  allowOriginFallback = false,
} = {}) {
  const explicitOwner = firstNonEmpty(env.AI_NOVEL_GITHUB_OWNER);
  const explicitRepo = firstNonEmpty(env.AI_NOVEL_GITHUB_REPO);
  if (explicitOwner || explicitRepo) {
    if (!explicitOwner || !explicitRepo) {
      throw new ReleaseContractError(
        "PARTIAL_EXPLICIT_REPOSITORY",
        "AI_NOVEL_GITHUB_OWNER and AI_NOVEL_GITHUB_REPO must be provided together.",
      );
    }
    const explicit = parseGithubRepositorySlug(`${explicitOwner}/${explicitRepo}`);
    if (!explicit) {
      throw new ReleaseContractError("INVALID_EXPLICIT_REPOSITORY", "Explicit GitHub owner/repo is invalid.");
    }
    return { ...explicit, source: "explicit-env" };
  }

  const githubActionsRepository = firstNonEmpty(env.GITHUB_REPOSITORY);
  if (githubActionsRepository) {
    const parsed = parseGithubRepositorySlug(githubActionsRepository);
    if (!parsed) {
      throw new ReleaseContractError(
        "INVALID_GITHUB_REPOSITORY",
        `GITHUB_REPOSITORY must be owner/repo, received ${githubActionsRepository}.`,
      );
    }
    const actionsOwner = firstNonEmpty(env.GITHUB_REPOSITORY_OWNER);
    if (actionsOwner && actionsOwner !== parsed.owner) {
      throw new ReleaseContractError(
        "GITHUB_REPOSITORY_OWNER_MISMATCH",
        "GITHUB_REPOSITORY_OWNER does not match GITHUB_REPOSITORY.",
      );
    }
    return { ...parsed, source: "github-actions" };
  }

  const packageRepository = rootRepository === undefined
    ? readRootRepository(repoRoot)
    : parseGithubRepositoryUrl(rootRepository);
  if (packageRepository) {
    return { ...packageRepository, source: "root-repository" };
  }

  if (allowOriginFallback) {
    const originRepository = originUrl === undefined
      ? readOriginRepository(repoRoot)
      : parseGithubRepositoryUrl(originUrl);
    if (originRepository) {
      return { ...originRepository, source: "origin" };
    }
  }

  return null;
}

function pairStatus(first, second) {
  if (!first && !second) {
    return "none";
  }
  return first && second ? "full" : "partial";
}

function resolveWindowsSigning(env) {
  const link = firstNonEmpty(
    env.AI_NOVEL_WINDOWS_CSC_LINK,
    env.AI_NOVEL_WINDOWS_CSC_FILE,
    env.WIN_CSC_LINK,
    env.CSC_LINK,
  );
  const password = firstNonEmpty(
    env.AI_NOVEL_WINDOWS_CSC_KEY_PASSWORD,
    env.AI_NOVEL_WINDOWS_CSC_PASSWORD,
    env.WIN_CSC_KEY_PASSWORD,
    env.CSC_KEY_PASSWORD,
  );
  const status = pairStatus(link, password);
  if (status === "partial") {
    throw new ReleaseContractError(
      "PARTIAL_WINDOWS_SIGNING",
      "Windows signing requires both a CSC certificate reference and its password, or neither.",
    );
  }
  return { status, notarizationMethod: null, link, password };
}

function tupleStatus(values) {
  const presentCount = values.filter(Boolean).length;
  if (presentCount === 0) {
    return "none";
  }
  return presentCount === values.length ? "full" : "partial";
}

function resolveMacSigning(env) {
  const link = firstNonEmpty(
    env.AI_NOVEL_MAC_CSC_LINK,
    env.AI_NOVEL_MAC_CSC_FILE,
    env.MAC_CSC_LINK,
    env.CSC_LINK,
  );
  const password = firstNonEmpty(
    env.AI_NOVEL_MAC_CSC_KEY_PASSWORD,
    env.AI_NOVEL_MAC_CSC_PASSWORD,
    env.MAC_CSC_KEY_PASSWORD,
    env.CSC_KEY_PASSWORD,
  );
  const developerIdStatus = pairStatus(link, password);

  const apiKeyTuple = [
    firstNonEmpty(env.APPLE_API_KEY),
    firstNonEmpty(env.APPLE_API_KEY_ID),
    firstNonEmpty(env.APPLE_API_ISSUER),
  ];
  const appleIdTuple = [
    firstNonEmpty(env.APPLE_ID),
    firstNonEmpty(env.APPLE_APP_SPECIFIC_PASSWORD),
    firstNonEmpty(env.APPLE_TEAM_ID),
  ];
  const keychainProfile = firstNonEmpty(env.APPLE_KEYCHAIN_PROFILE);
  const keychainPath = firstNonEmpty(env.APPLE_KEYCHAIN);
  const apiKeyStatus = tupleStatus(apiKeyTuple);
  const appleIdStatus = tupleStatus(appleIdTuple);
  const keychainStatus = keychainProfile ? "full" : keychainPath ? "partial" : "none";
  const notarizationGroups = [
    { method: "api-key", status: apiKeyStatus },
    { method: "apple-id", status: appleIdStatus },
    { method: "keychain", status: keychainStatus },
  ];

  if (developerIdStatus === "partial" || notarizationGroups.some((group) => group.status === "partial")) {
    throw new ReleaseContractError(
      "PARTIAL_MAC_SIGNING",
      "macOS signing requires a complete Developer ID pair and exactly one complete Apple notarization credential tuple, or no signing fields.",
    );
  }

  const completeNotarizationGroups = notarizationGroups.filter((group) => group.status === "full");
  if (completeNotarizationGroups.length > 1) {
    throw new ReleaseContractError(
      "AMBIGUOUS_MAC_NOTARIZATION",
      "Configure exactly one Apple notarization credential tuple for macOS releases.",
    );
  }

  if (developerIdStatus === "none" && completeNotarizationGroups.length === 0) {
    return { status: "none", notarizationMethod: null, link: "", password: "" };
  }
  if (developerIdStatus !== "full" || completeNotarizationGroups.length !== 1) {
    throw new ReleaseContractError(
      "PARTIAL_MAC_SIGNING",
      "macOS signing requires a complete Developer ID pair and exactly one complete Apple notarization credential tuple, or no signing fields.",
    );
  }

  return {
    status: "full",
    notarizationMethod: completeNotarizationGroups[0].method,
    link,
    password,
  };
}

function normalizePlatformSigningEnvironment({ platform, env = process.env }) {
  assertPlatform(platform);
  const normalizedEnv = { ...env };
  const signing = platform === "win" ? resolveWindowsSigning(env) : resolveMacSigning(env);

  if (signing.status === "full") {
    normalizedEnv.CSC_LINK = signing.link;
    normalizedEnv.CSC_KEY_PASSWORD = signing.password;
  } else {
    delete normalizedEnv.CSC_LINK;
    delete normalizedEnv.CSC_KEY_PASSWORD;
  }

  return {
    env: normalizedEnv,
    signing: {
      status: signing.status,
      notarizationMethod: signing.notarizationMethod,
    },
  };
}

function assertCanonicalPublicRepository(repository) {
  if (!repository) {
    throw new ReleaseContractError(
      "PUBLIC_REPOSITORY_MISSING",
      `Public desktop releases require ${CANONICAL_GITHUB_OWNER}/${CANONICAL_GITHUB_REPO}.`,
    );
  }
  if (repository.owner !== CANONICAL_GITHUB_OWNER || repository.repo !== CANONICAL_GITHUB_REPO) {
    throw new ReleaseContractError(
      "PUBLIC_REPOSITORY_MISMATCH",
      `Public desktop releases must target ${CANONICAL_GITHUB_OWNER}/${CANONICAL_GITHUB_REPO}, received ${repository.owner}/${repository.repo}.`,
    );
  }
}

function resolveReleaseContract({
  mode,
  platform,
  version,
  env = process.env,
  repoRoot,
  rootRepository,
  originUrl,
  allowOriginFallback = false,
}) {
  assertMode(mode);
  assertPlatform(platform);
  assertVersionForMode(mode, version);

  const repository = resolveGithubRepository({
    env,
    repoRoot,
    rootRepository,
    originUrl,
    allowOriginFallback,
  });
  const { signing } = normalizePlatformSigningEnvironment({ platform, env });
  const isPublicRelease = mode === "beta" || mode === "stable";
  if (isPublicRelease) {
    assertCanonicalPublicRepository(repository);
  }

  const tag = isPublicRelease ? `v${version}` : null;
  const configuredRefName = firstNonEmpty(env.GITHUB_REF_NAME);
  if (tag && configuredRefName && configuredRefName !== tag) {
    throw new ReleaseContractError(
      "TAG_VERSION_MISMATCH",
      `GitHub ref ${configuredRefName} must equal ${tag} for this desktop release.`,
    );
  }

  const releaseUpdateChannel = mode === "beta" ? "beta" : "latest";
  const releaseType = mode === "verify" ? null : mode === "beta" ? "prerelease" : "release";
  const macUnsigned = platform === "mac" && signing.status === "none";
  const updatesEnabled = mode !== "verify" && !macUnsigned;
  const updateChannel = updatesEnabled ? releaseUpdateChannel : "disabled";
  const updateMetadataFile = updatesEnabled
    ? platform === "mac"
      ? `${updateChannel}-mac.yml`
      : `${updateChannel}.yml`
    : null;

  return {
    schemaVersion: RELEASE_CONTRACT_SCHEMA_VERSION,
    mode,
    platform,
    version,
    tag,
    releaseType,
    updateChannel,
    updateMetadataFile,
    updatesEnabled,
    github: repository,
    signing,
    artifactSuffix: isPublicRelease && signing.status === "none" ? "-unsigned" : "",
    publishFeed: updatesEnabled,
  };
}

function renderAppUpdateConfig(contract) {
  if (!contract.updatesEnabled || !contract.publishFeed || !contract.github || !contract.releaseType) {
    throw new ReleaseContractError(
      "UPDATE_FEED_DISABLED",
      "This desktop release contract does not permit an app-update feed.",
    );
  }
  return [
    "provider: github",
    `owner: ${contract.github.owner}`,
    `repo: ${contract.github.repo}`,
    `channel: ${contract.updateChannel}`,
    `releaseType: ${contract.releaseType}`,
    "updaterCacheDirName: ai-novel-writing-assistant-v2-updater",
    "",
  ].join("\n");
}

function createPackageReleaseMetadata(contract) {
  return {
    releaseMode: contract.mode,
    updateChannel: contract.updateChannel,
    updatesEnabled: contract.updatesEnabled,
    signingStatus: contract.signing.status,
  };
}

function createElectronBuilderReleaseSettings(contract) {
  const signed = contract.signing.status === "full";
  return {
    artifactSuffix: contract.artifactSuffix,
    includeAppUpdateConfig: contract.updatesEnabled,
    forceCodeSigning: signed,
    packageMetadata: createPackageReleaseMetadata(contract),
    publish: contract.publishFeed
      ? [
          {
            provider: "github",
            owner: contract.github.owner,
            repo: contract.github.repo,
            releaseType: contract.releaseType,
            channel: contract.updateChannel,
          },
        ]
      : [],
    mac: {
      identity: contract.platform === "mac" && !signed ? null : undefined,
      notarize: contract.platform === "mac" && signed,
    },
  };
}

module.exports = {
  CANONICAL_GITHUB_OWNER,
  CANONICAL_GITHUB_REPO,
  RELEASE_CONTRACT_SCHEMA_VERSION,
  ReleaseContractError,
  createPackageReleaseMetadata,
  createElectronBuilderReleaseSettings,
  compareDesktopReleaseVersions,
  normalizePlatformSigningEnvironment,
  parseDesktopReleaseVersion,
  renderAppUpdateConfig,
  resolveGithubRepository,
  resolveReleaseContract,
};
