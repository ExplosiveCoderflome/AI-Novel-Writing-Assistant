import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { API_BASE_URL, APP_RUNTIME } from "@/lib/constants";
import { Button } from "@/components/ui/button";

interface ServerStartupGateProps {
  children: ReactNode;
}

type StartupStatus = "checking" | "ready" | "waiting";

const STARTUP_CHECK_INTERVAL_MS = 1000;
const STARTUP_WAIT_THRESHOLD_MS = 1200;

function shouldUseStartupGate(): boolean {
  return import.meta.env.DEV && APP_RUNTIME !== "desktop";
}

async function checkServerReady(signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      cache: "no-store",
      signal,
    });
    return response.ok;
  } catch {
    return false;
  }
}

function ServerStartupScreen(props: {
  status: StartupStatus;
  onRetry: () => void;
}) {
  const { status, onRetry } = props;
  const waiting = status === "waiting";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full border bg-muted/40">
          <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-foreground">正在连接本地创作服务</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          页面已准备好，系统会在服务可用后自动进入工作台。
        </p>
        {waiting ? (
          <div className="mt-6">
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-2 size-4" aria-hidden="true" />
              重新检查
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ServerStartupGate({ children }: ServerStartupGateProps) {
  const enabled = useMemo(() => shouldUseStartupGate(), []);
  const [status, setStatus] = useState<StartupStatus>(enabled ? "checking" : "ready");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!enabled || status === "ready") {
      return;
    }

    const abortController = new AbortController();
    let timeoutId: number | undefined;
    let intervalId: number | undefined;

    timeoutId = window.setTimeout(() => {
      setStatus((current) => (current === "ready" ? current : "waiting"));
    }, STARTUP_WAIT_THRESHOLD_MS);

    async function probe() {
      const ready = await checkServerReady(abortController.signal);
      if (abortController.signal.aborted) {
        return;
      }
      if (ready) {
        setStatus("ready");
      }
    }

    void probe();
    intervalId = window.setInterval(() => {
      void probe();
    }, STARTUP_CHECK_INTERVAL_MS);

    return () => {
      abortController.abort();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [enabled, retryToken, status]);

  if (status === "ready") {
    return <>{children}</>;
  }

  return (
    <ServerStartupScreen
      status={status}
      onRetry={() => {
        setStatus("checking");
        setRetryToken((current) => current + 1);
      }}
    />
  );
}
