import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BookAnalysisDetail,
  BookAnalysisPublishResult,
} from "@ai-novel/shared/types/bookAnalysis";
import { useNavigate } from "react-router-dom";
import { publishBookAnalysis } from "@/api/bookAnalysis";
import { queryKeys } from "@/api/queryKeys";
import { createStyleProfileFromBookAnalysis } from "@/api/styleEngine";
import { toast } from "@/components/ui/toast";
import type { LLMConfigState } from "../../bookAnalysis.types";

export function useAnalysisPublishing(input: {
  selectedAnalysis?: BookAnalysisDetail;
  selectedAnalysisId: string;
  selectedNovelId: string;
  selectedDocumentId: string;
  llmConfig: LLMConfigState;
  refreshAnalysisData: (analysisId: string) => Promise<void>;
}) {
  const {
    selectedAnalysis,
    selectedAnalysisId,
    selectedNovelId,
    llmConfig,
    refreshAnalysisData,
  } = input;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [publishFeedback, setPublishFeedback] = useState("");
  const [styleProfileFeedback, setStyleProfileFeedback] = useState("");
  const [lastPublishResult, setLastPublishResult] = useState<BookAnalysisPublishResult | null>(null);

  const publishMutation = useMutation({
    mutationFn: (payload: { id: string; novelId: string }) =>
      publishBookAnalysis(payload.id, { novelId: payload.novelId }),
    onSuccess: async (response, payload) => {
      const published = response.data;
      if (!published) {
        return;
      }
      setLastPublishResult(published);
      setPublishFeedback(
        `发布完成：文档 ${published.knowledgeDocumentId}，版本 v${published.knowledgeDocumentVersionNumber}，绑定 ${published.bindingCount} 项`,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.documents("book-analysis-source") });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novelsKnowledge.bindings(payload.novelId) });
      await refreshAnalysisData(payload.id);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "发布失败。";
      setLastPublishResult(null);
      setPublishFeedback(message);
    },
  });

  const createStyleProfileMutation = useMutation({
    mutationFn: (payload: { bookAnalysisId: string; name: string }) => createStyleProfileFromBookAnalysis({
      ...payload,
      provider: llmConfig.provider,
      model: llmConfig.model || undefined,
      temperature: llmConfig.temperature,
    }),
    onMutate: () => {
      setStyleProfileFeedback("正在根据拆书里的“文风与技法”生成写法资产，完成后会自动跳转到写法引擎。");
    },
    onSuccess: async (response) => {
      const createdProfile = response.data;
      if (!createdProfile) {
        return;
      }
      setStyleProfileFeedback("");
      toast.success("已从拆书生成写法，正在打开写法引擎。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.profiles });
      navigate(`/style-engine?profileId=${createdProfile.id}&source=book-analysis`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "从拆书生成写法失败。";
      setStyleProfileFeedback(message);
    },
  });

  useEffect(() => {
    setPublishFeedback("");
    setLastPublishResult(null);
    setStyleProfileFeedback("");
  }, [selectedAnalysisId]);

  const publishSelectedAnalysis = async () => {
    if (!selectedAnalysisId || !selectedNovelId) {
      return;
    }
    await publishMutation.mutateAsync({
      id: selectedAnalysisId,
      novelId: selectedNovelId,
    });
  };

  const createStyleProfileFromAnalysis = async () => {
    if (!selectedAnalysis) {
      return;
    }
    await createStyleProfileMutation.mutateAsync({
      bookAnalysisId: selectedAnalysis.id,
      name: `${selectedAnalysis.title}-写法资产`,
    });
  };

  return {
    publishFeedback,
    styleProfileFeedback,
    lastPublishResult,
    publishSelectedAnalysis,
    createStyleProfileFromAnalysis,
    pending: {
      publish: publishMutation.isPending,
      createStyleProfile: createStyleProfileMutation.isPending,
    },
  };
}
