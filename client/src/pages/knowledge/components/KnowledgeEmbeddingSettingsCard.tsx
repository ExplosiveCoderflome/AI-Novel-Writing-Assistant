import i18next from "i18next";
import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, Database, Search } from "lucide-react";
import type { EmbeddingProvider, RagEmbeddingModelStatus, RagProviderStatus } from "@/api/settings";
import SearchableSelect from "@/components/common/SearchableSelect";
import SelectField from "@/components/common/SelectField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  embeddingConcurrency: number;
  enabled: boolean;
  qdrantUrl: string;
  qdrantApiKey: string;
  qdrantApiKeyConfigured: boolean;
  clearQdrantApiKey: boolean;
  qdrantTimeoutMs: number;
  qdrantUpsertMaxBytes: number;
  qdrantUpsertConcurrency: number;
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
    <section className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/[0.07] text-primary">
            <Search className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.iqlms5")}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.oy2k88")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {currentProvider ? (
            <Badge variant="secondary" className="border-0 bg-muted/60 font-normal">{currentProvider.name}</Badge>
          ) : null}
          <Badge variant="secondary" className={`border-0 font-normal ${form.enabled ? "bg-success/10 text-success" : "bg-muted/60"}`}>
            {form.enabled ? "资料检索已开启" : "资料检索已暂停"}
          </Badge>
        </div>
      </header>

      <div className="space-y-5">
        <section className="space-y-5 rounded-3xl bg-muted/20 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-sm">
              <Search className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <div className="font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.wt34fc")}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.ifd88k")}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <SelectField
                label={i18next.t("knowledge.knowledgeEmbeddingSettingsCard.7ludp3")}
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
                  <Badge variant="secondary" className={`border-0 font-normal ${currentProvider.isConfigured ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                    {currentProvider.isConfigured ? "连接已配置" : "待配置连接"}
                  </Badge>
                  <Badge variant="secondary" className={`border-0 font-normal ${currentProvider.isActive ? "bg-success/10 text-success" : "bg-muted/60"}`}>
                    {currentProvider.isActive ? "可用" : "未启用"}
                  </Badge>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Embedding 模型</div>
              {modelQuery.isLoading ? (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.h5vu90")}</div>
              ) : modelOptions.length > 0 ? (
                <SearchableSelect
                  value={form.embeddingModel}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, embeddingModel: value }))}
                  options={modelOptions.map((model) => ({ value: model }))}
                  placeholder={i18next.t("knowledge.knowledgeEmbeddingSettingsCard.mnf6sz")}
                  searchPlaceholder="搜索 Embedding 模型"
                  emptyText="没有匹配的 Embedding 模型"
                />
              ) : null}
              <Input
                className={modelQuery.isLoading || modelOptions.length > 0 ? "hidden" : undefined}
                value={form.embeddingModel}
                onChange={(event) => setForm((prev) => ({ ...prev, embeddingModel: event.target.value }))}
                placeholder={i18next.t("knowledge.knowledgeEmbeddingSettingsCard.hurah2")}
              />
              {modelQuery.data ? (
                <div className="text-xs text-muted-foreground">
                  {modelQuery.data.source === "remote"
                    ? i18next.t("knowledge.knowledgeEmbeddingSettingsCard.nwa3n", { val1: modelQuery.data.models.length })
                    : "可先使用推荐模型；连接配置可用时，列表会展示服务商模型。"}
                </div>
              ) : null}
            </div>
          </div>

        </section>

        <section className="space-y-5 rounded-3xl border border-border/35 bg-card/70 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/[0.07] text-primary">
              <Database className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <div className="font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.7fcz1z")}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.dtong3")}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.5e79d0")}</div>
            <Input
              value={form.qdrantUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, qdrantUrl: event.target.value }))}
              placeholder="http://127.0.0.1:6333"
            />
            <div className="text-xs text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.qk35b4")}</div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.keoj1q")}</div>
                <Badge variant="secondary" className={`border-0 font-normal ${form.qdrantApiKeyConfigured ? "bg-success/10 text-success" : "bg-muted/60"}`}>
                  {form.qdrantApiKeyConfigured ? "Key 可用" : "未设置"}
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
                placeholder={form.qdrantApiKeyConfigured ? "留空则保留保存的 Key" : "请输入向量库 API Key"}
              />
            </div>

            <label className="flex items-center gap-2 rounded-2xl bg-muted/25 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={form.clearQdrantApiKey}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    clearQdrantApiKey: event.target.checked,
                    qdrantApiKey: event.target.checked ? "" : prev.qdrantApiKey,
                  }))}
              />{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.w9plqb")}</label>
          </div>
        </section>

        <details className="group rounded-3xl bg-muted/20 p-5 sm:p-6">
          <summary className="flex cursor-pointer list-none flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.k2cd00")}</div>
              <div className="text-xs text-muted-foreground">
                集合版本 v{form.collectionVersion} · 集合命名、索引重建、检索质量和后台任务参数
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="group-open:hidden">{i18next.t("dict.gen_e2edde5a")}</span>
              <span className="hidden group-open:inline">{i18next.t("dict.gen_def9e98b")}</span>
              <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
            </div>
          </summary>

          <div className="mt-5 space-y-6">
            <section className="space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.w7fqm7")}</div>
                <div className="text-xs text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.wq3lrr")}</div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  label={i18next.t("knowledge.knowledgeEmbeddingSettingsCard.4m7tt4")}
                  value={form.collectionMode}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      collectionMode: value as "auto" | "manual",
                    }))}
                  options={[
                    { value: "auto", label: i18next.t("knowledge.knowledgeEmbeddingSettingsCard.gqkcpb") },
                    { value: "manual", label: i18next.t("knowledge.knowledgeEmbeddingSettingsCard.cqwdtc") },
                  ]}
                />

                <div className="space-y-2">
                  <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.jdf8ih")}</div>
                  <Input
                    value={form.collectionTag}
                    onChange={(event) => setForm((prev) => ({ ...prev, collectionTag: event.target.value }))}
                    placeholder={i18next.t("knowledge.knowledgeEmbeddingSettingsCard.mdeimf")}
                  />
                  <div className="text-xs text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.j7n20p")}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {form.collectionMode === "auto" ? "自动生成集合名" : "向量库集合名"}
                </div>
                {form.collectionMode === "auto" ? (
                  <div className="rounded-md border border-dashed bg-muted/20 p-3 font-mono text-xs break-all">
                    {collectionNameToDisplay}
                  </div>
                ) : (
                  <Input
                    value={form.collectionName}
                    onChange={(event) => setForm((prev) => ({ ...prev, collectionName: event.target.value }))}
                    placeholder={i18next.t("knowledge.knowledgeEmbeddingSettingsCard.1hxcac")}
                  />
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  label={i18next.t("knowledge.knowledgeEmbeddingSettingsCard.9l114p")}
                  value={form.autoReindexOnChange ? "true" : "false"}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      autoReindexOnChange: value === "true",
                    }))}
                  options={[
                    { value: "true", label: i18next.t("dict.gen_cc42dd31") },
                    { value: "false", label: i18next.t("dict.gen_b15d9127") },
                  ]}
                />

                <div className="rounded-md border bg-background p-3">
                  <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.ffz5p7")}</div>
                  <div className="mt-2 font-mono text-xs break-all">{collectionNameToDisplay}</div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.2og7jz")}</div>
                <div className="text-xs text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.xn28by")}</div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <SelectField
                  label={i18next.t("knowledge.knowledgeEmbeddingSettingsCard.v5udvx")}
                  value={form.enabled ? "true" : "false"}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      enabled: value === "true",
                    }))}
                  options={[
                    { value: "true", label: i18next.t("dict.gen_7854b52a") },
                    { value: "false", label: i18next.t("knowledge.knowledgeEmbeddingSettingsCard.hvkq") },
                  ]}
                />

                <div className="space-y-2">
                  <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.mhto0w")}</div>
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
                  <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.82tw4m")}</div>
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

                <div className="space-y-2">
                  <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.t8m4s")}</div>
                  <Input
                    type="number"
                    min={1}
                    max={16}
                    value={form.qdrantUpsertConcurrency}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        qdrantUpsertConcurrency: parseNumberInput(event.target.value, prev.qdrantUpsertConcurrency),
                      }))}
                  />
                  <div className="text-xs text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.tgpzzi")}</div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.dqmqtz")}</div>
                <div className="text-xs text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.or2vv0")}</div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.apol4o")}</div>
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
                  <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.apy6eb")}</div>
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
                  <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.xptkg8")}</div>
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
                  <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.7pydz2")}</div>
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
                  <div className="text-sm font-medium">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.w4jxu6")}</div>
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
                <div className="text-xs text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.jllkh5")}</div>
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
                  <div className="text-sm font-medium">Embedding 并发数</div>
                  <Input
                    type="number"
                    min={1}
                    max={16}
                    value={form.embeddingConcurrency}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        embeddingConcurrency: parseNumberInput(event.target.value, prev.embeddingConcurrency),
                      }))}
                  />
                  <div className="text-xs text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.8ggs9r")}</div>
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
          </div>
        </details>

        <div className="flex flex-col gap-3 border-t border-border/30 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">{i18next.t("knowledge.knowledgeEmbeddingSettingsCard.cvgky3")}</p>
          <Button
            className="w-full rounded-full sm:w-auto"
            onClick={onSave}
            disabled={
              isSaving
              || modelQuery.isLoading
              || !form.embeddingModel.trim()
              || !collectionNameToDisplay.trim()
              || !form.qdrantUrl.trim()
            }
          >
            {isSaving ? "保存中..." : "保存检索设置"}
          </Button>
        </div>
      </div>
    </section>
  );
}
