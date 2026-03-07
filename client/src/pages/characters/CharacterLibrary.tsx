import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listBookAnalyses } from "@/api/bookAnalysis";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CharacterGenerateConstraints } from "@/api/character";
import { createBaseCharacter, generateBaseCharacter, getBaseCharacterList } from "@/api/character";
import { listKnowledgeDocuments } from "@/api/knowledge";
import { queryKeys } from "@/api/queryKeys";

function createDefaultConstraints(): CharacterGenerateConstraints {
  return {
    storyFunction: undefined,
    externalGoal: "",
    internalNeed: "",
    coreFear: "",
    moralBottomLine: "",
    secret: "",
    coreFlaw: "",
    relationshipHooks: "",
    growthStage: undefined,
    toneStyle: "",
  };
}

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
  const [constraints, setConstraints] = useState<CharacterGenerateConstraints>(createDefaultConstraints());
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
        category: constraints.storyFunction ?? form.category,
        knowledgeDocumentIds: selectedKnowledgeDocumentIds.length > 0 ? selectedKnowledgeDocumentIds : undefined,
        bookAnalysisIds: selectedBookAnalysisIds.length > 0 ? selectedBookAnalysisIds : undefined,
        constraints: Object.values(constraints).some(Boolean) ? constraints : undefined,
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
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">高级设定（可选）</div>
              <Button size="sm" variant="outline" onClick={() => setConstraints(createDefaultConstraints())}>
                一键清空高级设定
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">角色功能位</div>
                <select
                  className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  value={constraints.storyFunction ?? ""}
                  onChange={(event) =>
                    setConstraints((prev) => ({
                      ...prev,
                      storyFunction: (event.target.value || undefined) as CharacterGenerateConstraints["storyFunction"],
                    }))
                  }
                >
                  <option value="">不指定</option>
                  <option value="主角">主角</option>
                  <option value="反派">反派</option>
                  <option value="导师">导师</option>
                  <option value="对照组">对照组</option>
                  <option value="配角">配角</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">成长阶段</div>
                <select
                  className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  value={constraints.growthStage ?? ""}
                  onChange={(event) =>
                    setConstraints((prev) => ({
                      ...prev,
                      growthStage: (event.target.value || undefined) as CharacterGenerateConstraints["growthStage"],
                    }))
                  }
                >
                  <option value="">不指定</option>
                  <option value="起点">起点</option>
                  <option value="受挫">受挫</option>
                  <option value="转折">转折</option>
                  <option value="觉醒">觉醒</option>
                  <option value="收束">收束</option>
                </select>
              </label>
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="外显目标（想达成什么）"
                value={constraints.externalGoal ?? ""}
                onChange={(event) => setConstraints((prev) => ({ ...prev, externalGoal: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="内在需求（真正渴望）"
                value={constraints.internalNeed ?? ""}
                onChange={(event) => setConstraints((prev) => ({ ...prev, internalNeed: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="核心恐惧"
                value={constraints.coreFear ?? ""}
                onChange={(event) => setConstraints((prev) => ({ ...prev, coreFear: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="道德底线"
                value={constraints.moralBottomLine ?? ""}
                onChange={(event) => setConstraints((prev) => ({ ...prev, moralBottomLine: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="不能说的秘密"
                value={constraints.secret ?? ""}
                onChange={(event) => setConstraints((prev) => ({ ...prev, secret: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="核心缺陷"
                value={constraints.coreFlaw ?? ""}
                onChange={(event) => setConstraints((prev) => ({ ...prev, coreFlaw: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm md:col-span-2"
                placeholder="关系钩子（与他人的冲突/羁绊）"
                value={constraints.relationshipHooks ?? ""}
                onChange={(event) => setConstraints((prev) => ({ ...prev, relationshipHooks: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm md:col-span-2"
                placeholder="语气风格（如冷冽克制、幽默辛辣）"
                value={constraints.toneStyle ?? ""}
                onChange={(event) => setConstraints((prev) => ({ ...prev, toneStyle: event.target.value }))}
              />
            </div>
          </div>
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
