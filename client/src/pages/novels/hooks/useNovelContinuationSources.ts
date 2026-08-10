import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BookAnalysis } from "@ai-novel/shared/types/bookAnalysis";
import { listBookAnalyses } from "@/api/bookAnalysis";
import { getNovelList } from "@/api/novel";
import { getNovelKnowledgeDocuments, listKnowledgeDocuments } from "@/api/knowledge";

interface ContinuationSourceState {
  writingMode: "original" | "continuation";
  continuationSourceType: "novel" | "knowledge_document";
  sourceNovelId: string;
  sourceKnowledgeDocumentId: string;
}

export function useNovelContinuationSources(id: string, basicForm: ContinuationSourceState) {
  const sourceNovelListQuery = useQuery({
    queryKey: ["novels", "source-options", 200],
    queryFn: async () => {
      const firstPage = await getNovelList({ page: 1, limit: 100 });
      const firstItems = firstPage.data?.items ?? [];
      const totalPages = firstPage.data?.totalPages ?? 1;
      if (totalPages <= 1) {
        return firstItems;
      }
      const secondPage = await getNovelList({ page: 2, limit: 100 });
      return [...firstItems, ...(secondPage.data?.items ?? [])];
    },
  });

  const sourceKnowledgeListQuery = useQuery({
    queryKey: ["knowledge", "source-options"],
    queryFn: async () => {
      const response = await listKnowledgeDocuments({ status: "enabled" });
      return response.data ?? [];
    },
  });

  const sourceBookAnalysesQuery = useQuery({
    queryKey: [
      "book-analysis",
      "continuation-source-options",
      basicForm.continuationSourceType,
      basicForm.sourceNovelId,
      basicForm.sourceKnowledgeDocumentId,
    ],
    enabled: (
      basicForm.writingMode === "continuation"
      && (
        (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
        || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
      )
    ),
    queryFn: async () => {
      if (basicForm.continuationSourceType === "knowledge_document") {
        if (!basicForm.sourceKnowledgeDocumentId) {
          return [] as BookAnalysis[];
        }
        const response = await listBookAnalyses({
          documentId: basicForm.sourceKnowledgeDocumentId,
          status: "succeeded",
        });
        return (response.data ?? []).sort((a, b) => {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
      }

      if (!basicForm.sourceNovelId) {
        return [] as BookAnalysis[];
      }
      const bindingResponse = await getNovelKnowledgeDocuments(basicForm.sourceNovelId);
      const documentIds = Array.from(new Set(
        (bindingResponse.data ?? [])
          .map((item) => item.id)
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      ));
      if (documentIds.length === 0) {
        return [] as BookAnalysis[];
      }
      const responses = await Promise.all(
        documentIds.map((documentId) => listBookAnalyses({ documentId, status: "succeeded" })),
      );
      const merged = new Map<string, BookAnalysis>();
      for (const response of responses) {
        for (const item of response.data ?? []) {
          merged.set(item.id, item);
        }
      }
      return Array.from(merged.values()).sort((a, b) => {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    },
  });

  const sourceNovelOptions = useMemo(
    () => (sourceNovelListQuery.data ?? [])
      .filter((item) => item.id !== id)
      .map((item) => ({ id: item.id, title: item.title })),
    [id, sourceNovelListQuery.data],
  );

  const sourceKnowledgeOptions = useMemo(
    () => (sourceKnowledgeListQuery.data ?? [])
      .map((item) => ({ id: item.id, title: item.title })),
    [sourceKnowledgeListQuery.data],
  );

  const sourceNovelBookAnalysisOptions = useMemo(
    () => (sourceBookAnalysesQuery.data ?? [])
      .map((item) => ({
        id: item.id,
        title: item.title,
        documentTitle: item.documentTitle,
        documentVersionNumber: item.documentVersionNumber,
      })),
    [sourceBookAnalysesQuery.data],
  );

  return {
    sourceBookAnalysesQuery,
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
  };
}
