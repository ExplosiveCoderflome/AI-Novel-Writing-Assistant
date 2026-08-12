import i18next from "i18next";
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
      return i18next.t("layout.desktopUpdaterPresentation.d9an1g");
    case "idle":
      return i18next.t("dict.gen_c52ee445");
    case "checking":
      return i18next.t("layout.desktopUpdaterPresentation.dwvmyy");
    case "update-available":
      return i18next.t("layout.desktopUpdaterPresentation.cew3bf");
    case "downloading":
      return i18next.t("layout.desktopUpdaterPresentation.dwrb93");
    case "downloaded":
      return i18next.t("layout.desktopUpdaterPresentation.757pom");
    case "not-available":
      return i18next.t("layout.desktopUpdaterPresentation.eupnxt");
    case "error":
      return i18next.t("dict.gen_74bb5c74");
    default:
      return status;
  }
}

export function getDesktopUpdaterHint(updater: DesktopUpdaterSnapshot): string {
  if (!updater.isSupported) {
    if (updater.isPortable) {
      return i18next.t("layout.desktopUpdaterPresentation.uefrxj");
    }
    if (!updater.isPackaged) {
      return i18next.t("layout.desktopUpdaterPresentation.3uk6u0");
    }
    return i18next.t("layout.desktopUpdaterPresentation.drgkpz");
  }

  switch (updater.status) {
    case "idle":
      return i18next.t("layout.desktopUpdaterPresentation.50z40j");
    case "checking":
      return i18next.t("layout.desktopUpdaterPresentation.yl4h85");
    case "update-available":
      return i18next.t("layout.desktopUpdaterPresentation.gebzkx", { val1: formatDesktopVersion(updater.availableVersion ?? "新版本") });
    case "downloading":
      return i18next.t("layout.desktopUpdaterPresentation.lxenzk");
    case "downloaded":
      return i18next.t("layout.desktopUpdaterPresentation.9qdxux");
    case "not-available":
      return i18next.t("layout.desktopUpdaterPresentation.gak1xq");
    case "error":
      return i18next.t("layout.desktopUpdaterPresentation.9tny4h");
    default:
      return i18next.t("layout.desktopUpdaterPresentation.qobpfx");
  }
}

export function getDesktopInstallModeLabel(updater: DesktopUpdaterSnapshot): string {
  if (updater.isPortable) {
    return i18next.t("layout.desktopUpdaterPresentation.c66a5");
  }
  if (!updater.isPackaged) {
    return i18next.t("layout.desktopUpdaterPresentation.cc71hh");
  }
  return i18next.t("layout.desktopUpdaterPresentation.e2jxo");
}

export function getDesktopChannelLabel(channel: string): string {
  return channel === "beta" ? "测试通道" : channel === "latest" ? "稳定通道" : i18next.t("layout.desktopUpdaterPresentation.k8p089", { val1: channel });
}
