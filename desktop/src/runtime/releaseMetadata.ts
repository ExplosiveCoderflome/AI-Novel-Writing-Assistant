import fs from "node:fs";
import path from "node:path";

export type DesktopReleaseMode = "verify" | "beta" | "stable";
export type DesktopUpdateChannel = "beta" | "latest" | "disabled";
export type DesktopSigningStatus = "none" | "full";
export type DesktopUpdateDisabledReason =
  | "development"
  | "metadata-missing"
  | "metadata-invalid"
  | "version-mismatch"
  | "verification-build"
  | "unsigned-macos"
  | "metadata-disabled"
  | null;

export interface DesktopReleaseMetadata {
  releaseMode: DesktopReleaseMode;
  updateChannel: DesktopUpdateChannel;
  updatesEnabled: boolean;
  signingStatus: DesktopSigningStatus;
  disabledReason: DesktopUpdateDisabledReason;
}

interface PackagedReleaseMetadataSource {
  releaseMode?: unknown;
  updateChannel?: unknown;
  updatesEnabled?: unknown;
  signingStatus?: unknown;
}

interface PackagedAppMetadataSource {
  version?: unknown;
  aiNovelRelease?: PackagedReleaseMetadataSource;
}

export interface ResolveDesktopReleaseMetadataOptions {
  isPackaged: boolean;
  appPath: string;
  appVersion: string;
  platform: NodeJS.Platform;
  readFile?: (filePath: string) => string;
}

function disabledMetadata(reason: Exclude<DesktopUpdateDisabledReason, null>): DesktopReleaseMetadata {
  return {
    releaseMode: "verify",
    updateChannel: "disabled",
    updatesEnabled: false,
    signingStatus: "none",
    disabledReason: reason,
  };
}

function isReleaseMode(value: unknown): value is DesktopReleaseMode {
  return value === "verify" || value === "beta" || value === "stable";
}

function isUpdateChannel(value: unknown): value is DesktopUpdateChannel {
  return value === "beta" || value === "latest" || value === "disabled";
}

function isSigningStatus(value: unknown): value is DesktopSigningStatus {
  return value === "none" || value === "full";
}

function validateMetadataShape(value: PackagedReleaseMetadataSource | undefined): DesktopReleaseMetadata | null {
  if (
    !value
    || !isReleaseMode(value.releaseMode)
    || !isUpdateChannel(value.updateChannel)
    || typeof value.updatesEnabled !== "boolean"
    || !isSigningStatus(value.signingStatus)
  ) {
    return null;
  }

  if (value.releaseMode === "verify") {
    if (value.updateChannel !== "disabled" || value.updatesEnabled) {
      return null;
    }
    return {
      releaseMode: value.releaseMode,
      updateChannel: value.updateChannel,
      updatesEnabled: value.updatesEnabled,
      signingStatus: value.signingStatus,
      disabledReason: "verification-build",
    };
  }

  const expectedEnabledChannel = value.releaseMode === "beta" ? "beta" : "latest";
  if (value.updatesEnabled && value.updateChannel !== expectedEnabledChannel) {
    return null;
  }
  if (!value.updatesEnabled && value.updateChannel !== "disabled") {
    return null;
  }

  return {
    releaseMode: value.releaseMode,
    updateChannel: value.updateChannel,
    updatesEnabled: value.updatesEnabled,
    signingStatus: value.signingStatus,
    disabledReason: value.updatesEnabled ? null : "metadata-disabled",
  };
}

export function resolveDesktopReleaseMetadata(
  options: ResolveDesktopReleaseMetadataOptions,
): DesktopReleaseMetadata {
  if (!options.isPackaged) {
    return disabledMetadata("development");
  }

  let packageMetadata: PackagedAppMetadataSource;
  try {
    const readFile = options.readFile ?? ((filePath: string) => fs.readFileSync(filePath, "utf8"));
    packageMetadata = JSON.parse(readFile(path.join(options.appPath, "package.json"))) as PackagedAppMetadataSource;
  } catch (_error) {
    return disabledMetadata("metadata-missing");
  }

  if (packageMetadata.version !== options.appVersion) {
    return disabledMetadata("version-mismatch");
  }

  const metadata = validateMetadataShape(packageMetadata.aiNovelRelease);
  if (!metadata) {
    return disabledMetadata("metadata-invalid");
  }

  if (options.platform === "darwin" && metadata.signingStatus !== "full") {
    return {
      ...metadata,
      updateChannel: "disabled",
      updatesEnabled: false,
      disabledReason: "unsigned-macos",
    };
  }

  return metadata;
}
