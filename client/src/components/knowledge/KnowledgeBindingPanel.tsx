import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/api/queryKeys";
import {
  getNovelKnowledgeDocuments,
  getWorldKnowledgeDocuments,
  updateNovelKnowledgeDocuments,
  updateWorldKnowledgeDocuments,
} from "@/api/knowledge";
import KnowledgeDocumentPicker from "./KnowledgeDocumentPicker";

interface KnowledgeBindingPanelProps {
  targetType: "novel" | "world";
  targetId: string;
  title?: string;
}

export default function KnowledgeBindingPanel(props: KnowledgeBindingPanelProps) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const bindingsQuery = useQuery({
    queryKey: props.targetType === "novel"
      ? queryKeys.novelsKnowledge.bindings(props.targetId)
      : queryKeys.worlds.knowledgeDocuments(props.targetId),
    queryFn: () => (
      props.targetType === "novel"
        ? getNovelKnowledgeDocuments(props.targetId)
        : getWorldKnowledgeDocuments(props.targetId)
    ),
    enabled: Boolean(props.targetId),
  });

  useEffect(() => {
    setSelectedIds((bindingsQuery.data?.data ?? []).map((item) => item.id));
  }, [bindingsQuery.data?.data]);

  const saveMutation = useMutation({
    mutationFn: () => (
      props.targetType === "novel"
        ? updateNovelKnowledgeDocuments(props.targetId, selectedIds)
        : updateWorldKnowledgeDocuments(props.targetId, selectedIds)
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: props.targetType === "novel"
          ? queryKeys.novelsKnowledge.bindings(props.targetId)
          : queryKeys.worlds.knowledgeDocuments(props.targetId),
      });
    },
  });

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="text-sm font-medium">{props.title ?? "参考知识"}</div>
      <KnowledgeDocumentPicker
        selectedIds={selectedIds}
        onChange={(next) => setSelectedIds(next ?? [])}
        queryStatus={undefined}
        description="绑定后会成为该实体的默认知识文档来源。"
      />
      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "保存中..." : "保存绑定"}
      </Button>
    </div>
  );
}
