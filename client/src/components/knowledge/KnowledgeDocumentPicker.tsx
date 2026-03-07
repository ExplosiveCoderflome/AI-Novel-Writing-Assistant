import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { KnowledgeDocumentStatus } from "@ai-novel/shared/types/knowledge";
import { listKnowledgeDocuments } from "@/api/knowledge";
import { queryKeys } from "@/api/queryKeys";
import { Input } from "@/components/ui/input";

interface KnowledgeDocumentPickerProps {
  selectedIds: string[] | null;
  onChange: (next: string[] | null) => void;
  title?: string;
  description?: string;
  allowAuto?: boolean;
  queryStatus?: KnowledgeDocumentStatus;
}

export default function KnowledgeDocumentPicker(props: KnowledgeDocumentPickerProps) {
  const [keyword, setKeyword] = useState("");

  const documentsQuery = useQuery({
    queryKey: queryKeys.knowledge.documents(props.queryStatus ?? "default"),
    queryFn: () => listKnowledgeDocuments(props.queryStatus ? { status: props.queryStatus } : undefined),
  });

  const visibleDocuments = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    const documents = documentsQuery.data?.data ?? [];
    if (!term) {
      return documents;
    }
    return documents.filter((item) =>
      item.title.toLowerCase().includes(term) || item.fileName.toLowerCase().includes(term));
  }, [documentsQuery.data?.data, keyword]);

  const selectedIds = props.selectedIds ?? [];
  const isAuto = props.allowAuto && props.selectedIds === null;

  return (
    <div className="space-y-3 rounded-md border p-3">
      {props.title ? <div className="text-sm font-medium">{props.title}</div> : null}
      {props.description ? <div className="text-xs text-muted-foreground">{props.description}</div> : null}

      {props.allowAuto ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-md border px-3 py-1 text-sm ${isAuto ? "bg-accent" : ""}`}
            onClick={() => props.onChange(null)}
          >
            自动
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-1 text-sm ${!isAuto ? "bg-accent" : ""}`}
            onClick={() => props.onChange(selectedIds)}
          >
            自定义
          </button>
        </div>
      ) : null}

      {isAuto ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          当前使用自动规则：若有实体绑定文档则优先使用绑定文档，否则回退到全部启用文档。
        </div>
      ) : (
        <>
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索知识文档"
          />
          <div className="max-h-64 space-y-2 overflow-auto rounded-md border p-2">
            {documentsQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">加载中...</div>
            ) : null}
            {visibleDocuments.length === 0 && !documentsQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">没有可选文档。</div>
            ) : null}
            {visibleDocuments.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <label key={item.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      if (props.selectedIds === null && props.allowAuto) {
                        props.onChange(event.target.checked ? [item.id] : []);
                        return;
                      }
                      const nextIds = event.target.checked
                        ? [...selectedIds, item.id]
                        : selectedIds.filter((id) => id !== item.id);
                      props.onChange(nextIds);
                    }}
                  />
                  <div className="min-w-0">
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.fileName} | v{item.activeVersionNumber} | {item.latestIndexStatus}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="text-xs text-muted-foreground">
            已选择 {selectedIds.length} 个文档。保持为空会显式关闭知识库检索。
          </div>
        </>
      )}
    </div>
  );
}
