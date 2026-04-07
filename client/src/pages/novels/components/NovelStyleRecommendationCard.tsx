import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StyleRecommendationResult } from "@ai-novel/shared/types/styleEngine";
import { createStyleBinding, getStyleBindings, recommendStyleProfilesForNovel } from "@/api/styleEngine";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLLMStore } from "@/store/llmStore";

interface NovelStyleRecommendationCardProps {
  novelId: string;
}

export default function NovelStyleRecommendationCard({ novelId }: NovelStyleRecommendationCardProps) {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [recommendation, setRecommendation] = useState<StyleRecommendationResult | null>(null);
  const [message, setMessage] = useState("");

  const novelBindingsQuery = useQuery({
    queryKey: queryKeys.styleEngine.bindings(`novel-${novelId}`),
    queryFn: () => getStyleBindings({ targetType: "novel", targetId: novelId }),
    enabled: Boolean(novelId),
  });

  const currentBindings = novelBindingsQuery.data?.data ?? [];
  const hasConfirmedBookStyle = currentBindings.length > 0;

  const recommendMutation = useMutation({
    mutationFn: () => recommendStyleProfilesForNovel(novelId, {
      provider: llm.provider,
      model: llm.model,
      temperature: 0.3,
    }),
    onSuccess: (response) => {
      setRecommendation(response.data ?? null);
      setMessage("");
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "写法推荐失败，请稍后再试。");
    },
  });

  const applyMutation = useMutation({
    mutationFn: (styleProfileId: string) => createStyleBinding({
      styleProfileId,
      targetType: "novel",
      targetId: novelId,
      priority: 1,
      weight: 1,
      enabled: true,
    }),
    onSuccess: async () => {
      setMessage("已将推荐写法设为本书默认写法。后续章节生成会优先按这套写法执行。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings(`novel-${novelId}`) });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "写法绑定失败，请稍后再试。");
    },
  });

  if (!novelId) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>正文开写前的写法确认</CardTitle>
          <div className="text-sm leading-6 text-muted-foreground">
            不在创建阶段强制你先挑写法。等这本书的目标读者、卖点和前 30 章承诺初步明确后，再让系统帮你推荐更合适的写法资产。
          </div>
        </div>
        <Button asChild type="button" variant="outline">
          <Link to="/writing-formula">打开写法引擎</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasConfirmedBookStyle ? (
          <div className="rounded-md border bg-muted/20 p-4">
            <div className="text-sm font-medium">本书已确认默认写法</div>
            <div className="mt-2 space-y-2">
              {currentBindings.map((binding) => (
                <div key={binding.id} className="rounded-md border bg-background p-3 text-sm">
                  <div className="font-medium">{binding.styleProfile?.name ?? binding.styleProfileId}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    优先级 P{binding.priority} / 强度 W{binding.weight}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              如果想更换整本默认写法，建议到写法引擎里重新绑定，或在章节页做局部覆盖。
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <AiButton onClick={() => recommendMutation.mutate()} disabled={recommendMutation.isPending}>
                {recommendMutation.isPending ? "正在推荐写法..." : "AI 推荐写法资产"}
              </AiButton>
              {recommendation ? (
                <AiButton variant="secondary" onClick={() => recommendMutation.mutate()} disabled={recommendMutation.isPending}>
                  重新推荐
                </AiButton>
              ) : null}
            </div>

            {!recommendation && !recommendMutation.isPending ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                先让系统根据这本小说的目标读者、前 30 章承诺、题材、文风关键词和叙事方向推荐 2-3 套候选写法，再决定是否采用。
              </div>
            ) : null}

            {recommendation ? (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  {recommendation.summary}
                </div>
                {recommendation.candidates.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {recommendation.candidates.map((candidate) => (
                      <div key={candidate.styleProfileId} className="rounded-md border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{candidate.styleProfileName}</div>
                            {candidate.styleProfileDescription ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {candidate.styleProfileDescription}
                              </div>
                            ) : null}
                          </div>
                          <div className="rounded-full border px-2 py-1 text-xs text-muted-foreground">
                            适配度 {candidate.fitScore}
                          </div>
                        </div>
                        <div className="mt-3 text-sm leading-6">
                          {candidate.recommendationReason}
                        </div>
                        {candidate.caution ? (
                          <div className="mt-3 rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                            注意：{candidate.caution}
                          </div>
                        ) : null}
                        <div className="mt-4 flex justify-end">
                          <Button
                            onClick={() => applyMutation.mutate(candidate.styleProfileId)}
                            disabled={applyMutation.isPending}
                          >
                            {applyMutation.isPending ? "正在确认..." : "设为本书默认写法"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    当前还没有可推荐的写法资产。可以先去写法引擎沉淀 1-2 套写法资产，再回来让系统推荐。
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}

        {message ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
            {message}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
