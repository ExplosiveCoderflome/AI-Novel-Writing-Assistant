import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getWorldGenerationTimeoutSettings,
  saveWorldGenerationTimeoutSettings,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MS_PER_MINUTE = 60_000;

function toMinutes(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.round(value / MS_PER_MINUTE);
}

export function WorldGenerationTimeoutSection() {
  const queryClient = useQueryClient();
  const [minutes, setMinutes] = useState("2");
  const [feedback, setFeedback] = useState("");
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.worldGenerationTimeout,
    queryFn: getWorldGenerationTimeoutSettings,
  });
  const settings = settingsQuery.data?.data;
  const minMinutes = toMinutes(settings?.minTimeoutMs, 2);
  const maxMinutes = toMinutes(settings?.maxTimeoutMs, 10);
  const parsedMinutes = Number(minutes);
  const isValidTimeout = Number.isInteger(parsedMinutes)
    && parsedMinutes >= minMinutes
    && parsedMinutes <= maxMinutes;

  useEffect(() => {
    if (settings) {
      setMinutes(String(toMinutes(settings.timeoutMs, minMinutes)));
    }
  }, [settings, minMinutes]);

  const saveMutation = useMutation({
    mutationFn: (nextMinutes: number) => saveWorldGenerationTimeoutSettings({
      timeoutMs: nextMinutes * MS_PER_MINUTE,
    }),
    onSuccess: async (response) => {
      setFeedback(response.message ?? "世界观生成等待时间保存成功。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.worldGenerationTimeout });
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "世界观生成等待时间保存失败。");
    },
  });

  return (
    <section className="space-y-3" aria-labelledby="world-generation-timeout-title">
      <div className="space-y-1">
        <h2 id="world-generation-timeout-title" className="text-base font-medium">单次生成最长等待</h2>
        <p className="text-sm text-muted-foreground">
          本地模型较慢时，可以调高世界观生成的单次等待。云端模型保持 2 分钟即可。保存后，下一次世界观生成按这个时间等待。失败后系统可能再自动试一次。
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="space-y-1 text-sm">
          <span>等待时间（分钟）</span>
          <Input
            type="number"
            min={minMinutes}
            max={maxMinutes}
            step={1}
            value={minutes}
            className="w-28"
            onChange={(event) => {
              setFeedback("");
              setMinutes(event.target.value);
            }}
          />
        </label>
        <Button
          type="button"
          onClick={() => saveMutation.mutate(parsedMinutes)}
          disabled={settingsQuery.isLoading || saveMutation.isPending || !isValidTimeout}
        >
          {saveMutation.isPending ? "保存中..." : "保存"}
        </Button>
      </div>
      {!isValidTimeout ? (
        <p className="text-sm text-amber-700">请输入 {minMinutes} 到 {maxMinutes} 分钟之间的整数。</p>
      ) : (
        <p className="text-sm text-muted-foreground">可设置 {minMinutes} 到 {maxMinutes} 分钟。</p>
      )}
      {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
    </section>
  );
}
