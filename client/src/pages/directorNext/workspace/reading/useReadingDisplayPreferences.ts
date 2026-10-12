import {useCallback, useEffect, useState} from "react";
import {
  loadReadingDisplayPreferences,
  normalizeReadingDisplayPreferences,
  saveReadingDisplayPreferences,
  type ReadingDisplayPreferences,
} from "./displayPreferences";

function browserStorage(): Storage | null {
  try {return typeof window === "undefined" ? null : window.localStorage;} catch {return null;}
}

export function useReadingDisplayPreferences() {
  const [preferences, setPreferences] = useState(() => loadReadingDisplayPreferences(browserStorage()));
  useEffect(() => {saveReadingDisplayPreferences(preferences, browserStorage());}, [preferences]);
  const updatePreferences = useCallback((next: ReadingDisplayPreferences) => {
    setPreferences(normalizeReadingDisplayPreferences(next));
  }, []);
  return {preferences, updatePreferences};
}
