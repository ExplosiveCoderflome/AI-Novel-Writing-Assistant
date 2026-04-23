import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getStyleEngineRuntimeSettings,
  saveStyleEngineRuntimeSettings,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const MS_PER_MINUTE = 60_000;

function toMinutes(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 10;
  }
  return Math.round(value / MS_PER_MINUTE);
}

export default function StyleEngineRuntimeSettingsCard() {
  const queryClient = useQueryClient();
  const [timeoutMinutes, setTimeoutMinutes] = useState("10");
  const [feedback, setFeedback] = useState("");

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.styleEngineRuntime,
    queryFn: getStyleEngineRuntimeSettings,
  });

  const settings = settingsQuery.data?.data;
  const limits = useMemo(() => ({
    minMinutes: toMinutes(settings?.minStyleExtractionTimeoutMs),
    maxMinutes: toMinutes(settings?.maxStyleExtractionTimeoutMs),
    effectiveMinutes: toMinutes(settings?.styleExtractionTimeoutMs),
    defaultMinutes: toMinutes(settings?.defaultStyleExtractionTimeoutMs),
  }), [settings]);

  useEffect(() => {
    if (settings) {
      setTimeoutMinutes(String(toMinutes(settings.styleExtractionTimeoutMs)));
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (minutes: number) =>
      saveStyleEngineRuntimeSettings({
        styleExtractionTimeoutMs: minutes * MS_PER_MINUTE,
      }),
    onSuccess: async (response) => {
      setFeedback(response.message ?? "写法引擎运行设置保存成功。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.styleEngineRuntime });
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "写法引擎运行设置保存失败。");
    },
  });

  const parsedMinutes = Number(timeoutMinutes);
  const isValidTimeout = Number.isInteger(parsedMinutes)
    && parsedMinutes >= limits.minMinutes
    && parsedMinutes <= limits.maxMinutes;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>写法引擎运行设置</CardTitle>
          <CardDescription>
            控制写法提取等待模型返回的最长时间。长篇原文提取可以适当调高，短文本保持较短更容易发现异常。
          </CardDescription>
        </div>
        <Badge variant="outline">生效值 {limits.effectiveMinutes} 分钟</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <div className="text-sm font-medium">写法提取超时（分钟）</div>
              <Input
                type="number"
                min={limits.minMinutes}
                max={limits.maxMinutes}
                step={1}
                value={timeoutMinutes}
                onChange={(event) => {
                  setFeedback("");
                  setTimeoutMinutes(event.target.value);
                }}
              />
            </div>
            <Button
              className="w-full md:w-auto"
              onClick={() => saveMutation.mutate(parsedMinutes)}
              disabled={settingsQuery.isLoading || saveMutation.isPending || !isValidTimeout}
            >
              {saveMutation.isPending ? "保存中..." : "保存设置"}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            可设置范围：{limits.minMinutes}-{limits.maxMinutes} 分钟。默认值 {limits.defaultMinutes} 分钟。
            保存后，新提交和重试的写法提取任务会使用该等待时间。
          </div>
        </div>

        {!isValidTimeout ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            请输入 {limits.minMinutes}-{limits.maxMinutes} 分钟之间的整数。
          </div>
        ) : null}

        {feedback ? <div className="text-sm text-muted-foreground">{feedback}</div> : null}
      </CardContent>
    </Card>
  );
}
