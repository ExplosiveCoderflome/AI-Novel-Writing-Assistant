import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { EmbeddingProvider, RagEmbeddingModelStatus, RagProviderStatus } from "@/api/settings";
import SearchableSelect from "@/components/common/SearchableSelect";

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
          <CardTitle>Embedding 配置</CardTitle>
          <Badge variant="outline">集合版本 v{form.collectionVersion}</Badge>
          {currentProvider ? <Badge variant="outline">{currentProvider.name}</Badge> : null}
          {modelQuery.data ? (
            <Badge variant="outline">
              {modelQuery.data.source === "remote" ? "供应商模型" : "内置模型"}
            </Badge>
          ) : null}
        </div>
        <div className="text-sm text-muted-foreground">
          切换 Provider 或 Model 时，系统可以自动生成新的 Qdrant 集合名，避免向量维度冲突；同时你也可以手动指定集合名与重建策略。
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">Embedding Provider</div>
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={form.embeddingProvider}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  embeddingProvider: event.target.value as EmbeddingProvider,
                  embeddingModel: "",
                }))}
            >
              {providers.map((item) => (
                <option key={item.provider} value={item.provider}>
                  {item.name}
                </option>
              ))}
            </select>
            {currentProvider ? (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant={currentProvider.isConfigured ? "default" : "outline"}>
                  {currentProvider.isConfigured ? "API Key 已配置" : "API Key 未配置"}
                </Badge>
                <Badge variant={currentProvider.isActive ? "default" : "outline"}>
                  {currentProvider.isActive ? "当前启用" : "未启用"}
                </Badge>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Embedding Model</div>
            {modelQuery.isLoading ? (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                正在获取该供应商的 Embedding 模型列表...
              </div>
            ) : modelOptions.length > 0 ? (
              <SearchableSelect
                value={form.embeddingModel}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, embeddingModel: value }))}
                options={modelOptions.map((model) => ({ value: model }))}
                placeholder="选择 Embedding 模型"
                searchPlaceholder="搜索 Embedding 模型"
                emptyText="没有匹配的 Embedding 模型"
              />
            ) : null}
            <Input
              className={modelQuery.isLoading || modelOptions.length > 0 ? "hidden" : undefined}
              value={form.embeddingModel}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, embeddingModel: event.target.value }))}
              placeholder="例如 text-embedding-3-small"
            />
            {modelQuery.data ? (
              <div className="text-xs text-muted-foreground">
                {modelQuery.data.source === "remote"
                  ? `已获取 ${modelQuery.data.models.length} 个该供应商的 Embedding 模型。`
                  : "当前展示的是内置 Embedding 模型列表；配置并启用 API Key 后会自动拉取供应商模型。"}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">集合命名模式</div>
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={form.collectionMode}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  collectionMode: event.target.value as "auto" | "manual",
                }))}
            >
              <option value="auto">自动生成</option>
              <option value="manual">手动指定</option>
            </select>
            <div className="text-xs text-muted-foreground">
              自动模式会基于 Provider、Model、集合标识和版本号生成新集合名；手动模式适合你自己维护固定集合。
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">集合标识</div>
            <Input
              value={form.collectionTag}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, collectionTag: event.target.value }))}
              placeholder="例如 kb / prod / novel"
            />
            <div className="text-xs text-muted-foreground">
              会参与自动集合名生成，建议用来区分环境、用途或数据分组。
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">
            {form.collectionMode === "auto" ? "自动生成的集合名" : "Qdrant 集合名"}
          </div>
          {form.collectionMode === "auto" ? (
            <div className="rounded-md border border-dashed bg-muted/20 p-3 font-mono text-xs break-all">
              {collectionNameToDisplay}
            </div>
          ) : (
            <Input
              value={form.collectionName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, collectionName: event.target.value }))}
              placeholder="例如 ai_novel_rag_openai_text_embedding_3_small_kb_v1"
            />
          )}
          <div className="text-xs text-muted-foreground">
            {form.collectionMode === "auto"
              ? "保存后会把当前 Embedding 配置绑定到这个集合名；如果模型维度发生变化，会自然切到新集合。"
              : "手动模式下请自行保证集合名与当前模型维度匹配。"}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">模型变更后自动重建索引</div>
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={form.autoReindexOnChange ? "true" : "false"}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  autoReindexOnChange: event.target.value === "true",
                }))}
            >
              <option value="true">开启</option>
              <option value="false">关闭</option>
            </select>
            <div className="text-xs text-muted-foreground">
              开启后，切换 Provider、Model 或集合名时会自动排队全量重建索引。
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-sm font-medium">当前将使用的集合</div>
            <div className="mt-2 font-mono text-xs break-all">{collectionNameToDisplay}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              建议把集合名做成“模型 + 业务标识 + 版本号”的形式，方便迁移和回滚。
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Embedding 请求参数</div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">批处理大小</div>
              <Input
                type="number"
                min={1}
                max={256}
                value={form.embeddingBatchSize}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    embeddingBatchSize: Number(event.target.value || prev.embeddingBatchSize),
                  }))}
              />
              <div className="text-xs text-muted-foreground">
                单次向量化请求包含的文本块数量；越大越快，但也更容易触发超时或限流。
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">请求超时（ms）</div>
              <Input
                type="number"
                min={5000}
                max={300000}
                value={form.embeddingTimeoutMs}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    embeddingTimeoutMs: Number(event.target.value || prev.embeddingTimeoutMs),
                  }))}
              />
              <div className="text-xs text-muted-foreground">
                Embedding 接口请求超时时间，网络慢或模型较大时可以适当调高。
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">最大重试次数</div>
              <Input
                type="number"
                min={0}
                max={8}
                value={form.embeddingMaxRetries}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    embeddingMaxRetries: Number(event.target.value || prev.embeddingMaxRetries),
                  }))}
              />
              <div className="text-xs text-muted-foreground">
                请求失败时允许的自动重试次数；设为 0 则只尝试一次。
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">重试基准间隔（ms）</div>
              <Input
                type="number"
                min={100}
                max={10000}
                value={form.embeddingRetryBaseMs}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    embeddingRetryBaseMs: Number(event.target.value || prev.embeddingRetryBaseMs),
                  }))}
              />
              <div className="text-xs text-muted-foreground">
                每次重试前的等待基准值，用来控制失败后的回退节奏。
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={onSave}
          disabled={isSaving || modelQuery.isLoading || !form.embeddingModel.trim() || !collectionNameToDisplay.trim()}
        >
          {isSaving ? "保存中..." : "保存 Embedding 配置"}
        </Button>
      </CardContent>
    </Card>
  );
}
