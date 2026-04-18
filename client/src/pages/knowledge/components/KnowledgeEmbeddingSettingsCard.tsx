import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EmbeddingProvider, RagEmbeddingModelStatus, RagProviderStatus } from "@/api/settings";
import SearchableSelect from "@/components/common/SearchableSelect";
import SelectField from "@/components/common/SelectField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface KnowledgeEmbeddingSettingsFormState {
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
  collectionVersion: number;
  collectionMode: "auto" | "manual";
  collectionName: string;
  collectionTag: string;
  autoReindexOnChange: boolean;
  embeddingBatchSize: number;
  embeddingTimeoutMs: number;
  embeddingMaxRetries: number;
  embeddingRetryBaseMs: number;
  enabled: boolean;
  qdrantUrl: string;
  qdrantApiKey: string;
  qdrantApiKeyConfigured: boolean;
  clearQdrantApiKey: boolean;
  qdrantTimeoutMs: number;
  qdrantUpsertMaxBytes: number;
  chunkSize: number;
  chunkOverlap: number;
  vectorCandidates: number;
  keywordCandidates: number;
  finalTopK: number;
  workerPollMs: number;
  workerMaxAttempts: number;
  workerRetryBaseMs: number;
  httpTimeoutMs: number;
}

interface KnowledgeEmbeddingSettingsCardProps {
  form: KnowledgeEmbeddingSettingsFormState;
  setForm: Dispatch<SetStateAction<KnowledgeEmbeddingSettingsFormState>>;
  providers: RagProviderStatus[];
  modelOptions: string[];
  modelQuery: {
    isLoading: boolean;
    data?: RagEmbeddingModelStatus;
  };
  isSaving: boolean;
  onSave: () => void;
}

