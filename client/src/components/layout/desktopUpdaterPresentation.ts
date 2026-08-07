import type { DesktopUpdaterSnapshot } from "@/lib/desktop";

export function formatDesktopVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed || trimmed === "0.0.0") {
    return "v0.0.0";
  }
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

export function getDesktopUpdaterStatusLabel(status: DesktopUpdaterSnapshot["status"]): string {
  switch (status) {
    case "disabled":
      return "Not available yet";
    case "idle":
      return "Waiting for inspection";
    case "checking":
      return "Checking";
    case "update-available":
      return "new version found";
    case "downloading":
      return "Downloading";
    case "downloaded":
      return "Waiting for restart installation";
    case "not-available":
      return "Newer version";
    case "error":
      return "Check failed";
    default:
      return status;
  }
}

export function getDesktopUpdaterHint(updater: DesktopUpdaterSnapshot): string {
  if (!updater.isSupported) {
    if (updater.isPortable) {
      return "The portable version needs to download the new version installation package and replace it manually. The existing creative data will not be affected.";
    }
    if (!updater.isPackaged) {
      return "The development environment will not download the installation package, and the official installation version can check and install updates here.";
    }
    return "This installation package is temporarily unable to connect to the version update service.";
  }

  switch (updater.status) {
    case "idle":
      return "You can check for updates to the desktop version at any time. After a new version is discovered, it is up to you to confirm the download and restart the installation.";
    case "checking":
      return "Connecting to version update service, please wait.";
    case "update-available":
      return `${formatDesktopVersion(updater.availableVersion ?? "new version")} 可用，下载期间可以继续使用应用。`;
    case "downloading":
      return "The update package is being downloaded in the background, please keep the app open.";
    case "downloaded":
      return "The update package is ready. It will be installed automatically after restarting the application. Please save unsaved input first.";
    case "not-available":
      return "The current installation package is compliant with the latest version of this update channel.";
    case "error":
      return "Failed to complete version check, please confirm network connection and try again.";
    default:
      return "You can check the desktop version status here.";
  }
}

export function getDesktopInstallModeLabel(updater: DesktopUpdaterSnapshot): string {
  if (updater.isPortable) {
    return "Portable version";
  }
  if (!updater.isPackaged) {
    return "development environment";
  }
  return "Installation version";
}

export function getDesktopChannelLabel(channel: string): string {
  return channel === "beta" ? "test channel" : channel === "latest" ? "stable channel" : `${channel} 通道`;
}
