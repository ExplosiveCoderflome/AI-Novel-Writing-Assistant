const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ReleaseContractError,
  compareDesktopReleaseVersions,
  createElectronBuilderReleaseSettings,
  createPackageReleaseMetadata,
  normalizePlatformSigningEnvironment,
  parseDesktopReleaseVersion,
  renderAppUpdateConfig,
  resolveGithubRepository,
  resolveReleaseContract,
} = require("./release-contract.cjs");

const canonicalEnv = {
  AI_NOVEL_GITHUB_OWNER: "yangtzehina",
  AI_NOVEL_GITHUB_REPO: "AI-Novel-Writing-Assistant",
};

function contract(overrides = {}) {
  return resolveReleaseContract({
    mode: "stable",
    platform: "win",
    version: "1.2.3",
    env: canonicalEnv,
    ...overrides,
  });
}

function assertContractError(fn, code) {
  assert.throws(fn, (error) => error instanceof ReleaseContractError && error.code === code);
}

test("stable, beta, and verify modes produce exact tag and update feed contracts", () => {
  const stableWindows = contract();
  assert.equal(stableWindows.tag, "v1.2.3");
  assert.equal(stableWindows.releaseType, "release");
  assert.equal(stableWindows.updateChannel, "latest");
  assert.equal(stableWindows.updateMetadataFile, "latest.yml");
  assert.equal(stableWindows.updatesEnabled, true);
  assert.equal(stableWindows.artifactSuffix, "-unsigned");

  const betaWindows = contract({ mode: "beta", version: "1.2.3-beta.7" });
  assert.equal(betaWindows.tag, "v1.2.3-beta.7");
  assert.equal(betaWindows.releaseType, "prerelease");
  assert.equal(betaWindows.updateChannel, "beta");
  assert.equal(betaWindows.updateMetadataFile, "beta.yml");
  assert.equal(betaWindows.updatesEnabled, true);

  const verifyMac = contract({ mode: "verify", platform: "mac" });
  assert.equal(verifyMac.tag, null);
  assert.equal(verifyMac.releaseType, null);
  assert.equal(verifyMac.updateChannel, "disabled");
  assert.equal(verifyMac.updateMetadataFile, null);
  assert.equal(verifyMac.updatesEnabled, false);
  assert.equal(verifyMac.publishFeed, false);
});

test("beta accepts only X.Y.Z-beta.N and stable accepts only X.Y.Z", () => {
  for (const version of ["1.2.3-alpha.1", "1.2.3-rc.1", "1.2.3-beta", "1.2.3-beta.01", "1.2.3"]){
    assertContractError(() => contract({ mode: "beta", version }), "INVALID_BETA_VERSION");
  }
  for (const version of ["v1.2.3", "1.2.3-beta.1", "1.2.3+build.1", "01.2.3"]){
    assertContractError(() => contract({ mode: "stable", version }), "INVALID_STABLE_VERSION");
  }
  assert.equal(contract({ mode: "beta", version: "0.0.0-beta.0" }).tag, "v0.0.0-beta.0");
});

test("desktop release versions expose one canonical parser and comparison order", () => {
  assert.deepEqual(parseDesktopReleaseVersion("1.2.3-beta.7"), {
    version: "1.2.3-beta.7",
    coreVersion: "1.2.3",
    core: [1, 2, 3],
    mode: "beta",
    betaNumber: 7,
    tag: "v1.2.3-beta.7",
    updateChannel: "beta",
    releaseType: "prerelease",
  });
  assert.equal(compareDesktopReleaseVersions("1.2.3-beta.2", "1.2.3-beta.10"), -1);
  assert.equal(compareDesktopReleaseVersions("1.2.3-beta.10", "1.2.3"), -1);
  assert.equal(compareDesktopReleaseVersions("1.2.3", "1.2.4-beta.0"), -1);
  assert.equal(compareDesktopReleaseVersions("2.0.0", "2.0.0"), 0);
});

test("a provided GitHub ref must match the public version tag", () => {
  assert.equal(contract({ env: { ...canonicalEnv, GITHUB_REF_NAME: "v1.2.3" } }).tag, "v1.2.3");
  assertContractError(
    () => contract({ env: { ...canonicalEnv, GITHUB_REF_NAME: "v1.2.4" } }),
    "TAG_VERSION_MISMATCH",
  );
});