function slugifySegment(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function buildSuggestedCollectionName(form: KnowledgeEmbeddingSettingsFormState): string {
  const parts = [
    "ai",
    "novel",
    "rag",
    form.embeddingProvider,
    slugifySegment(form.embeddingModel, "embedding"),
    slugifySegment(form.collectionTag, "kb"),
    `v${form.collectionVersion}`,
  ];
  return parts.join("_").slice(0, 120);
}

function parseNumberInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function KnowledgeEmbeddingSettingsCard({
  form,
  setForm,
  providers,
  modelOptions,
  modelQuery,
  isSaving,
  onSave,
}: KnowledgeEmbeddingSettingsCardProps) {
  const suggestedCollectionName = useMemo(() => buildSuggestedCollectionName(form), [form]);
  const currentProvider = providers.find((item) => item.provider === form.embeddingProvider);
  const collectionNameToDisplay = form.collectionMode === "auto"
    ? suggestedCollectionName
    : form.collectionName.trim();

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>知识检索设置</CardTitle>
          <Badge variant="outline">集合版本 v{form.collectionVersion}</Badge>
          {currentProvider ? <Badge variant="outline">{currentProvider.name}</Badge> : null}
          <Badge variant={form.enabled ? "default" : "outline"}>
            {form.enabled ? "RAG 已启用" : "RAG 已暂停"}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground">
          在这里配置 Embedding 模型、Qdrant 连接和检索行为。桌面版会把这些配置保存为运行时设置，
          最终用户不需要再手动编辑 `.env`。
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">向量模型</div>
            <div className="text-xs text-muted-foreground">
              选择用于生成向量的服务商和模型。
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <SelectField
                label="Embedding 服务商"
                value={form.embeddingProvider}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    embeddingProvider: value as EmbeddingProvider,
                    embeddingModel: "",
                  }))}
                options={providers.map((item) => ({
                  value: item.provider,
                  label: item.name,
                }))}
              />
              {currentProvider ? (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant={currentProvider.isConfigured ? "default" : "outline"}>
                    {currentProvider.isConfigured ? "API Key 已配置" : "API Key 未配置"}
                  </Badge>
                  <Badge variant={currentProvider.isActive ? "default" : "outline"}>
                    {currentProvider.isActive ? "已启用" : "未启用"}
                  </Badge>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Embedding 模型</div>
              {modelQuery.isLoading ? (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  正在加载可用的 Embedding 模型...
                </div>
              ) : modelOptions.length > 0 ? (
                <SearchableSelect
                  value={form.embeddingModel}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, embeddingModel: value }))}
                  options={modelOptions.map((model) => ({ value: model }))}
                  placeholder="选择 Embedding 模型"
                  searchPlaceholder="搜索 Embedding 模型"
                  emptyText="没有匹配的 Embedding 模型"
                />
              ) : null}
              <Input
                className={modelQuery.isLoading || modelOptions.length > 0 ? "hidden" : undefined}
                value={form.embeddingModel}
                onChange={(event) => setForm((prev) => ({ ...prev, embeddingModel: event.target.value }))}
                placeholder="例如：text-embedding-3-small"
              />
              {modelQuery.data ? (
                <div className="text-xs text-muted-foreground">
                  {modelQuery.data.source === "remote"
                    ? `已从服务商加载 ${modelQuery.data.models.length} 个模型。`
                    : "当前显示的是内置兜底模型，待服务商配置可用后会自动切换。"}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="集合命名方式"
              description="自动模式会根据服务商、模型、标签和版本生成集合名，避免不同向量维度之间互相冲突。"
              value={form.collectionMode}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  collectionMode: value as "auto" | "manual",
                }))}
              options={[
                { value: "auto", label: "自动生成" },
                { value: "manual", label: "手动指定" },
              ]}
            />

            <div className="space-y-2">
              <div className="text-sm font-medium">集合标签</div>
              <Input
                value={form.collectionTag}
                onChange={(event) => setForm((prev) => ({ ...prev, collectionTag: event.target.value }))}
                placeholder="例如：kb / prod / novel"
              />
              <div className="text-xs text-muted-foreground">
                用一个简短标签区分环境或不同数据分组。
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">
              {form.collectionMode === "auto" ? "自动生成后的集合名" : "Qdrant 集合名"}
            </div>
            {form.collectionMode === "auto" ? (
              <div className="rounded-md border border-dashed bg-muted/20 p-3 font-mono text-xs break-all">
                {collectionNameToDisplay}
              </div>
            ) : (
              <Input
                value={form.collectionName}
                onChange={(event) => setForm((prev) => ({ ...prev, collectionName: event.target.value }))}
                placeholder="例如：ai_novel_rag_openai_text_embedding_3_small_kb_v1"
              />
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Embedding 变更后自动重建索引"
              value={form.autoReindexOnChange ? "true" : "false"}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  autoReindexOnChange: value === "true",
                }))}
              options={[
                { value: "true", label: "开启" },
                { value: "false", label: "关闭" },
              ]}
            />

            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-sm font-medium">当前目标集合</div>
              <div className="mt-2 font-mono text-xs break-all">{collectionNameToDisplay}</div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">Qdrant 连接</div>
            <div className="text-xs text-muted-foreground">
              这些设置决定向量存储位置，以及检索功能是否启用。
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="RAG 状态"
              value={form.enabled ? "true" : "false"}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  enabled: value === "true",
                }))}
              options={[
                { value: "true", label: "启用" },
                { value: "false", label: "暂停" },
              ]}
            />

            <div className="space-y-2">
              <div className="text-sm font-medium">Qdrant URL</div>
              <Input
                value={form.qdrantUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, qdrantUrl: event.target.value }))}
                placeholder="http://127.0.0.1:6333"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Qdrant API Key</div>
                <Badge variant={form.qdrantApiKeyConfigured ? "default" : "outline"}>
                  {form.qdrantApiKeyConfigured ? "已保存" : "未设置"}
                </Badge>
              </div>
              <Input
                type="password"
                value={form.qdrantApiKey}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    qdrantApiKey: event.target.value,
                    clearQdrantApiKey: false,
                  }))}
                placeholder={form.qdrantApiKeyConfigured ? "留空则保留当前已保存的 Key" : "请输入 Qdrant API Key"}
              />
            </div>

            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.clearQdrantApiKey}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    clearQdrantApiKey: event.target.checked,
                    qdrantApiKey: event.target.checked ? "" : prev.qdrantApiKey,
                  }))}
              />
              保存时清除已保存的 Qdrant API Key
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Qdrant 超时（毫秒）</div>
              <Input
                type="number"
                min={1000}
                max={300000}
                value={form.qdrantTimeoutMs}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    qdrantTimeoutMs: parseNumberInput(event.target.value, prev.qdrantTimeoutMs),
                  }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Qdrant 单次 Upsert 最大字节数</div>
              <Input
                type="number"
                min={1024 * 1024}
                max={64 * 1024 * 1024}
                value={form.qdrantUpsertMaxBytes}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    qdrantUpsertMaxBytes: parseNumberInput(event.target.value, prev.qdrantUpsertMaxBytes),
                  }))}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">检索调优</div>
            <div className="text-xs text-muted-foreground">
              当你需要更好的召回质量，或者想调整检索延迟时，可以在这里修改切块和候选数量。
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">切块大小</div>
              <Input
                type="number"
                min={200}
                max={4000}
                value={form.chunkSize}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    chunkSize: parseNumberInput(event.target.value, prev.chunkSize),
                  }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">切块重叠</div>
              <Input
                type="number"
                min={0}
                max={1000}
                value={form.chunkOverlap}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    chunkOverlap: parseNumberInput(event.target.value, prev.chunkOverlap),
                  }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">最终 Top K</div>
              <Input
                type="number"
                min={1}
                max={50}
                value={form.finalTopK}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    finalTopK: parseNumberInput(event.target.value, prev.finalTopK),
                  }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">向量候选数</div>
              <Input
                type="number"
                min={1}
                max={200}
                value={form.vectorCandidates}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    vectorCandidates: parseNumberInput(event.target.value, prev.vectorCandidates),
                  }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">关键词候选数</div>
              <Input
                type="number"
                min={1}
                max={200}
                value={form.keywordCandidates}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    keywordCandidates: parseNumberInput(event.target.value, prev.keywordCandidates),
                  }))}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">Embedding 请求行为</div>
            <div className="text-xs text-muted-foreground">
              当批量导入较大，或服务商响应较慢时，可以在这里调节批大小、超时、重试和轮询参数。
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Embedding 批大小</div>
              <Input
                type="number"
                min={1}
                max={256}
                value={form.embeddingBatchSize}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    embeddingBatchSize: parseNumberInput(event.target.value, prev.embeddingBatchSize),
                  }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Embedding 超时（毫秒）</div>
              <Input
                type="number"
                min={5000}
                max={300000}
                value={form.embeddingTimeoutMs}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    embeddingTimeoutMs: parseNumberInput(event.target.value, prev.embeddingTimeoutMs),
                  }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Embedding 最大重试次数</div>
              <Input
                type="number"
                min={0}
                max={8}
                value={form.embeddingMaxRetries}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    embeddingMaxRetries: parseNumberInput(event.target.value, prev.embeddingMaxRetries),
                  }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Embedding 重试基础间隔（毫秒）</div>
              <Input
                type="number"
                min={100}
                max={10000}
                value={form.embeddingRetryBaseMs}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    embeddingRetryBaseMs: parseNumberInput(event.target.value, prev.embeddingRetryBaseMs),
                  }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Worker 轮询间隔（毫秒）</div>
              <Input
                type="number"
                min={200}
                max={60000}
                value={form.workerPollMs}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    workerPollMs: parseNumberInput(event.target.value, prev.workerPollMs),
                  }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Worker 最大尝试次数</div>
              <Input
                type="number"
                min={1}
                max={20}
                value={form.workerMaxAttempts}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    workerMaxAttempts: parseNumberInput(event.target.value, prev.workerMaxAttempts),
                  }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Worker 重试基础间隔（毫秒）</div>
              <Input
                type="number"
                min={1000}
                max={300000}
                value={form.workerRetryBaseMs}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    workerRetryBaseMs: parseNumberInput(event.target.value, prev.workerRetryBaseMs),
                  }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">RAG HTTP 超时（毫秒）</div>
              <Input
                type="number"
                min={1000}
                max={300000}
                value={form.httpTimeoutMs}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    httpTimeoutMs: parseNumberInput(event.target.value, prev.httpTimeoutMs),
                  }))}
              />
            </div>
          </div>
        </section>

        <Button
          onClick={onSave}
          disabled={
            isSaving
            || modelQuery.isLoading
            || !form.embeddingModel.trim()
            || !collectionNameToDisplay.trim()
            || !form.qdrantUrl.trim()
          }
        >
          {isSaving ? "保存中..." : "保存知识检索设置"}
        </Button>
      </CardContent>
    </Card>
  );
}
