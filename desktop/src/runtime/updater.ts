import fs from "node:fs";
import path from "node:path";
import { autoUpdater } from "electron-updater";
import { appendDesktopLog, logDesktopError } from "./logging";
import { createUpdaterSnapshot, desktopUpdaterStore } from "./state";

export interface DesktopUpdaterController {
  checkForUpdates: () => Promise<void>;
  quitAndInstall: () => void;
  scheduleInitialCheck: (delayMs?: number) => void;
}

interface DesktopUpdaterOptions {
  currentVersion: string;
  updateChannel: string;
  isPackaged: boolean;
  isPortable: boolean;
  minimumAllowedVersion: string;
}

// Security policy for desktop auto-updates is enforced in three places:
// 1. staged feed metadata must point at the expected GitHub repo/channel,
// 2. public release packaging must require signing material,
// 3. runtime rejects update candidates that violate publisher or version-floor policy.
const TRUSTED_UPDATE_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "github-releases.githubusercontent.com",
]);

export function isTrustedUpdateUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" && TRUSTED_UPDATE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function parseVersionParts(version: string): number[] | null {
  const normalized = version.trim().replace(/^v/i, "");
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    return null;
  }

  return match.slice(1, 4).map((part) => Number(part));
}

function parsePrereleaseParts(version: string): Array<number | string> | null {
  const normalized = version.trim().replace(/^v/i, "");
  const match = normalized.match(/^\d+\.\d+\.\d+-([0-9A-Za-z.-]+)(?:\+.*)?$/);
  if (!match) {
    return null;
  }

  return match[1].split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);

  if (!leftParts || !rightParts) {
    return left.localeCompare(right);
  }

  for (let index = 0; index < 3; index += 1) {
    const diff = leftParts[index] - rightParts[index];
    if (diff !== 0) {
      return diff;
    }
  }

  const leftPrerelease = parsePrereleaseParts(left);
  const rightPrerelease = parsePrereleaseParts(right);

  if (!leftPrerelease && !rightPrerelease) {
    return 0;
  }
  if (!leftPrerelease) {
    return 1;
  }
  if (!rightPrerelease) {
    return -1;
  }

  const maxLength = Math.max(leftPrerelease.length, rightPrerelease.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftPrerelease[index];
    const rightPart = rightPrerelease[index];

    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }
    if (leftPart === rightPart) {
      continue;
    }

    const leftIsNumber = typeof leftPart === "number";
    const rightIsNumber = typeof rightPart === "number";
    if (leftIsNumber && rightIsNumber) {
      return leftPart - rightPart;
    }
    if (leftIsNumber) {
      return -1;
    }
    if (rightIsNumber) {
      return 1;
    }

    return String(leftPart).localeCompare(String(rightPart));
  }

  return 0;
}

export function isVersionAllowedByFloor(candidateVersion: string, minimumVersion: string): boolean {
  if (!minimumVersion.trim()) {
    return true;
  }

  return compareVersions(candidateVersion, minimumVersion) >= 0;
}

export function validateWindowsPublisher(
  publisherNames: string[],
  expectedPublisherNames: string[],
): boolean {
  if (publisherNames.length === 0 || expectedPublisherNames.length === 0) {
    return false;
  }

  return expectedPublisherNames.some((expectedPublisherName) => publisherNames.includes(expectedPublisherName));
}

function markUpdaterSnapshot(snapshot: ReturnType<typeof createUpdaterSnapshot>): void {
  desktopUpdaterStore.setSnapshot(snapshot);
}

function isUpdaterSupported(options: DesktopUpdaterOptions): boolean {
  if (!options.isPackaged) {
    return false;
  }

  if (options.isPortable) {
    return false;
  }

  return process.env.AI_NOVEL_DESKTOP_DISABLE_UPDATER?.trim() !== "true";
}

function hasPackagedUpdateFeedConfig(): boolean {
  return fs.existsSync(path.join(process.resourcesPath, "app-update.yml"));
}

function resolveCandidateUpdateUrls(info: { files?: Array<{ url?: string }>; path?: string | null }): string[] {
  const fileUrls = Array.isArray(info.files)
    ? info.files
      .map((file) => file?.url?.trim() || "")
      .filter(Boolean)
    : [];
  const legacyPath = typeof info.path === "string" ? info.path.trim() : "";
  return legacyPath ? [...fileUrls, legacyPath] : fileUrls;
}

