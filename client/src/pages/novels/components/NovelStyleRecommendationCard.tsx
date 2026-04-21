import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StyleRecommendationResult } from "@ai-novel/shared/types/styleEngine";
import { createStyleBinding, getStyleBindings, recommendStyleProfilesForNovel } from "@/api/styleEngine";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
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
      setMessage("已将这套写法设为本书默认写法。自动导演前半段会先读取轻量摘要，正文规划与生成阶段再继续使用完整规则。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings(`novel-${novelId}`) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings("all") });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "写法绑定失败，请稍后再试。");
    },
  });

  if (!novelId) {
    return null;
  }

  return (
    <Card className="border-slate-200/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>这本书的默认写法</CardTitle>
            <div className="text-sm leading-7 text-muted-foreground">
              这里负责为当前小说选择和应用书级写法。写法资产属于资源层，应该在这里被小说消费，而不是从资产库反向决定“哪本书来用它”。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild type="button" variant="outline">
              <Link to="/style-engine">打开资产库 / 高级编辑</Link>
            </Button>
            <Button asChild type="button" variant="outline">
              <Link to="/style-engine?mode=imitate">去新建一套写法</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
          <div className="space-y-4 rounded-2xl border bg-slate-50/70 p-4">
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm font-medium text-slate-900">当前书级默认写法</div>
              {hasConfirmedBookStyle ? (
                <div className="mt-3 space-y-2">
                  {currentBindings.map((binding) => (
                    <div key={binding.id} className="rounded-xl border bg-slate-50/70 p-3">
                      <div className="font-medium text-slate-900">{binding.styleProfile?.name ?? binding.styleProfileId}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        优先级 P{binding.priority} / 强度 W{binding.weight}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm leading-7 text-muted-foreground">
                  这本书还没有绑定默认写法。推荐先让系统根据当前小说的目标读者、卖点和前 30 章承诺给出 2-3 套候选。
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-slate-950 p-4 text-white">
              <div className="text-sm font-medium">生效方式</div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
                <div>规划期：自动导演和章节规划只读取“读感承诺 / 语言密度 / 对白风格 / 情绪外显 / 反 AI 摘要”。</div>
                <div>正文期：绑定成功后，planner 和 runtime 会继续使用完整写法规则与反 AI 约束。</div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <AiButton onClick={() => recommendMutation.mutate()} disabled={recommendMutation.isPending}>
                {recommendMutation.isPending ? "正在推荐写法..." : "生成 2-3 套写法推荐"}
              </AiButton>
              {recommendation ? (
                <AiButton variant="secondary" onClick={() => recommendMutation.mutate()} disabled={recommendMutation.isPending}>
                  重新推荐
                </AiButton>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-slate-900">推荐结果</div>
            {recommendation ? (
              <>
                <div className="rounded-2xl border bg-slate-50/70 p-4 text-sm leading-7 text-slate-700">
                  {recommendation.summary}
                </div>
                {recommendation.candidates.length > 0 ? (
                  <div className="grid gap-3">
                    {recommendation.candidates.map((candidate) => (
                      <div key={candidate.styleProfileId} className="rounded-2xl border bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-slate-900">{candidate.styleProfileName}</div>
                            {candidate.styleProfileDescription ? (
                              <div className="mt-1 text-xs leading-6 text-slate-600">{candidate.styleProfileDescription}</div>
                            ) : null}
                          </div>
                          <Badge variant="outline">适配度 {candidate.fitScore}</Badge>
                        </div>
                        <div className="mt-3 text-sm leading-7 text-slate-700">{candidate.recommendationReason}</div>
                        {candidate.caution ? (
                          <div className="mt-3 rounded-xl border bg-amber-50/70 p-3 text-xs leading-6 text-amber-900">
                            注意事项：{candidate.caution}
                          </div>
                        ) : null}
                        <div className="mt-4 flex justify-end">
                          <Button
                            type="button"
                            onClick={() => applyMutation.mutate(candidate.styleProfileId)}
                            disabled={applyMutation.isPending}
                          >
                            {applyMutation.isPending ? "正在绑定..." : "设为本书默认写法"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    当前还没有可推荐的写法资产。可以先去写法引擎沉淀 1-2 套，再回来为这本书做选择。
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm leading-7 text-muted-foreground">
                这里会展示系统为当前小说挑出的 2-3 套写法方案，并告诉你为什么适合、有哪些注意事项。
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      {message ? (
        <CardContent className="pt-0">
          <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm">
            {message}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
