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
const builderIconPath = path.join("builder", "app-icon.ico");
const builderMacIconPath = path.join("builder", "app-icon.icns");
const macSigningLink = firstNonEmpty(
  process.env.CSC_LINK,
  process.env.MAC_CSC_LINK,
  process.env.AI_NOVEL_MAC_CSC_LINK,
);
const macSigningPassword = firstNonEmpty(process.env.CSC_KEY_PASSWORD, process.env.MAC_CSC_KEY_PASSWORD);
const hasMacSigningMaterial = Boolean(macSigningLink);
const hasMacNotarizationMaterial = Boolean(
  firstNonEmpty(process.env.APPLE_KEYCHAIN_PROFILE) ||
    (firstNonEmpty(process.env.APPLE_API_KEY) &&
      firstNonEmpty(process.env.APPLE_API_KEY_ID) &&
      firstNonEmpty(process.env.APPLE_API_ISSUER)) ||
    (firstNonEmpty(process.env.APPLE_ID) &&
      firstNonEmpty(process.env.APPLE_APP_SPECIFIC_PASSWORD) &&
      firstNonEmpty(process.env.APPLE_TEAM_ID)),
);
const allowUnsignedMacRelease =
  firstNonEmpty(
    process.env.AI_NOVEL_ALLOW_UNSIGNED_MAC_RELEASE,
    process.env.AI_NOVEL_ALLOW_UNSIGNED_RELEASE,
  ).toLowerCase() === "true";

// electron-builder loads this config before it resolves targets, so the requested
// platforms are read from the CLI flags that the packaging scripts pass through.
function detectRequestedPlatforms(argv) {
  const platforms = new Set();
  for (const rawArg of argv) {
    const arg = rawArg.replace(/^--?/, "").toLowerCase();
    if (arg === "win" || arg === "windows") {
      platforms.add("win");
    } else if (arg === "mac" || arg === "macos" || arg === "darwin") {
      platforms.add("mac");
    } else if (arg === "linux") {
      platforms.add("linux");
    }
  }

  if (platforms.size === 0) {
    platforms.add(process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux");
  }

  return platforms;
}

const requestedPlatforms = detectRequestedPlatforms(process.argv.slice(2));
const buildsWindows = requestedPlatforms.has("win");
const buildsMac = requestedPlatforms.has("mac");
const macArchs = firstNonEmpty(process.env.AI_NOVEL_MAC_ARCHS, "arm64")
  .split(",")
  .map((arch) => arch.trim())
  .filter(Boolean);

if (buildsWindows && !isBetaRelease && !hasWindowsSigningMaterial && !allowUnsignedRelease) {
  throw new Error(
    "Public Windows desktop releases require signing material. Provide CSC_LINK/WIN_CSC_LINK, or explicitly opt in to an unsigned release.",
  );
}

if (buildsMac && !isBetaRelease && !allowUnsignedMacRelease && !(hasMacSigningMaterial && hasMacNotarizationMaterial)) {
  throw new Error(
    "Public macOS desktop releases require signing and notarization material. Provide MAC_CSC_LINK/MAC_CSC_KEY_PASSWORD plus APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID (or APPLE_API_KEY credentials), or explicitly opt in to an unsigned release.",
  );
}

if (buildsMac && !isBetaRelease && hasMacSigningMaterial && !hasMacNotarizationMaterial) {
  console.warn(
    "[desktop] macOS release build has signing material but no notarization credentials; Gatekeeper will still warn on other Macs.",
  );
}

// electron-builder reads the generic CSC_* variables, so accept the macOS-specific
// names from the packaging scripts without forcing callers to rename their secrets.
if (buildsMac) {
  if (macSigningLink && !process.env.CSC_LINK) {
    process.env.CSC_LINK = macSigningLink;
  }
  if (macSigningPassword && !process.env.CSC_KEY_PASSWORD) {
    process.env.CSC_KEY_PASSWORD = macSigningPassword;
  }
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
    {
      from: "builder/app-icon.icns",
      to: "icons/app-icon.icns",
    },
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
  mac: {
    icon: builderMacIconPath,
    category: "public.app-category.productivity",
    target: [
      {
        target: "dmg",
        arch: macArchs,
      },
      {
        target: "zip",
        arch: macArchs,
      },
    ],
    artifactName: "${productName}-${version}-mac-${arch}.${ext}",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "builder/entitlements.mac.plist",
    entitlementsInherit: "builder/entitlements.mac.plist",
    // Local and beta builds are ad-hoc signed by electron-builder, which is what
    // Apple Silicon requires to launch at all. Notarization only runs when the
    // release pipeline provides Apple credentials.
    notarize: hasMacNotarizationMaterial,
  },
  dmg: {
    artifactName: "${productName}-${version}-mac-${arch}.${ext}",
    sign: false,
    contents: [
      {
        x: 140,
        y: 200,
      },
      {
        x: 400,
        y: 200,
        type: "link",
        path: "/Applications",
      },
    ],
  },
};
