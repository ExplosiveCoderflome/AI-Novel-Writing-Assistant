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
    queryKey: queryKeys.styleEngine.bindings(`novel-${novelId}`), queryFn: () => getStyleBindings({ targetType: "novel", targetId: novelId }), enabled: Boolean(novelId), }); const currentBindings = novelBindingsQuery.data?.data ?? []; const hasConfirmedBookStyle = currentBindings.length > 0; const recommendMutation = useMutation({ mutationFn: () => recommendStyleProfilesForNovel(novelId, { provider: llm.provider, model: llm.model, temperature: 0.3, }), onSuccess: (response) => { setRecommendation(response.data ?? null); setMessage(""); }, onError: (error) => { setMessage(error instanceof Error ? error.message: "Writing recommendation failed, please try again later."); }, }); const applyMutation = useMutation({ mutationFn: (styleProfileId: string) => createStyleBinding({ styleProfileId, targetType: "novel", targetId: novelId, priority: 1, weight: 1, enabled: true, }), onSuccess: async () => { setMessage("This style has been set as the default style for this book. The automatic director will first read the lightweight summary, and then continue to use the full rules in the main text planning and generation stage."); await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings(`novel-${novelId}`) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings("all") });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Writing method binding failed, please try again later.");
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
            <CardTitle>The default writing style of this book</CardTitle>
            <div className="text-sm leading-7 text-muted-foreground">
              This is where you choose and apply book-level writing methods to your current novel. Writing assets belong to the resource layer and should be consumed by novels here, instead of deciding "which book to use it" from the asset library.
                                      </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild type="button" variant="outline">
              <Link to="/style-engine">Open Asset Library/Advanced Editing</Link>
            </Button>
            <Button asChild type="button" variant="outline">
              <Link to="/style-engine?mode=imitate">Go to create a new writing style</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
          <div className="space-y-4 rounded-2xl border bg-slate-50/70 p-4">
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm font-medium text-slate-900">Default writing method for current book level</div>
              {hasConfirmedBookStyle ? (
                <div className="mt-3 space-y-2">
                  {currentBindings.map((binding) => (
                    <div key={binding.id} className="rounded-xl border bg-slate-50/70 p-3">
                      <div className="font-medium text-slate-900">{binding.styleProfile?.name ?? binding.styleProfileId}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        Priority P{binding.priority} / Strength W{binding.weight}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm leading-7 text-muted-foreground">
                  This book is not yet bound to the default writing method. It is recommended to first let the system give 2-3 sets of candidates based on the target readers of the current novel, its selling points, and the promise of the first 30 chapters.
                                                      </div>
              )}
            </div>

            <div className="rounded-2xl border bg-slate-950 p-4 text-white">
              <div className="text-sm font-medium">Effective method</div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
                <div>Planning period: Automatic director and chapter planning only read "reading sense commitment/language density/dialogue style/emotional explicitness/anti-AI summary".</div>
                <div>Text period: After successful binding, the planner and runtime will continue to use the complete writing rules and anti-AI constraints.</div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <AiButton onClick={() => recommendMutation.mutate()} disabled={recommendMutation.isPending}>
                {recommendMutation.isPending ? "Recommending syntax..." : "Generating 2-3 recommended syntax examples"}
              </AiButton>
              {recommendation ? (
                <AiButton variant="secondary" onClick={() => recommendMutation.mutate()} disabled={recommendMutation.isPending}>
                  重新推荐
                </AiButton>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-slate-900">Recommended results</div>
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
                          <Badge variant="outline">fitness {candidate.fitScore}</Badge>
                        </div>
                        <div className="mt-3 text-sm leading-7 text-slate-700">{candidate.recommendationReason}</div>
                        {candidate.caution ? (
                          <div className="mt-3 rounded-xl border bg-amber-50/70 p-3 text-xs leading-6 text-amber-900">
                            Things to note:{candidate.caution}
                          </div>
                        ) : null}
                        <div className="mt-4 flex justify-end">
                          <Button
                            type="button"
                            onClick={() => applyMutation.mutate(candidate.styleProfileId)}
                            disabled={applyMutation.isPending}
                          >
                            {applyMutation.isPending ? "Binding..." : "Set as the default writing method for this book"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    There are currently no writing assets to recommend. You can first go to the writing engine to accumulate 1-2 sets, and then come back to make choices for this book.
                                                            </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm leading-7 text-muted-foreground">
                Here we will display 2-3 sets of writing methods selected by the system for the current novel, and tell you why they are suitable and what precautions you should take.
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
