import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import LLMSelector from "@/components/common/LLMSelector";
import KnowledgeDocumentPicker from "@/components/knowledge/KnowledgeDocumentPicker";
import { TEXT_FILE_MAX_SIZE, isTxtFile, readTextFile } from "@/lib/textFile";
import {
  analyzeWorldInspiration,
  createWorld,
  getWorldTemplates,
  suggestWorldAxioms,
  updateWorldAxioms,
} from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { useLLMStore } from "@/store/llmStore";

const DEFAULT_DIMENSIONS: Record<string, boolean> = {
  foundation: true,
  power: true,
  society: true,
  culture: true,
  history: true,
  conflict: true,
};

const DIMENSION_LABELS: Record<string, string> = {
  foundation: "基础层",
  power: "力量层",
  society: "社会层",
  culture: "文化层",
  history: "历史层",
  conflict: "冲突层",
};
function getDimensionLabel(key: string): string {
  return DIMENSION_LABELS[key] ?? key;
}

function normalizeAxiomTexts(items: unknown): string[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
    .filter(Boolean);
}

function scoreDecodedTxt(text: string): number {
  if (!text.trim()) {
    return Number.NEGATIVE_INFINITY;
  }
  const nonWhitespace = text.match(/\S/g)?.length ?? 0;
  const cjkChars = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const replacementChars = text.match(/\uFFFD/g)?.length ?? 0;
  const controlChars = text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)?.length ?? 0;
  const mojibakeChars = text.match(/[ÃÂ¤¦§¨±¿½]/g)?.length ?? 0;
  return nonWhitespace + cjkChars * 2 - replacementChars * 12 - controlChars * 6 - mojibakeChars * 2;
}

async function readReferenceTxt(file: File): Promise<string> {
  return readTextFile(file);
}

