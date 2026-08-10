import { useEffect, useRef, type ReactNode } from "react";
import { APP_RUNTIME } from "@/lib/constants";
import {
  notifyDesktopAppShellReady,
  notifyDesktopRendererReady,
  useDesktopBootstrap,
} from "@/lib/desktop";
import DesktopBootstrapShell from "./DesktopBootstrapShell";

interface DesktopBootstrapBoundaryProps {
  children: ReactNode;
}

export default function DesktopBootstrapBoundary({ children }: DesktopBootstrapBoundaryProps) {
  const snapshot = useDesktopBootstrap();
  const didNotifyRendererReadyRef = useRef(false);
  const didNotifyAppShellReadyRef = useRef(false);
  const isDesktopRuntime = APP_RUNTIME === "desktop";
  const shouldHoldApp =
    isDesktopRuntime
    && (snapshot.state === "launching" || snapshot.state === "starting-server" || snapshot.state === "error");

  useEffect(() => {
    if (!isDesktopRuntime || didNotifyRendererReadyRef.current) {
      return;
    }

    notifyDesktopRendererReady();
    didNotifyRendererReadyRef.current = true;
  }, [isDesktopRuntime]);

  useEffect(() => {
    if (!isDesktopRuntime || shouldHoldApp || didNotifyAppShellReadyRef.current) {
      return;
    }

    notifyDesktopAppShellReady();
    didNotifyAppShellReadyRef.current = true;
  }, [isDesktopRuntime, shouldHoldApp]);

  if (!isDesktopRuntime) {
    return <>{children}</>;
  }

  return (
    <>
      {!shouldHoldApp ? children : null}
      {(shouldHoldApp || snapshot.state !== "ready") ? (
        <DesktopBootstrapShell snapshot={snapshot} overlay={!shouldHoldApp && snapshot.state !== "error"} />
      ) : null}
    </>
  );
}
