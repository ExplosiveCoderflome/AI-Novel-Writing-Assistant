import { useState } from "react";
import { ChevronDown, Edit3, FlaskConical, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LandingProfileItem } from "../writingFormulaLandingItems";

interface WritingFormulaLandingProps {
  onOpenCreate: () => void;
  onSelectProfile: (profileId: string) => void;
  onEditProfile: (profileId: string) => void;
  onOpenWorkbench: (profileId: string) => void;
  onUseProfileForClean: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  onOpenPromptLab: () => void;
  onRetry: () => void;
  loading: boolean;
  error?: string;
  deletePending: boolean;
  profileItems: LandingProfileItem[];
  selectedProfileId: string;
}

function DetailStatRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm leading-6">
      <dt className="shrink-0 text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0 break-words text-right">{props.value}</dd>
    </div>
  );
}

function RuleDisclosure(props: { title: string; summary: string }) {
  return (
    <details className="group py-3">
      <summary className="cursor-pointer list-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3 text-sm font-medium">
          {props.title}
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </span>
        <span className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground group-open:hidden">{props.summary}</span>
      </summary>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{props.summary}</p>
    </details>
  );
}

export default function WritingFormulaLanding(props: WritingFormulaLandingProps) {
  const [search, setSearch] = useState("");
  const [collapsedProfileId, setCollapsedProfileId] = useState<string | null>(null);
  const query = search.trim().toLocaleLowerCase();
  const visibleProfiles = props.profileItems.filter((profile) => (
    [profile.name, profile.description, profile.category, ...profile.tags].join(" ").toLocaleLowerCase().includes(query)
  ));
  const customProfiles = visibleProfiles.filter((item) => !item.isStarter);
  const starterProfiles = visibleProfiles.filter((item) => item.isStarter);

  const renderProfileCard = (profile: LandingProfileItem) => {
    const isSelected = profile.id === props.selectedProfileId;
    const showDetails = isSelected && collapsedProfileId !== profile.id;
    const detailsId = "writing-profile-details-" + profile.id;

    return (
      <article key={profile.id} className={cn(
        "border-l-2 px-4 py-5 transition-colors sm:px-6",
        isSelected ? "border-l-primary bg-primary/[0.04]" : "border-l-transparent hover:bg-muted/20",
      )}>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <button type="button" aria-expanded={showDetails} aria-controls={showDetails ? detailsId : undefined}
            aria-label={(showDetails ? "收起写法详情：" : "查看写法详情：") + profile.name}
            className="min-w-0 flex-1 basis-80 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              // Folding a preview must not change the active profile or clear its test draft.
              if (isSelected) {
                setCollapsedProfileId(showDetails ? profile.id : null);
              } else {
                setCollapsedProfileId(null);
                props.onSelectProfile(profile.id);
              }
            }}>
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words text-base font-semibold leading-6">{profile.name}</span>
              <ChevronDown aria-hidden="true" className={cn(
                "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                showDetails && "rotate-180",
              )} />
            </span>
            <span className="mt-1.5 block text-xs text-muted-foreground">
              {profile.originLabel}{profile.category ? " · " + profile.category : ""}
            </span>
            {!showDetails ? <span className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{profile.summaryLine}</span> : null}
          </button>

          <div className="flex flex-wrap items-center gap-1" role="group" aria-label={profile.name + "的操作"}>
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs"
              title="编辑写法说明、规则和反 AI 约束" onClick={() => props.onEditProfile(profile.id)}>
              <Edit3 aria-hidden="true" className="h-3.5 w-3.5" />编辑设定
            </Button>
            <Button type="button" size="sm" variant={isSelected ? "default" : "secondary"} className="h-8 px-2.5 text-xs"
              title="绑定目标或用这套写法试写" onClick={() => props.onOpenWorkbench(profile.id)}>
              <FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />应用与测试
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs"
              title="检查正文并预览局部修订" onClick={() => props.onUseProfileForClean(profile.id)}>
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />去 AI 味
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={props.deletePending}
              className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={"删除写法：" + profile.name} onClick={() => props.onDeleteProfile(profile.id)}>
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />{props.deletePending ? "删除中…" : "删除"}
            </Button>
          </div>
        </div>

        {profile.tags.length > 0 || (!showDetails && profile.recentNovelTitle) ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {profile.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground">{tag}</span>
            ))}
            {!showDetails && profile.recentNovelTitle ? (
              <span className="text-xs text-muted-foreground">最近绑定：{profile.recentNovelTitle}</span>
            ) : null}
          </div>
        ) : null}

        {showDetails ? (
          <div id={detailsId} className="mt-5 grid gap-6 border-t border-border/60 pt-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0 space-y-5">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">读感与定位</h3>
                <p className="whitespace-pre-wrap break-words text-sm leading-7">{profile.description}</p>
              </section>
              <section>
                <h3 className="mb-1 text-sm font-semibold">规则摘要</h3>
                <div className="divide-y divide-border/60">
                  <RuleDisclosure title="剧情推进" summary={profile.narrativeSummary} />
                  <RuleDisclosure title="人物表达" summary={profile.characterSummary} />
                  <RuleDisclosure title="语言质感" summary={profile.languageSummary} />
                  <RuleDisclosure title="节奏控制" summary={profile.rhythmSummary} />
                </div>
              </section>
              {profile.sourceContentPreview ? (
                <details className="group border-t border-border/60 pt-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    原文样本片段<ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <blockquote className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted/30 p-4 text-sm leading-7 text-muted-foreground">{profile.sourceContentPreview}</blockquote>
                </details>
              ) : null}
            </div>

            <aside aria-label={profile.name + "的资产信息"} className="min-w-0 space-y-5 xl:border-l xl:border-border/60 xl:pl-6">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">资产概览</h3>
                <dl className="space-y-2">
                  <DetailStatRow label="最近更新" value={profile.updatedAtLabel} />
                  <DetailStatRow label="已绑定目标" value={profile.bindingCount + " 个"} />
                  <DetailStatRow label="最近小说" value={profile.recentNovelTitle || "尚未绑定小说"} />
                  <DetailStatRow label="适用题材" value={profile.applicableGenres.join(" / ") || "未填写"} />
                </dl>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded py-1 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    来源与提取信息<ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <dl className="mt-2 space-y-2">
                    <DetailStatRow label="来源" value={profile.sourceTypeLabel} />
                    <DetailStatRow label="启用特征" value={profile.extractedFeatureCount + " 项"} />
                    <DetailStatRow label="需留意的原文特征" value={profile.highRiskFeatureCount + " 项"} />
                    <DetailStatRow label="选用预设" value={profile.selectedPresetLabel || "未选择"} />
                    <DetailStatRow label="可选预设" value={profile.presetLabels.join(" / ") || "暂无"} />
                  </dl>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">提取信息用于核对可复用的写法特征，数量不代表写法质量。</p>
                </details>
              </section>
              <section className="space-y-3 border-t border-border/60 pt-4">
                <h3 className="text-sm font-semibold">反 AI 约束</h3>
                {profile.antiAiFocus.length > 0 ? (
                  <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                    {profile.antiAiFocus.map((line) => <li key={line} className="break-words">{line}</li>)}
                  </ul>
                ) : null}
                {profile.antiAiRuleNames.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.antiAiRuleNames.map((ruleName) => <span key={ruleName} className="rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground">{ruleName}</span>)}
                  </div>
                ) : null}
                {profile.extractionAntiAiRecommendationCount > 0 ? (
                  <p className="text-xs leading-5 text-muted-foreground">提取结果建议了 {profile.extractionAntiAiRecommendationCount} 条补充规则，可在编辑设定中核对。</p>
                ) : null}
                {!profile.antiAiFocus.length && !profile.antiAiRuleNames.length && !profile.extractionAntiAiRecommendationCount ? (
                  <p className="text-sm leading-6 text-muted-foreground">尚未配置反 AI 约束，可在编辑设定中选择适合这套写法的规则。</p>
                ) : null}
              </section>
              <p className="border-t border-border/60 pt-4 text-xs leading-6 text-muted-foreground">建议先用“应用与测试”试写一小段，再决定是否绑定到作品。</p>
            </aside>
          </div>
        ) : null}
      </article>
    );
  };

  const renderProfileSection = (title: string, profiles: LandingProfileItem[]) => (
    <section className="overflow-hidden rounded-xl bg-card text-card-foreground">
      <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{profiles.length} 套</span>
      </div>
      <div className="divide-y divide-border/60">{profiles.map(renderProfileCard)}</div>
    </section>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold">写法资产</h2>
            <p className="text-sm leading-6 text-muted-foreground">先选一套写法，再决定要编辑、应用还是去 AI 味。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={props.onOpenPromptLab}>正文效果实验室</Button>
            <Button type="button" onClick={props.onOpenCreate}><Plus aria-hidden="true" className="h-4 w-4" />新建一套写法</Button>
          </div>
        </div>
        <div className="relative max-w-xl">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            aria-label="搜索写法名称、说明或标签" placeholder="搜索写法名称、说明或标签" className="bg-background pl-9" />
        </div>
        <p className="border-b border-border/60 pb-4 text-xs leading-6 text-muted-foreground">从小说基础信息设置书级默认写法；在“应用与测试”中绑定目标或试写。</p>
      </div>

      {props.loading ? <p role="status" className="py-8 text-sm text-muted-foreground">正在加载写法资产…</p> : null}
      {props.error ? (
        <div role="alert" className="rounded-lg bg-destructive/10 p-4 text-sm">
          <p>{props.error}</p>
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={props.onRetry}>重新加载</Button>
        </div>
      ) : null}
      {!props.loading && !props.error && props.profileItems.length === 0 ? (
        <div className="rounded-xl bg-card px-6 py-10">
          <h3 className="text-base font-semibold">创建第一套写法</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">描述你喜欢的读感，或从模板和样本文本开始，AI 会帮你整理成可编辑的规则。</p>
          <Button type="button" className="mt-4" onClick={props.onOpenCreate}>开始创建</Button>
        </div>
      ) : null}
      {!props.loading && !props.error && props.profileItems.length > 0 && visibleProfiles.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <p>没有找到匹配的写法，试试其他名称或标签。</p>
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setSearch("")}>清空搜索</Button>
        </div>
      ) : null}
      {customProfiles.length > 0 ? renderProfileSection("我的写法", customProfiles) : null}
      {starterProfiles.length > 0 ? renderProfileSection("起步写法 · 可直接使用或修改", starterProfiles) : null}
    </div>
  );
}
