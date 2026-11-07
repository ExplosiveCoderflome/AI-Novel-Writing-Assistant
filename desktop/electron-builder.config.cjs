const path = require("node:path");

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

const releaseChannel = firstNonEmpty(process.env.AI_NOVEL_RELEASE_CHANNEL, "beta").toLowerCase();
const isBetaRelease = releaseChannel === "beta";
const githubOwner = firstNonEmpty(process.env.AI_NOVEL_GITHUB_OWNER, "ExplosiveCoderflome");
const githubRepo = firstNonEmpty(process.env.AI_NOVEL_GITHUB_REPO, "AI-Novel-Writing-Assistant");
const windowsSigningLink = firstNonEmpty(
  process.env.CSC_LINK,
  process.env.WIN_CSC_LINK,
  process.env.AI_NOVEL_WINDOWS_CSC_LINK,
  process.env.AI_NOVEL_WINDOWS_CSC_FILE,
);
const allowUnsignedRelease =
  firstNonEmpty(
    process.env.AI_NOVEL_ALLOW_UNSIGNED_RELEASE,
    process.env.AI_NOVEL_ALLOW_UNSIGNED_WINDOWS_RELEASE,
  ).toLowerCase() === "true";
const hasWindowsSigningMaterial = Boolean(windowsSigningLink);
const isMacBuild = process.argv.some((arg) => arg === "--mac" || arg === "--darwin" || arg === "-m")
  || firstNonEmpty(process.env.AI_NOVEL_TARGET_PLATFORM).toLowerCase() === "darwin";
const builderIconPath = path.join("builder", "app-icon.ico");
const builderMacIconPath = path.join("builder", "app-icon.icns");
const macArch = firstNonEmpty(process.env.AI_NOVEL_MAC_ARCH, process.platform === "arm64" ? "arm64" : "x64").toLowerCase();
const macTargets = [
  { target: "dmg", arch: [macArch] },
  { target: "zip", arch: [macArch] },
];

if (!isBetaRelease && !hasWindowsSigningMaterial && !allowUnsignedRelease) {
  throw new Error(
    "Public Windows desktop releases require signing material. Provide CSC_LINK/WIN_CSC_LINK, or explicitly opt in to an unsigned release.",
  );
}

module.exports = {
  appId: "com.ai-novel.desktop",
  productName: "Biz Novel Studio",
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
  extraResources: [
    {
      from: "builder/app-icon.ico",
      to: "icons/app-icon.ico",
    },
    ...(isMacBuild
      ? [
          {
            from: "builder/app-icon.icns",
            to: "icons/app-icon.icns",
          },
        ]
      : []),
    {
      from: "build/resources/app-update.yml",
      to: "app-update.yml",
    },
    {
      from: "build/resources/client",
      to: "client",
      filter: ["**/*"],
    },
  ],
  asar: true,
  asarUnpack: [
    "node_modules/**/*.node",
  ],
  npmRebuild: true,
  nativeRebuilder: "sequential",
  extraMetadata: {
    main: "dist/main.js",
  },
  ...(isMacBuild
    ? {
        mac: {
          icon: builderMacIconPath,
          category: "public.app-category.books",
          target: macTargets,
          // Unsigned local/CI builds: keep Gatekeeper usable without a developer certificate.
          identity: null,
        },
        dmg: {
          artifactName: "${productName}-${version}-${arch}.${ext}",
        },
      }
    : {}),
  publish: [
    {
      provider: "github",
      owner: githubOwner,
      repo: githubRepo,
      releaseType: isBetaRelease ? "prerelease" : "release",
    },
  ],
  electronUpdaterCompatibility: ">=2.16",
  generateUpdatesFilesForAllChannels: false,
  win: {
    icon: builderIconPath,
    // Keep EXE resource editing enabled for unsigned builds so Windows uses the app icon and metadata.
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
  nsis: {
    artifactName: "${productName}-${version}-setup-${arch}.${ext}",
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
    artifactName: "${productName}-${version}-portable-${arch}.${ext}",
  },
};
