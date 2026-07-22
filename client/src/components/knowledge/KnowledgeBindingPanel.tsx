import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
      <div className="text-sm font-medium">{t("gen.components.knowledge.KnowledgeBindingPanel.titleFallback")}</div>
      <KnowledgeDocumentPicker
        selectedIds={selectedIds}
        onChange={(next) => setSelectedIds(next ?? [])}
        queryStatus={undefined}
        description={t("gen.components.knowledge.KnowledgeBindingPanel.gen_e7141af4")}
      />
      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? t("gen.components.knowledge.KnowledgeBindingPanel.savingInProgressDotDotDot") : t("gen.components.knowledge.KnowledgeBindingPanel.saveBinding")}
      </Button>
    </div>
  );
}
