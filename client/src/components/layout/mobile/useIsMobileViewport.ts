import { useEffect, useState } from "react";

const MOBILE_WORKSPACE_MEDIA_QUERY = "(max-width: 767px)";

export function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window === "undefined" ? false : window.matchMedia(MOBILE_WORKSPACE_MEDIA_QUERY).matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_WORKSPACE_MEDIA_QUERY);
    const updateViewportState = () => {
      setIsMobile(mediaQuery.matches);
    };

    updateViewportState();
    mediaQuery.addEventListener("change", updateViewportState);

    return () => {
      mediaQuery.removeEventListener("change", updateViewportState);
    };
  }, []);

  return isMobile;
}
