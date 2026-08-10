import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type BookAnalysisActiveView = "sections" | "characters";

const VIEW_VALUES: ReadonlySet<BookAnalysisActiveView> = new Set(["sections", "characters"]);
const DEFAULT_VIEW: BookAnalysisActiveView = "sections";

function normalizeView(raw: string | null): BookAnalysisActiveView {
  if (raw && VIEW_VALUES.has(raw as BookAnalysisActiveView)) {
    return raw as BookAnalysisActiveView;
  }
  return DEFAULT_VIEW;
}

export function useBookAnalysisActiveView(): {
  activeView: BookAnalysisActiveView;
  setActiveView: (view: BookAnalysisActiveView) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = useMemo(() => normalizeView(searchParams.get("view")), [searchParams]);

  const setActiveView = useCallback((view: BookAnalysisActiveView) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (view === DEFAULT_VIEW) {
          next.delete("view");
        } else {
          next.set("view", view);
        }
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return { activeView, setActiveView };
}
