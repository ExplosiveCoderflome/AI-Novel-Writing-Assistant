import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listBookAnalyses } from "@/api/bookAnalysis";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createBaseCharacter, generateBaseCharacter, getBaseCharacterList } from "@/api/character";
import { listKnowledgeDocuments } from "@/api/knowledge";
import { queryKeys } from "@/api/queryKeys";

export default function CharacterLibrary() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    role: "主角",
    personality: "",
    background: "",
    development: "",
    category: "主角",
  });
  const [aiDescription, setAIDescription] = useState("");
  const [selectedKnowledgeDocumentIds, setSelectedKnowledgeDocumentIds] = useState<string[]>([]);
  const [selectedBookAnalysisIds, setSelectedBookAnalysisIds] = useState<string[]>([]);

  const characterListQuery = useQuery({
    queryKey: queryKeys.baseCharacters.all,
    queryFn: () => getBaseCharacterList(),
  });
  const knowledgeDocumentsQuery = useQuery({
    queryKey: queryKeys.knowledge.documents("character-generator"),
    queryFn: () => listKnowledgeDocuments({ status: "enabled" }),
  });
  const bookAnalysesQuery = useQuery({
    queryKey: queryKeys.bookAnalysis.list("character-generator-succeeded"),
    queryFn: () => listBookAnalyses({ status: "succeeded" }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createBaseCharacter({
        ...form,
        tags: "",
        appearance: "",
        weaknesses: "",
        interests: "",
        keyEvents: "",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.baseCharacters.all,
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      generateBaseCharacter({
        description: aiDescription,
        category: form.category,
        knowledgeDocumentIds: selectedKnowledgeDocumentIds.length > 0 ? selectedKnowledgeDocumentIds : undefined,
        bookAnalysisIds: selectedBookAnalysisIds.length > 0 ? selectedBookAnalysisIds : undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.baseCharacters.all,
      });
      setAIDescription("");
    },
  });

  const characters = characterListQuery.data?.data ?? [];
  const knowledgeDocuments = knowledgeDocumentsQuery.data?.data ?? [];
  const bookAnalyses = bookAnalysesQuery.data?.data ?? [];

  const toggleId = (ids: string[], id: string, checked: boolean) =>
    checked
      ? (ids.includes(id) ? ids : [...ids, id])
      : ids.filter((item) => item !== id);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>手动创建角色</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <input
            className="rounded-md border p-2 text-sm"
            placeholder="角色名"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <input
            className="rounded-md border p-2 text-sm"
            placeholder="角色定位（主角/反派/配角）"
            value={form.role}
            onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
          />
          <input
            className="rounded-md border p-2 text-sm"
            placeholder="性格特征"
            value={form.personality}
            onChange={(event) => setForm((prev) => ({ ...prev, personality: event.target.value }))}
          />
          <input
            className="rounded-md border p-2 text-sm"
            placeholder="背景故事"
            value={form.background}
            onChange={(event) => setForm((prev) => ({ ...prev, background: event.target.value }))}
          />
          <input
            className="rounded-md border p-2 text-sm md:col-span-2"
            placeholder="成长轨迹"
            value={form.development}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, development: event.target.value }))
            }
          />
          <Button
            className="md:col-span-2"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.name.trim()}
          >
            {createMutation.isPending ? "创建中..." : "创建角色"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI 生成角色</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="min-h-[120px] w-full rounded-md border p-2 text-sm"
            placeholder="输入角色描述，例如：冷静理智但背负家仇的年轻剑士"
            value={aiDescription}
            onChange={(event) => setAIDescription(event.target.value)}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">参考知识库（可多选）</div>
              <div className="max-h-48 space-y-2 overflow-auto rounded-md border p-2">
                {knowledgeDocumentsQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">加载中...</div>
                ) : null}
                {!knowledgeDocumentsQuery.isLoading && knowledgeDocuments.length === 0 ? (
                  <div className="text-sm text-muted-foreground">暂无可选知识文档。</div>
                ) : null}
                {knowledgeDocuments.map((document) => (
                  <label key={document.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedKnowledgeDocumentIds.includes(document.id)}
                      onChange={(event) =>
                        setSelectedKnowledgeDocumentIds((prev) => toggleId(prev, document.id, event.target.checked))
                      }
                    />
                    <div className="min-w-0">
                      <div className="font-medium">{document.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {document.fileName} | v{document.activeVersionNumber}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">未选择则不引用知识库内容。</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">参考拆书分析（可多选）</div>
              <div className="max-h-48 space-y-2 overflow-auto rounded-md border p-2">
                {bookAnalysesQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">加载中...</div>
                ) : null}
                {!bookAnalysesQuery.isLoading && bookAnalyses.length === 0 ? (
                  <div className="text-sm text-muted-foreground">暂无可选拆书分析。</div>
                ) : null}
                {bookAnalyses.map((analysis) => (
                  <label key={analysis.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedBookAnalysisIds.includes(analysis.id)}
                      onChange={(event) =>
                        setSelectedBookAnalysisIds((prev) => toggleId(prev, analysis.id, event.target.checked))
                      }
                    />
                    <div className="min-w-0">
                      <div className="font-medium">{analysis.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {analysis.documentTitle} | v{analysis.documentVersionNumber}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">仅展示已完成的拆书分析。</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            已选参考：知识库 {selectedKnowledgeDocumentIds.length} 项，拆书 {selectedBookAnalysisIds.length} 项。
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !aiDescription.trim()}
          >
            {generateMutation.isPending ? "生成中..." : "生成并入库"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>角色列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {characters.map((character) => (
            <div key={character.id} className="rounded-md border p-3">
              <div className="font-medium">{character.name}</div>
              <div className="text-sm text-muted-foreground">{character.role}</div>
              <div className="mt-1 text-sm">{character.personality}</div>
            </div>
          ))}
          {characters.length === 0 ? <div className="text-sm text-muted-foreground">暂无角色。</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
