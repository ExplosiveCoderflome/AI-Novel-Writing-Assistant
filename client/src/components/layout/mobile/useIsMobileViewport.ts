import { useEffect, useState } from "react";

// 安卓 App（MainActivity 注入 window.__ANDROID_APP__）按屏幕方向切换布局：
// 竖屏 → 移动布局（底部导航），横屏 → 桌面布局（左侧导航），方向自由旋转。
// 不用宽度断点（低分辨率手机横屏 CSS 宽度 <768px 会误判）。
// 浏览器/桌面端仍按宽度判断。
const MOBILE_WORKSPACE_MEDIA_QUERY = "(max-width: 767px)";
const ANDROID_PORTRAIT_MEDIA_QUERY = "(orientation: portrait)";

function isAndroidApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { __ANDROID_APP__?: boolean };
  if (w.__ANDROID_APP__ === true) return true;
  // MainActivity 的 loadUrl 一开始就带 ?__ANDROID_APP__=1；window 标志要等
  // onPageFinished 才注入（晚于 React 首帧），这里兜底消除首帧布局竞态，
  // 检出后固化到 window（SPA 导航 pushState 会丢 query，避免之后回退成宽度断点）
  try {
    if (new URLSearchParams(window.location.search).has("__ANDROID_APP__")) {
      w.__ANDROID_APP__ = true;
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    if (isAndroidApp()) {
      // 安卓 App：竖屏 → 移动布局；横屏 → 桌面布局
      return window.matchMedia(ANDROID_PORTRAIT_MEDIA_QUERY).matches;
    }
    return window.matchMedia(MOBILE_WORKSPACE_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    const mediaQuery = isAndroidApp()
      ? window.matchMedia(ANDROID_PORTRAIT_MEDIA_QUERY)
      : window.matchMedia(MOBILE_WORKSPACE_MEDIA_QUERY);
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
