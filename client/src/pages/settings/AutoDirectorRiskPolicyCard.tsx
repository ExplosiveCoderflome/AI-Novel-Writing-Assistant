import { useEffect, useState } from "react";
import type { DirectorRiskPolicy } from "@/api/directorRiskPolicy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

function normalizePolicy(noticeValue: number, pauseValue: number): DirectorRiskPolicy {
  const noticeThreshold = Math.max(2, Math.min(7, Math.round(noticeValue) || 5));
  const pauseThreshold = Math.max(noticeThreshold + 1, Math.min(8, Math.max(3, Math.round(pauseValue) || 8)));
  return { noticeThreshold, pauseThreshold };
}

export function AutoDirectorRiskPolicyCard(props: {
  policy?: DirectorRiskPolicy | null;
  isLoading: boolean;
  isSaving: boolean;
  unavailable?: boolean;
  onSave: (policy: DirectorRiskPolicy) => void;
}) {
  const { policy, isLoading, isSaving, unavailable = false, onSave } = props;
  const [draft, setDraft] = useState<DirectorRiskPolicy>({ noticeThreshold: 5, pauseThreshold: 8 });

  useEffect(() => {
    if (policy) setDraft(policy);
  }, [policy]);

  const setNoticeThreshold = (value: number) => setDraft((current) => normalizePolicy(value, current.pauseThreshold));
  const setPauseThreshold = (value: number) => setDraft((current) => normalizePolicy(current.noticeThreshold, value));

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>自动导演风险规则</CardTitle>
        <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
          你可以设置何时收到提醒、何时在安全节点暂停。局部质量债只会提醒，不会中断整本创作；风险分数最高为 8 分。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">提醒分数</span>
            <Input type="number" min={2} max={7} value={draft.noticeThreshold} disabled={isLoading || unavailable}
              onChange={(event) => setNoticeThreshold(Number(event.target.value))} />
            <span className="block text-xs text-muted-foreground">达到 {draft.noticeThreshold} 分时，会记录风险并发送提醒。</span>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">保护性暂停分数</span>
            <Input type="number" min={draft.noticeThreshold + 1} max={8} value={draft.pauseThreshold} disabled={isLoading || unavailable}
              onChange={(event) => setPauseThreshold(Number(event.target.value))} />
            <span className="block text-xs leading-5 text-muted-foreground">需高于提醒分数；只有影响全书推进的问题才会在安全节点暂停。</span>
          </label>
        </div>
        {unavailable ? <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">风险规则服务准备中，当前自动导演仍按默认“提醒 5 分、暂停 8 分”执行。</div> : null}
        <div className="flex justify-end">
          <Button type="button" disabled={isLoading || isSaving || unavailable} onClick={() => onSave(draft)}>
            {isSaving ? "保存中..." : "保存风险规则"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
