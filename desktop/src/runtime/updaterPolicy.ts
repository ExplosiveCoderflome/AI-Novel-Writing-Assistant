import type { DesktopReleaseMetadata } from "./releaseMetadata";

export interface DesktopAutoUpdaterPolicyTarget {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  allowPrerelease: boolean;
  channel: string | null;
}

export interface DesktopUpdaterSupportOptions {
  releaseMetadata: DesktopReleaseMetadata;
  isPackaged: boolean;
  isPortable: boolean;
  hasFeedConfig: boolean;
  disabledByEnvironment: boolean;
}

export interface DesktopUpdaterSupport {
  supported: boolean;
  message: string;
}

export function applyDesktopAutoUpdaterPolicy(
  updater: DesktopAutoUpdaterPolicyTarget,
  releaseMetadata: DesktopReleaseMetadata,
): void {
  if (!releaseMetadata.updatesEnabled || releaseMetadata.updateChannel === "disabled") {
    throw new Error("Cannot configure electron-updater for a disabled desktop update contract.");
  }

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.channel = releaseMetadata.updateChannel;
  updater.allowPrerelease = releaseMetadata.releaseMode === "beta";
  // Setting electron-updater.channel enables downgrade internally. Keep this assignment last.
  updater.allowDowngrade = false;
}

export function resolveDesktopUpdaterSupport(options: DesktopUpdaterSupportOptions): DesktopUpdaterSupport {
  if (!options.isPackaged) {
    return {
      supported: false,
      message: "开发环境不下载安装包，请在正式安装版中检查更新。",
    };
  }
  if (options.isPortable) {
    return {
      supported: false,
      message: "便携版需要下载新版安装包后手动替换。",
    };
  }
  if (options.releaseMetadata.disabledReason === "unsigned-macos") {
    return {
      supported: false,
      message: "此 Mac 安装包未使用完整的 Developer ID 签名与公证，自动更新已关闭，请手动下载新版安装包。",
    };
  }
  if (options.releaseMetadata.disabledReason === "verification-build") {
    return {
      supported: false,
      message: "此验证安装包不连接版本更新服务。",
    };
  }
  if (
    options.releaseMetadata.disabledReason === "metadata-missing"
    || options.releaseMetadata.disabledReason === "metadata-invalid"
    || options.releaseMetadata.disabledReason === "version-mismatch"
  ) {
    return {
      supported: false,
      message: "此安装包的版本更新信息无效，自动更新已安全关闭。",
    };
  }
  if (!options.releaseMetadata.updatesEnabled || options.releaseMetadata.updateChannel === "disabled") {
    return {
      supported: false,
      message: "此安装包未启用自动更新，请手动下载新版安装包。",
    };
  }
  if (!options.hasFeedConfig) {
    return {
      supported: false,
      message: "此安装包未配置版本更新通道。",
    };
  }
  if (options.disabledByEnvironment) {
    return {
      supported: false,
      message: "桌面版更新已被运行环境关闭。",
    };
  }
  return {
    supported: true,
    message: "可以检查桌面版更新。",
  };
}