export function initializeDesktopUpdater(options: DesktopUpdaterOptions): DesktopUpdaterController {
  const supported = isUpdaterSupported(options);
  const hasFeedConfig = !supported || hasPackagedUpdateFeedConfig();
  const unsupportedReason = !options.isPackaged
    ? "Updates are only available from the packaged Windows build."
    : options.isPortable
      ? "Portable builds stay on manual updates and are excluded from auto-update."
      : !hasFeedConfig
        ? "This build does not include an update feed yet. Publish it through the beta release pipeline first."
        : "Updates are disabled by environment configuration.";

  markUpdaterSnapshot(createUpdaterSnapshot({
    status: supported && hasFeedConfig ? "idle" : "disabled",
    message: supported
      ? hasFeedConfig
        ? "Installed build is ready for background update checks."
        : unsupportedReason
      : unsupportedReason,
    currentVersion: options.currentVersion,
    availableVersion: null,
    progressPercent: null,
    bytesPerSecond: null,
    channel: options.updateChannel,
    isPortable: options.isPortable,
    isPackaged: options.isPackaged,
    isSupported: supported && hasFeedConfig,
    canInstall: false,
    lastCheckedAt: null,
  }));

  if (!supported || !hasFeedConfig) {
    return {
      async checkForUpdates() {
        return undefined;
      },
      quitAndInstall() {
        return undefined;
      },
      scheduleInitialCheck() {
        return undefined;
      },
    };
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = options.updateChannel === "beta";

  autoUpdater.on("checking-for-update", () => {
    appendDesktopLog("desktop.updater", "Checking GitHub Releases for desktop updates.");
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "checking",
      message: "Checking GitHub Releases for a newer desktop build.",
      canInstall: false,
      lastCheckedAt: new Date().toISOString(),
      progressPercent: null,
      bytesPerSecond: null,
    }));
  });

  autoUpdater.on("update-available", (info) => {
    const candidateUrls = resolveCandidateUpdateUrls(info);
    const hasOnlyTrustedUrls = candidateUrls.length === 0 || candidateUrls.every((candidateUrl) => isTrustedUpdateUrl(candidateUrl));

    if (!hasOnlyTrustedUrls) {
      const rejectedUrl = candidateUrls.find((candidateUrl) => !isTrustedUpdateUrl(candidateUrl)) ?? "unknown";
      appendDesktopLog("desktop.updater", `Rejected update ${info.version} because feed URL is not trusted: ${rejectedUrl}.`);
      markUpdaterSnapshot(createUpdaterSnapshot({
        ...desktopUpdaterStore.getSnapshot(),
        status: "error",
        message: `Blocked update ${info.version} because the update source is not trusted.`,
        availableVersion: null,
        canInstall: false,
        progressPercent: null,
        bytesPerSecond: null,
        lastCheckedAt: new Date().toISOString(),
      }));
      return;
    }

    if (!isVersionAllowedByFloor(info.version, options.minimumAllowedVersion)) {
      appendDesktopLog("desktop.updater", `Rejected update ${info.version} below minimum version ${options.minimumAllowedVersion}.`);
      markUpdaterSnapshot(createUpdaterSnapshot({
        ...desktopUpdaterStore.getSnapshot(),
        status: "error",
        message: `Blocked update ${info.version} because it is below the minimum allowed version ${options.minimumAllowedVersion}.`,
        availableVersion: null,
        canInstall: false,
        progressPercent: null,
        bytesPerSecond: null,
        lastCheckedAt: new Date().toISOString(),
      }));
      return;
    }

    appendDesktopLog("desktop.updater", `Update ${info.version} is available and waiting for download approval.`);
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "update-available",
      message: `Version ${info.version} is available. Confirm download when you are ready.`,
      availableVersion: info.version,
      canInstall: false,
      progressPercent: null,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
    }));
  });

  autoUpdater.on("update-not-available", () => {
    appendDesktopLog("desktop.updater", "No newer desktop build is available.");
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "not-available",
      message: "You are already on the newest available desktop build for this channel.",
      availableVersion: null,
      canInstall: false,
      progressPercent: null,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
    }));
  });

  autoUpdater.on("download-progress", (progress) => {
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "downloading",
      message: `Downloading update${desktopUpdaterStore.getSnapshot().availableVersion ? ` ${desktopUpdaterStore.getSnapshot().availableVersion}` : ""}.`,
      progressPercent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      canInstall: false,
    }));
  });

  autoUpdater.on("update-downloaded", (info) => {
    appendDesktopLog("desktop.updater", `Update ${info.version} finished downloading and is ready to install.`);
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "downloaded",
      message: `Version ${info.version} has downloaded. Restart the app to install it.`,
      availableVersion: info.version,
      canInstall: true,
      progressPercent: 100,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
    }));
  });

  autoUpdater.on("error", (error) => {
    logDesktopError("desktop.updater", error);
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      canInstall: false,
      progressPercent: null,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
    }));
  });

  const checkForUpdates = async (): Promise<void> => {
    try {
      const snapshot = desktopUpdaterStore.getSnapshot();
      if (snapshot.status === "checking" || snapshot.status === "downloading" || snapshot.status === "downloaded") {
        return;
      }

      if (snapshot.status === "update-available") {
        appendDesktopLog("desktop.updater", `Downloading approved update ${snapshot.availableVersion ?? "unknown"}.`);
        markUpdaterSnapshot(createUpdaterSnapshot({
          ...snapshot,
          status: "downloading",
          message: `Downloading update ${snapshot.availableVersion ?? ""}`.trim(),
          canInstall: false,
          progressPercent: 0,
          bytesPerSecond: null,
          lastCheckedAt: new Date().toISOString(),
        }));
        await autoUpdater.downloadUpdate();
        return;
      }

      await autoUpdater.checkForUpdates();
    } catch (error) {
      logDesktopError("desktop.updater", error);
      throw error;
    }
  };

  const scheduleInitialCheck = (delayMs = 1_000): void => {
    const timer = setTimeout(() => {
      void checkForUpdates().catch((error) => {
        logDesktopError("desktop.updater.schedule", error);
      });
    }, delayMs);
    timer.unref();
  };

  return {
    checkForUpdates,
    quitAndInstall() {
      appendDesktopLog("desktop.updater", "Restarting app to apply downloaded update.");
      autoUpdater.quitAndInstall(false, true);
    },
    scheduleInitialCheck,
  };
}
