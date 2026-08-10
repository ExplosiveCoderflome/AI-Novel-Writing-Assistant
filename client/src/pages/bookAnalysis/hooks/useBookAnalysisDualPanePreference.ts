import { useEffect, useState } from "react";
import { useViewportSize } from "@/hooks/useViewportSize";

const DUAL_PANE_STORAGE_KEY = "bookAnalysis.dualPane.enabled";
const DUAL_PANE_MIN_WIDTH = 1440;

function readStoredPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(DUAL_PANE_STORAGE_KEY) === "true";
}

export function useBookAnalysisDualPanePreference() {
  const viewport = useViewportSize();
  const [dualPaneRequested, setDualPaneRequested] = useState<boolean>(() => readStoredPreference());
  const dualPaneAvailable = viewport.width >= DUAL_PANE_MIN_WIDTH;
  const dualPaneEnabled = dualPaneAvailable && dualPaneRequested;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(DUAL_PANE_STORAGE_KEY, String(dualPaneRequested));
  }, [dualPaneRequested]);

  return {
    dualPaneAvailable,
    dualPaneEnabled,
    dualPaneRequested,
    setDualPaneEnabled: setDualPaneRequested,
    viewportWidth: viewport.width,
  };
}
