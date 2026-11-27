import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { RagConnectionTestResult } from "@ai-novel/shared/types/ragConnectivity";
import { Button } from "@/components/ui/button";

interface ConnectionTestControlProps<T> {
  input: T;
  label: string;
  hint: string;
  disabled: boolean;
  runTest: (input: T, signal: AbortSignal) => Promise<ApiResponse<RagConnectionTestResult>>;
}

export default function ConnectionTestControl<T>({ input, label, hint, disabled, runTest }: ConnectionTestControlProps<T>) {
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<{
    input: T;
    pending: boolean;
    result?: RagConnectionTestResult;
    error?: string;
  }>();
  const current = state?.input === input ? state : undefined;

  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, [input]);

  async function testConnection() {
    if (request.current || disabled) return;
    const controller = new AbortController();
    request.current = controller;
    setState({ input, pending: true });
    try {
      const response = await runTest(input, controller.signal);
      if (controller.signal.aborted) return;
      if (!response.success || !response.data) throw new Error("未收到连接测试结果，请重试。");
      setState({ input, pending: false, result: response.data });
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({ input, pending: false, error: error instanceof Error ? error.message : "连接测试失败，请重试。" });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => void testConnection()}
          disabled={disabled || current?.pending} aria-label={label} aria-busy={current?.pending ?? false}>
          {current?.pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {current?.pending ? "测试中…" : "测试连接"}
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="min-h-5 text-sm">
        {current?.result ? (
          <p className={current.result.ok ? "text-success" : "text-destructive"}>
            {current.result.message} <span className="text-xs text-muted-foreground">耗时 {current.result.durationMs} 毫秒</span>
          </p>
        ) : current?.error ? <p className="text-destructive">{current.error}</p> : null}
      </div>
    </div>
  );
}