test("GitHub repository resolution uses atomic source priority", () => {
  assert.deepEqual(
    resolveGithubRepository({
      env: {
        ...canonicalEnv,
        GITHUB_REPOSITORY: "ignored/ignored",
      },
      rootRepository: "https://github.com/also/ignored.git",
    }),
    { owner: "yangtzehina", repo: "AI-Novel-Writing-Assistant", source: "explicit-env" },
  );
  assert.deepEqual(
    resolveGithubRepository({
      env: { GITHUB_REPOSITORY: "yangtzehina/AI-Novel-Writing-Assistant" },
      rootRepository: "https://github.com/also/ignored.git",
    }),
    { owner: "yangtzehina", repo: "AI-Novel-Writing-Assistant", source: "github-actions" },
  );
  assert.deepEqual(
    resolveGithubRepository({
      env: {},
      rootRepository: { url: "git+https://github.com/yangtzehina/AI-Novel-Writing-Assistant.git" },
    }),
    { owner: "yangtzehina", repo: "AI-Novel-Writing-Assistant", source: "root-repository" },
  );
  assert.deepEqual(
    resolveGithubRepository({
      env: {},
      rootRepository: null,
      originUrl: "git@github.com:yangtzehina/AI-Novel-Writing-Assistant.git",
      allowOriginFallback: true,
    }),
    { owner: "yangtzehina", repo: "AI-Novel-Writing-Assistant", source: "origin" },
  );
});

test("partial repository overrides and non-canonical public targets fail closed", () => {
  assertContractError(
    () => resolveGithubRepository({ env: { AI_NOVEL_GITHUB_OWNER: "yangtzehina" } }),
    "PARTIAL_EXPLICIT_REPOSITORY",
  );
  assertContractError(
    () => contract({ env: { AI_NOVEL_GITHUB_OWNER: "someone", AI_NOVEL_GITHUB_REPO: "else" } }),
    "PUBLIC_REPOSITORY_MISMATCH",
  );
  assertContractError(
    () => contract({ env: {}, rootRepository: null, originUrl: null }),
    "PUBLIC_REPOSITORY_MISSING",
  );
});

test("Windows signing is none or a complete pair, and unsigned public updates remain enabled", () => {
  const unsigned = contract({ env: canonicalEnv });
  assert.equal(unsigned.signing.status, "none");
  assert.equal(unsigned.updatesEnabled, true);
  assert.equal(unsigned.publishFeed, true);
  assert.equal(unsigned.artifactSuffix, "-unsigned");

  const signedEnv = {
    ...canonicalEnv,
    WIN_CSC_LINK: "windows-cert.pfx",
    WIN_CSC_KEY_PASSWORD: "secret",
  };
  assert.equal(contract({ env: signedEnv }).signing.status, "full");
  const normalized = normalizePlatformSigningEnvironment({ platform: "win", env: signedEnv });
  assert.equal(normalized.env.CSC_LINK, "windows-cert.pfx");
  assert.equal(normalized.env.CSC_KEY_PASSWORD, "secret");

  assertContractError(
    () => contract({ env: { ...canonicalEnv, WIN_CSC_LINK: "windows-cert.pfx" } }),
    "PARTIAL_WINDOWS_SIGNING",
  );
  assertContractError(
    () => contract({ env: { ...canonicalEnv, WIN_CSC_KEY_PASSWORD: "secret" } }),
    "PARTIAL_WINDOWS_SIGNING",
  );
});

test("Mac signing ignores Windows CSC aliases and unsigned public packages have no feed", () => {
  const unsigned = contract({
    mode: "beta",
    platform: "mac",
    version: "1.2.3-beta.4",
    env: {
      ...canonicalEnv,
      WIN_CSC_LINK: "windows-cert.pfx",
      WIN_CSC_KEY_PASSWORD: "secret",
    },
  });
  assert.equal(unsigned.signing.status, "none");
  assert.equal(unsigned.artifactSuffix, "-unsigned");
  assert.equal(unsigned.updatesEnabled, false);
  assert.equal(unsigned.updateChannel, "disabled");
  assert.equal(unsigned.updateMetadataFile, null);
  assert.equal(unsigned.publishFeed, false);
});

