import { useEffect, useState } from "react";

// 安卓 App（MainActivity 注入 window.__ANDROID_APP__）固定横屏 + 强制桌面布局，
// 不看宽度断点——避免低分辨率手机横屏（CSS 宽度 <768px）误入移动布局。
// 浏览器/桌面端仍按宽度判断。
const MOBILE_WORKSPACE_MEDIA_QUERY = "(max-width: 767px)";

function isAndroidApp(): boolean {
  return typeof window !== "undefined" && (window as unknown as { __ANDROID_APP__?: boolean }).__ANDROID_APP__ === true;
}

export function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window === "undefined" || isAndroidApp()
      ? false
      : window.matchMedia(MOBILE_WORKSPACE_MEDIA_QUERY).matches
  ));

  useEffect(() => {
    if (isAndroidApp()) {
      setIsMobile(false);
      return;
    }
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