export default function WorldGenerator() {
  const llm = useLLMStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [worldName, setWorldName] = useState("");
  const [inspirationMode, setInspirationMode] = useState<"free" | "reference" | "random">("free");
  const [inspirationText, setInspirationText] = useState("");
  const [referenceTxtName, setReferenceTxtName] = useState("");
  const [referenceTxtSize, setReferenceTxtSize] = useState(0);
  const [referenceTxtError, setReferenceTxtError] = useState("");
  const [isReadingReferenceTxt, setIsReadingReferenceTxt] = useState(false);
  const [selectedKnowledgeDocumentIds, setSelectedKnowledgeDocumentIds] = useState<string[]>([]);
  const [concept, setConcept] = useState<{
    worldType: string;
    templateKey: string;
    coreImagery: string[];
    tone: string;
    keywords: string[];
    summary: string;
  } | null>(null);
  const [inspirationSourceMeta, setInspirationSourceMeta] = useState<{
    extracted: boolean;
    originalLength: number;
    chunkCount: number;
  } | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("custom");
  const [selectedDimensions, setSelectedDimensions] = useState<Record<string, boolean>>(DEFAULT_DIMENSIONS);
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [worldId, setWorldId] = useState("");
  const [axioms, setAxioms] = useState<string[]>([]);

  const templateQuery = useQuery({
    queryKey: queryKeys.worlds.templates,
    queryFn: getWorldTemplates,
  });

  const templates = templateQuery.data?.data ?? [];
  const selectedTemplate = useMemo(
    () => templates.find((item) => item.key === selectedTemplateKey) ?? templates[0],
    [selectedTemplateKey, templates],
  );

  const analyzeMutation = useMutation({
    mutationFn: () =>
        analyzeWorldInspiration({
          input: inspirationText,
          mode: inspirationMode,
          knowledgeDocumentIds: selectedKnowledgeDocumentIds,
          provider: llm.provider,
          model: llm.model,
        }),
    onSuccess: (response) => {
      const card = response.data?.conceptCard;
      if (!card) {
        return;
      }
      setConcept(card);
      setInspirationSourceMeta(response.data?.sourceMeta ?? null);
      setSelectedTemplateKey(card.templateKey || "custom");
      setStep(2);
    },
  });

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      const createResp = await createWorld({
        name: worldName.trim() || "未命名世界",
        description: concept?.summary ?? inspirationText,
        worldType: concept?.worldType ?? selectedTemplate?.worldType ?? "custom",
        templateKey: selectedTemplate?.key ?? "custom",
        selectedDimensions: JSON.stringify(selectedDimensions),
        selectedElements: JSON.stringify(selectedElements),
        knowledgeDocumentIds: selectedKnowledgeDocumentIds,
      });
      const createdId = createResp.data?.id;
      if (!createdId) {
        throw new Error("创建世界草稿失败。");
      }
      const axiomResp = await suggestWorldAxioms(createdId, {
        provider: llm.provider,
        model: llm.model,
      });
      return {
        worldId: createdId,
        axioms: axiomResp.data ?? [],
      };
    },
    onSuccess: async (payload) => {
      setWorldId(payload.worldId);
      setAxioms(normalizeAxiomTexts(payload.axioms));
      setStep(3);
      await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.all });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!worldId) {
        throw new Error("世界草稿不存在。");
      }
      return updateWorldAxioms(worldId, axioms.filter((item) => item.trim()));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.detail(worldId) });
      void navigate(`/worlds/${worldId}/workspace`);
    },
  });

  const handleReferenceTxtUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setReferenceTxtError("");
    setInspirationSourceMeta(null);
    setReferenceTxtName("");
    setReferenceTxtSize(0);
    if (!isTxtFile(file)) {
      setReferenceTxtError("仅支持 .txt 文本文件。");
      return;
    }
    if (file.size > TEXT_FILE_MAX_SIZE) {
      setReferenceTxtError("文件过大，请上传 2MB 以内的 txt 文件。");
      return;
    }

    try {
      setIsReadingReferenceTxt(true);
      const content = await readReferenceTxt(file);
      if (!content) {
        setReferenceTxtError("文件内容为空或编码不受支持，请尝试另存为 UTF-8 后重试。");
        return;
      }
      setInspirationText(content);
      setReferenceTxtName(file.name);
      setReferenceTxtSize(file.size);
    } catch {
      setReferenceTxtError("读取文件失败，请重试。");
    } finally {
      setIsReadingReferenceTxt(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>世界观向导（阶段 1-3）</CardTitle>
          <LLMSelector />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button variant={step === 1 ? "default" : "secondary"} onClick={() => setStep(1)}>
              1. 灵感捕获
            </Button>
            <Button variant={step === 2 ? "default" : "secondary"} onClick={() => setStep(2)} disabled={!concept}>
              2. 模板与维度
            </Button>
            <Button variant={step === 3 ? "default" : "secondary"} onClick={() => setStep(3)} disabled={!worldId}>
              3. 核心公理
            </Button>
          </div>

          {step === 1 ? (
            <div className="space-y-3">
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder="世界名称（可选）"
                value={worldName}
                onChange={(event) => setWorldName(event.target.value)}
              />
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={inspirationMode}
                onChange={(event) => {
                  const mode = event.target.value as "free" | "reference" | "random";
                  setInspirationMode(mode);
                  setInspirationSourceMeta(null);
                  if (mode !== "reference") {
                    setReferenceTxtError("");
                  }
                }}
              >
                <option value="free">自由输入</option>
                <option value="reference">参考作品</option>
                <option value="random">随机灵感</option>
              </select>
              {inspirationMode === "reference" ? (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm font-medium">上传参考作品（txt）</div>
                  <input
                    type="file"
                    accept=".txt,text/plain"
                    className="w-full rounded-md border bg-background p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm"
                    onChange={(event) => {
                      void handleReferenceTxtUpload(event);
                    }}
                  />
                  <div className="text-xs text-muted-foreground">
                    仅支持 .txt，最大 2MB。上传后将自动填入下方文本框。
                  </div>
                  {referenceTxtName ? (
                    <div className="text-xs text-muted-foreground">
                      已载入：{referenceTxtName}（{Math.max(1, Math.round(referenceTxtSize / 1024))} KB）
                    </div>
                  ) : null}
                  {referenceTxtError ? (
                    <div className="text-xs text-destructive">{referenceTxtError}</div>
                  ) : null}
                </div>
              ) : null}
              <KnowledgeDocumentPicker
                selectedIds={selectedKnowledgeDocumentIds}
                onChange={(next) => setSelectedKnowledgeDocumentIds(next ?? [])}
                title="知识库文档"
                description="可直接从知识库选择参考文档。创建世界后会自动写入世界绑定。"
                queryStatus="enabled"
              />
              <textarea
                className="min-h-[180px] w-full rounded-md border p-2 text-sm"
                placeholder={inspirationMode === "reference" ? "粘贴参考作品片段，或上传 txt 自动填充" : "描述你的世界灵感"}
                value={inspirationText}
                onChange={(event) => {
                  setInspirationText(event.target.value);
                  setInspirationSourceMeta(null);
                }}
              />
              <Button
                onClick={() => analyzeMutation.mutate()}
                disabled={
                  analyzeMutation.isPending
                  || isReadingReferenceTxt
                  || (inspirationMode !== "random" && !inspirationText.trim())
                }
              >
                {analyzeMutation.isPending ? "分析中..." : "生成概念卡片"}
              </Button>
              {inspirationSourceMeta?.extracted ? (
                <div className="text-xs text-muted-foreground">
                  已自动分段提取：原文 {inspirationSourceMeta.originalLength} 字符，切分 {inspirationSourceMeta.chunkCount} 段。
                </div>
              ) : null}
              {concept ? (
                <div className="rounded-md border p-3 text-sm">
                  <div className="font-medium">概念卡片</div>
                  <div>类型：{concept.worldType}</div>
                  <div>基调：{concept.tone}</div>
                  <div>关键词：{concept.keywords.join(" / ") || "-"}</div>
                  <div className="mt-2 whitespace-pre-wrap">{concept.summary}</div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={selectedTemplateKey}
                onChange={(event) => {
                  setSelectedTemplateKey(event.target.value);
                  setSelectedElements([]);
                }}
              >
                {templates.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.name}
                  </option>
                ))}
              </select>
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium mb-1">{selectedTemplate?.description ?? "-"}</div>
                <div className="text-xs text-muted-foreground mb-2">
                  坑点提醒：{selectedTemplate?.pitfalls.join(" | ") || "-"}
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {Object.keys(selectedDimensions).map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedDimensions[key])}
                        onChange={(event) =>
                          setSelectedDimensions((prev) => ({ ...prev, [key]: event.target.checked }))
                        }
                      />
                      {getDimensionLabel(key)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium mb-2">经典元素</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {(selectedTemplate?.classicElements ?? []).map((element) => (
                    <label key={element} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedElements.includes(element)}
                        onChange={(event) =>
                          setSelectedElements((prev) =>
                            event.target.checked
                              ? [...prev, element]
                              : prev.filter((item) => item !== element),
                          )
                        }
                      />
                      {element}
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={() => createDraftMutation.mutate()} disabled={createDraftMutation.isPending}>
                {createDraftMutation.isPending ? "创建中..." : "创建草稿并生成公理建议"}
              </Button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              {axioms.map((axiom, index) => (
                <Input
                  key={`${index}-${axiom}`}
                  value={axiom}
                  onChange={(event) =>
                    setAxioms((prev) => prev.map((item, idx) => (idx === index ? event.target.value : item)))
                  }
                />
              ))}
              <Button
                variant="secondary"
                onClick={() => setAxioms((prev) => [...prev, ""])}
              >
                新增公理
              </Button>
              <Button onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending}>
                {finalizeMutation.isPending ? "保存中..." : "进入世界工作台"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