test("Mac full signing requires a Developer ID pair and exactly one notarization tuple", () => {
  const developerId = {
    MAC_CSC_LINK: "developer-id.p12",
    MAC_CSC_KEY_PASSWORD: "secret",
  };
  const apiKey = {
    APPLE_API_KEY: "/tmp/AuthKey.p8",
    APPLE_API_KEY_ID: "KEY123",
    APPLE_API_ISSUER: "issuer-id",
  };
  const appleId = {
    APPLE_ID: "developer@example.com",
    APPLE_APP_SPECIFIC_PASSWORD: "app-password",
    APPLE_TEAM_ID: "TEAM123",
  };

  const signed = contract({ platform: "mac", env: { ...canonicalEnv, ...developerId, ...apiKey } });
  assert.equal(signed.signing.status, "full");
  assert.equal(signed.signing.notarizationMethod, "api-key");
  assert.equal(signed.updateMetadataFile, "latest-mac.yml");
  assert.equal(signed.artifactSuffix, "");

  const signedWithAppleId = contract({
    mode: "beta",
    platform: "mac",
    version: "1.2.3-beta.2",
    env: { ...canonicalEnv, ...developerId, ...appleId },
  });
  assert.equal(signedWithAppleId.signing.notarizationMethod, "apple-id");
  assert.equal(signedWithAppleId.updateMetadataFile, "beta-mac.yml");

  assertContractError(
    () => contract({ platform: "mac", env: { ...canonicalEnv, ...developerId } }),
    "PARTIAL_MAC_SIGNING",
  );
  assertContractError(
    () => contract({ platform: "mac", env: { ...canonicalEnv, ...apiKey } }),
    "PARTIAL_MAC_SIGNING",
  );
  assertContractError(
    () => contract({
      platform: "mac",
      env: { ...canonicalEnv, ...developerId, ...apiKey, ...appleId },
    }),
    "AMBIGUOUS_MAC_NOTARIZATION",
  );
  assertContractError(
    () => contract({
      platform: "mac",
      env: { ...canonicalEnv, ...developerId, APPLE_API_KEY: "/tmp/AuthKey.p8" },
    }),
    "PARTIAL_MAC_SIGNING",
  );
});

test("app-update YAML and package metadata are derived from one release contract", () => {
  const beta = contract({ mode: "beta", version: "1.2.3-beta.9" });
  assert.equal(renderAppUpdateConfig(beta), [
    "provider: github",
    "owner: yangtzehina",
    "repo: AI-Novel-Writing-Assistant",
    "channel: beta",
    "releaseType: prerelease",
    "updaterCacheDirName: ai-novel-writing-assistant-v2-updater",
    "",
  ].join("\n"));
  assert.deepEqual(createPackageReleaseMetadata(beta), {
    releaseMode: "beta",
    updateChannel: "beta",
    updatesEnabled: true,
    signingStatus: "none",
  });

  const unsignedMac = contract({ platform: "mac" });
  assertContractError(() => renderAppUpdateConfig(unsignedMac), "UPDATE_FEED_DISABLED");
  assert.deepEqual(createPackageReleaseMetadata(unsignedMac), {
    releaseMode: "stable",
    updateChannel: "disabled",
    updatesEnabled: false,
    signingStatus: "none",
  });
});

test("electron-builder settings keep Windows feeds and omit unsigned Mac feeds", () => {
  const unsignedWindows = createElectronBuilderReleaseSettings(contract());
  assert.equal(unsignedWindows.artifactSuffix, "-unsigned");
  assert.equal(unsignedWindows.includeAppUpdateConfig, true);
  assert.equal(unsignedWindows.forceCodeSigning, false);
  assert.deepEqual(unsignedWindows.publish, [{
    provider: "github",
    owner: "yangtzehina",
    repo: "AI-Novel-Writing-Assistant",
    releaseType: "release",
    channel: "latest",
  }]);

  const unsignedMac = createElectronBuilderReleaseSettings(contract({ platform: "mac" }));
  assert.equal(unsignedMac.artifactSuffix, "-unsigned");
  assert.equal(unsignedMac.includeAppUpdateConfig, false);
  assert.equal(unsignedMac.forceCodeSigning, false);
  assert.deepEqual(unsignedMac.publish, []);
  assert.deepEqual(unsignedMac.mac, { identity: null, notarize: false });

  const signedMac = createElectronBuilderReleaseSettings(contract({
    mode: "beta",
    platform: "mac",
    version: "1.2.3-beta.3",
    env: {
      ...canonicalEnv,
      MAC_CSC_LINK: "developer-id.p12",
      MAC_CSC_KEY_PASSWORD: "secret",
      APPLE_API_KEY: "/tmp/AuthKey.p8",
      APPLE_API_KEY_ID: "KEY123",
      APPLE_API_ISSUER: "issuer-id",
    },
  }));
  assert.equal(signedMac.artifactSuffix, "");
  assert.equal(signedMac.includeAppUpdateConfig, true);
  assert.equal(signedMac.forceCodeSigning, true);
  assert.equal(signedMac.publish[0].channel, "beta");
  assert.deepEqual(signedMac.mac, { identity: undefined, notarize: true });
});
