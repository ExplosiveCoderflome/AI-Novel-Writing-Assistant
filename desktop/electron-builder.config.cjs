const fs = require("node:fs");
const path = require("node:path");
const {
  createElectronBuilderReleaseSettings,
  resolveReleaseContract,
} = require("./scripts/release-contract.cjs");

const repoRoot = path.resolve(__dirname, "..");
const stageManifestPath = path.join(__dirname, "build", "stage-manifest.json");
const stagedPackageJsonPath = path.join(__dirname, "build", "app", "package.json");

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readJson(filePath, description) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected ${description} at ${filePath}. Run the strict desktop stage command first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function comparableReleaseContract(contract) {
  return {
    ...contract,
    github: contract.github
      ? {
          owner: contract.github.owner,
          repo: contract.github.repo,
        }
      : null,
  };
}

function resolveBuilderReleaseContract() {
  const stageManifest = readJson(stageManifestPath, "desktop stage manifest");
  const stagedPackageJson = readJson(stagedPackageJsonPath, "staged desktop package.json");
  const mode = firstNonEmpty(process.env.AI_NOVEL_RELEASE_MODE, stageManifest.mode);
  const platform = firstNonEmpty(process.env.AI_NOVEL_TARGET_PLATFORM, stageManifest.os);
  if (mode !== stageManifest.mode || platform !== stageManifest.os) {
    throw new Error("Builder release mode/platform does not match stage-manifest.json.");
  }

  const resolvedContract = resolveReleaseContract({
    mode,
    platform,
    version: stagedPackageJson.version,
    env: process.env,
    repoRoot,
    allowOriginFallback: true,
  });
  if (
    JSON.stringify(comparableReleaseContract(resolvedContract))
    !== JSON.stringify(comparableReleaseContract(stageManifest.releaseContract))
  ) {
    throw new Error("Builder release contract does not exactly match stage-manifest.json.");
  }
  return stageManifest.releaseContract;
}

const releaseContract = resolveBuilderReleaseContract();
const releaseSettings = createElectronBuilderReleaseSettings(releaseContract);
const isWindowsTarget = releaseContract.platform === "win";
const artifactSuffix = releaseSettings.artifactSuffix;
const builderIconPath = path.join("builder", "app-icon.ico");
const macBuilderIconPath = path.join("builder", "app-icon.png");
const extraResources = [
  {
    from: "builder/app-icon.ico",
    to: "icons/app-icon.ico",
  },
  {
    from: "builder/app-icon.png",
    to: "icons/app-icon.png",
  },
  {
    from: "build/resources/client",
    to: "client",
    filter: ["**/*"],
  },
];

if (releaseSettings.includeAppUpdateConfig) {
  extraResources.push({
    from: "build/resources/app-update.yml",
    to: "app-update.yml",
  });
}

module.exports = {
  appId: "com.ai-novel.desktop",
  productName: "AI Novel Writing Assistant v2",
  directories: {
    app: "build/app",
    output: "build/dist",
    buildResources: "builder",
  },
  files: [
    "dist/**/*",
    "package.json",
    "node_modules/.prisma/**/*",
  ],
  extraResources,
  asar: true,
  asarUnpack: [
    "node_modules/**/*.node",
  ],
  npmRebuild: true,
  nativeRebuilder: "sequential",
  forceCodeSigning: releaseSettings.forceCodeSigning,
  extraMetadata: {
    main: "dist/main.js",
    aiNovelRelease: releaseSettings.packageMetadata,
  },
  publish: releaseSettings.publish,
  electronUpdaterCompatibility: ">=2.16",
  generateUpdatesFilesForAllChannels: false,
  win: {
    icon: builderIconPath,
    signAndEditExecutable: true,
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
      {
        target: "portable",
        arch: ["x64"],
      },
    ],
  },
  mac: {
    icon: macBuilderIconPath,
    category: "public.app-category.productivity",
    identity: releaseSettings.mac.identity,
    hardenedRuntime: true,
    notarize: releaseSettings.mac.notarize,
    artifactName: `\${productName}-\${version}-mac-\${arch}${artifactSuffix}.\${ext}`,
    target: [
      {
        target: "dmg",
        arch: ["arm64"],
      },
      {
        target: "zip",
        arch: ["arm64"],
      },
    ],
  },
  dmg: {
    artifactName: `\${productName}-\${version}-mac-\${arch}${artifactSuffix}.\${ext}`,
  },
  nsis: {
    artifactName: `\${productName}-\${version}-setup-\${arch}${isWindowsTarget ? artifactSuffix : ""}.\${ext}`,
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    installerIcon: builderIconPath,
    uninstallerIcon: builderIconPath,
    installerHeaderIcon: builderIconPath,
  },
  portable: {
    artifactName: `\${productName}-\${version}-portable-\${arch}${isWindowsTarget ? artifactSuffix : ""}.\${ext}`,
  },
};
