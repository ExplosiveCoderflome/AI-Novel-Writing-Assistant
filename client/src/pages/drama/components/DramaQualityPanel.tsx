import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { AlertTriangle, CheckCircle2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import type { DramaEpisode, DramaProjectDetail } from "@/api/drama";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type QualityStatus = "approved" | "repairable" | "continue_with_warning" | "blocked";
type ComplianceLevel = "pass" | "warn" | "block";

interface QualityFlag {
  severity?: "low" | "medium" | "high" | "critical";
  code?: string;
  evidence?: string;
  suggestion?: string;
}

interface QualityResult {
  status?: QualityStatus;
  score?: Record<string, number>;
  flags?: QualityFlag[];
  compliance?: {
    level: ComplianceLevel;
    items: Array<{
      rule: string;
      excerpt: string;
      suggestion: string;
    }>;
  };
  repairPlan?: {
    mode?: "patch" | "regenerate";
    instruction?: string;
  };
}

interface EpisodeQualityItem {
  episode: DramaEpisode;
  quality: QualityResult | null;
}

function safeJson<T>(input: string | null | undefined, fallback: T): T {
  if (!input) {
    return fallback;
  }
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function statusLabel(status?: QualityStatus): string {
  const labels: Record<QualityStatus, string> = {
    approved: t("gen.pages.drama.components.DramaQualityPanel.gen_ecfa64c1"),
    repairable: t("gen.pages.drama.components.DramaQualityPanel.gen_c94222f6"),
    continue_with_warning: t("gen.pages.drama.components.DramaQualityPanel.gen_4281b2b4"),
    blocked: t("gen.pages.drama.components.DramaQualityPanel.gen_2d25e6f9"),
  };
  return status ? labels[status] : t("gen.pages.drama.components.DramaQualityPanel.gen_0b27f9ed");
}

function severityLabel(severity?: QualityFlag["severity"]): string {
  const labels: Record<NonNullable<QualityFlag["severity"]>, string> = {
    low: t("gen.pages.drama.components.DramaQualityPanel.gen_b3bd3d43"),
    medium: t("gen.pages.drama.components.DramaQualityPanel.mediumLevel"),
    high: t("gen.pages.drama.components.DramaQualityPanel.gen_fc7e3846"),
    critical: t("gen.pages.drama.components.DramaQualityPanel.critical"),
  };
  return severity ? labels[severity] : t("gen.pages.drama.components.DramaQualityPanel.gen_02d9819d");
}

function qualityVariant(status?: QualityStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved") return "default";
  if (status === "blocked") return "destructive";
  if (status === "repairable") return "secondary";
  return "outline";
}

function complianceLabel(level?: ComplianceLevel): string {
  const labels: Record<ComplianceLevel, string> = {
    pass: t("gen.pages.drama.components.DramaQualityPanel.gen_95af35ac"),
    warn: t("gen.pages.drama.components.DramaQualityPanel.gen_30f50518"),
    block: t("gen.pages.drama.components.DramaQualityPanel.gen_accf2138"),
  };
  return level ? labels[level] : t("gen.pages.drama.components.DramaQualityPanel.gen_80a28338");
}

function complianceVariant(level?: ComplianceLevel): "default" | "secondary" | "destructive" | "outline" {
  if (level === "pass") return "default";
  if (level === "block") return "destructive";
  if (level === "warn") return "secondary";
  return "outline";
}

function buildQualityItems(project: DramaProjectDetail): EpisodeQualityItem[] {
  return (project.episodes ?? []).map((episode) => ({
    episode,
    quality: episode.qualityFlags ? safeJson<QualityResult>(episode.qualityFlags, {}) : null,
  }));
}

function summarize(items: EpisodeQualityItem[]) {
  const checked = items.filter((item) => item.quality);
  const needsRepair = checked.filter((item) => item.quality?.status === "repairable" || item.episode.status === "needs_repair");
  const blocked = checked.filter((item) => item.quality?.status === "blocked");
  const warning = checked.filter((item) => item.quality?.status === "continue_with_warning");
  const approved = checked.filter((item) => item.quality?.status === "approved" || item.episode.status === "approved");
  const complianceRisk = checked.filter((item) => item.quality?.compliance?.level === "warn" || item.quality?.compliance?.level === "block");
  const scores = checked
    .map((item) => item.quality?.score?.overall)
    .filter((score): score is number => typeof score === "number");
  const average = scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  return { checked, needsRepair, blocked, warning, approved, complianceRisk, average };
}

export function DramaQualityPanel(props: {
  project: DramaProjectDetail;
  busy: boolean;
  onSelectEpisode: (order: number) => void;
  onOpenEpisodes: () => void;
  onReview: (order: number) => void;
  onComplianceAll: () => void;
  onRepair: (order: number) => void;
}) {
  const items = buildQualityItems(props.project);
  const summary = summarize(items);
  const problemItems = items.filter((item) =>
    item.quality?.status === "repairable"
    || item.quality?.status === "blocked"
    || item.quality?.status === "continue_with_warning"
    || item.quality?.compliance?.level === "warn"
    || item.quality?.compliance?.level === "block"
    || item.episode.status === "needs_repair"
  );
  const uncheckedItems = items.filter((item) => Boolean(item.episode.content?.trim()) && !item.quality);
  const scriptedCount = items.filter((item) => Boolean(item.episode.content?.trim())).length;

  const openEpisode = (order: number) => {
    props.onSelectEpisode(order);
    props.onOpenEpisodes();
  };

  if ((props.project.episodes?.length ?? 0) === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        还没有分集大纲。生成分集和台本后，这里会汇总每集质量检查结果。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{t("gen.pages.drama.components.DramaQualityPanel.gen_09ed848d")}</div>
          <div className="text-xs text-muted-foreground">{t("gen.pages.drama.components.DramaQualityPanel.gen_83450b9a")}</div>
        </div>
        <Button type="button" variant="outline" disabled={props.busy || scriptedCount === 0} onClick={props.onComplianceAll}>
          <ShieldCheck className="h-4 w-4" />
          检查全部台本合规
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">{t("gen.pages.drama.components.DramaQualityPanel.gen_2f9815ee")}</div>
          <div className="mt-1 text-lg font-semibold">{summary.checked.length}</div>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">{t("gen.pages.drama.components.DramaQualityPanel.gen_c94222f6")}</div>
          <div className="mt-1 text-lg font-semibold">{summary.needsRepair.length}</div>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">{t("gen.pages.drama.components.DramaQualityPanel.gen_4281b2b4")}</div>
          <div className="mt-1 text-lg font-semibold">{summary.warning.length}</div>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">{t("gen.pages.drama.components.DramaQualityPanel.gen_ecfa64c1")}</div>
          <div className="mt-1 text-lg font-semibold">{summary.approved.length}</div>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">{t("gen.pages.drama.components.DramaQualityPanel.gen_45d8d117")}</div>
          <div className="mt-1 text-lg font-semibold">{summary.complianceRisk.length}</div>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">{t("gen.pages.drama.components.DramaQualityPanel.gen_3569877e")}</div>
          <div className="mt-1 text-lg font-semibold">{t("gen.pages.drama.components.DramaQualityPanel.gen_summaryave_7a58")}</div>
        </div>
      </div>

      {problemItems.length === 0 && uncheckedItems.length === 0 ? (
        <Card className="rounded-lg">
          <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            当前没有待处理的质量问题。
          </CardContent>
        </Card>
      ) : null}

      {problemItems.length > 0 ? (
        <div className="space-y-3">
          {problemItems.map((item) => (
            <Card key={item.episode.id} className="rounded-lg">
              <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{t("gen.pages.drama.components.DramaQualityPanel.gen_5e9e7814")}</CardTitle>
                    <Badge variant={qualityVariant(item.quality?.status)}>{statusLabel(item.quality?.status)}</Badge>
                    {item.quality?.compliance ? (
                      <Badge variant={complianceVariant(item.quality.compliance.level)}>
                        {complianceLabel(item.quality.compliance.level)}
                      </Badge>
                    ) : null}
                    {item.quality?.score?.overall != null ? (
                      <Badge variant="outline">{t("gen.pages.drama.components.DramaQualityPanel.gen_b6d2bd0c")}</Badge>
                    ) : null}
                  </div>
                  <CardDescription>{t("gen.pages.drama.components.DramaQualityPanel.repairInstruction")}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => openEpisode(item.episode.order)}>
                    <Search className="h-4 w-4" />
                    查看台本
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={props.busy || !item.episode.content?.trim()}
                    onClick={() => props.onReview(item.episode.order)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    重新检查
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={props.busy || !item.episode.content?.trim()}
                    onClick={() => props.onRepair(item.episode.order)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    修复
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {item.quality?.flags?.length ? item.quality.flags.map((flag, index) => (
                  <div key={`${item.episode.id}-${flag.code ?? index}`} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={flag.severity === "critical" ? "destructive" : "outline"}>
                        {severityLabel(flag.severity)}
                      </Badge>
                      <span className="font-medium">{t("gen.pages.drama.components.DramaQualityPanel.qualityHint")}</span>
                    </div>
                    <p className="mt-2 text-muted-foreground">{flag.evidence}</p>
                    <p className="mt-1">{flag.suggestion}</p>
                  </div>
                )) : (
                  <div className="rounded-md border p-3 text-sm text-muted-foreground">
                    <AlertTriangle className="mr-2 inline h-4 w-4" />
                    这集需要处理，但没有结构化问题明细。
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {uncheckedItems.length > 0 ? (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">{t("gen.pages.drama.components.DramaQualityPanel.gen_f043ee3a")}</CardTitle>
            <CardDescription>{t("gen.pages.drama.components.DramaQualityPanel.gen_784f002a")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {uncheckedItems.map((item) => (
              <div key={item.episode.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <span>{t("gen.pages.drama.components.DramaQualityPanel.gen_5e9e7814")}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={props.busy}
                  onClick={() => props.onReview(item.episode.order)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  检查
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
