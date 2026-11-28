type TipStorage = Pick<Storage, "getItem" | "setItem"> | null;

export interface OnboardingTipDesktopBridge {
  getDismissedOnboardingTips?: () => Promise<string[]>;
  dismissOnboardingTip?: (storageKey: string) => Promise<string[]>;
}

export async function loadOnboardingTipDismissal(
  storageKey: string,
  storage: TipStorage,
  desktop?: OnboardingTipDesktopBridge,
): Promise<boolean> {
  let dismissed = false;
  try {
    dismissed = storage?.getItem(`ai-novel.guide-tip.${storageKey}`) === "dismissed";
  } catch {
    // Desktop preferences remain usable if page storage is unavailable.
  }
  try {
    const saved = await desktop?.getDismissedOnboardingTips?.();
    if (saved?.includes(storageKey)) return true;
    if (dismissed) await desktop?.dismissOnboardingTip?.(storageKey);
  } catch {
    // Keep honoring the existing page record if native storage cannot be read.
  }
  return dismissed;
}

export async function dismissOnboardingTip(
  storageKey: string,
  storage: TipStorage,
  desktop?: OnboardingTipDesktopBridge,
): Promise<void> {
  try {
    storage?.setItem(`ai-novel.guide-tip.${storageKey}`, "dismissed");
  } catch {
    // Keep the current page usable when browser storage is unavailable.
  }
  try {
    await desktop?.dismissOnboardingTip?.(storageKey);
  } catch {
    // Page storage still retains the close when native persistence is unavailable.
  }
}
