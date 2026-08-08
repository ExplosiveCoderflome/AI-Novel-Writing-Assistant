import type { KeyboardEvent, ReactNode } from "react";
import { BookOpenText, FlaskConical, PencilLine, Sparkles, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LandingProfileItem } from "../writingFormulaLandingItems";

interface WritingFormulaLandingProps {
  onOpenCreate: () => void;
  onSelectProfile: (profileId: string) => void;
  onEditProfile: (profileId: string) => void;
  onOpenWorkbench: (profileId: string) => void;
  onUseProfileForClean: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  deletePending: boolean;
  profileItems: LandingProfileItem[];
  selectedProfileId: string;
}

function truncateText(value: string | null | undefined, maxLength: number): string {
  const text = value?.trim() ?? "";
  if (!text) {
    return "";
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function handleSelectableKeyDown(event: KeyboardEvent<HTMLDivElement>, onSelect: () => void): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onSelect();
}

function DetailPanel(props: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border bg-white/80 p-4">
      <div className="space-y-1">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{props.title}</div>
        {props.description ? (
          <div className="text-xs leading-6 text-slate-500">{props.description}</div>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}

function DetailStatRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm leading-6">
      <div className="text-slate-500">{props.label}</div>
      <div className="text-right text-slate-800">{props.value}</div>
    </div>
  );
}

function SummaryCard(props: { title: string; summary: string }) {
  return (
    <div className="rounded-xl border bg-slate-50/80 p-3">
      <div className="text-sm font-medium text-slate-900">{props.title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-600">{props.summary}</div>
    </div>
  );
}

function WorkflowCue(props: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-w-0 gap-3 rounded-2xl border border-slate-200/80 bg-white/75 p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
        {props.icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{props.title}</div>
        <div className="mt-0.5 text-xs leading-5 text-slate-500">{props.description}</div>
      </div>
    </div>
  );
}

export default function WritingFormulaLanding(props: WritingFormulaLandingProps) {
  const {
    onOpenCreate,
    onSelectProfile,
    onEditProfile,
    onOpenWorkbench,
    onUseProfileForClean,
    onDeleteProfile,
    deletePending,
    profileItems,
    selectedProfileId,
  } = props;

  const customProfiles = profileItems.filter((item) => !item.isStarter);
  const starterProfiles = profileItems.filter((item) => item.isStarter);

  const renderProfileCard = (profile: LandingProfileItem) => {
    const isSelected = profile.id === selectedProfileId;
    const selectedStyle = profile.isStarter
      ? "border-sky-500 bg-sky-50/80 shadow-[0_8px_24px_rgba(14,165,233,0.12)]"
      : "border-slate-950 bg-[linear-gradient(135deg,rgba(15,23,42,0.04),rgba(14,165,233,0.06))] shadow-[0_8px_24px_rgba(15,23,42,0.06)]";
    const idleStyle = profile.isStarter
      ? "border-slate-200 bg-white hover:border-sky-300"
      : "border-slate-200 bg-slate-50/80 hover:border-slate-300";
    const badgeClassName = profile.isStarter
      ? "h-6 border-sky-200 bg-white text-sky-700"
      : "h-6";

    return (
      <div
        key={profile.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelectProfile(profile.id)}
        onKeyDown={(event) => handleSelectableKeyDown(event, () => onSelectProfile(profile.id))}
        className={`rounded-3xl border px-4 py-4 text-left transition duration-200 ${isSelected ? selectedStyle : idleStyle}`}
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-base font-semibold text-slate-950">{profile.name}</div>
              <Badge variant={profile.isStarter ? "outline" : (isSelected ? "default" : "secondary")} className={badgeClassName}>
                {profile.originLabel}
              </Badge>
              {profile.category ? (
                <Badge variant="outline" className="h-6 border-slate-200 text-slate-600">
                  {profile.category}
                </Badge>
              ) : null}
              <Badge variant="outline" className="h-6 border-slate-200 text-slate-600">
                {profile.sourceTypeLabel}
              </Badge>
            </div>
            <div className="text-sm leading-6 text-slate-600">
              {truncateText(profile.summaryLine, 120) || "暂无写法摘要。"}
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.tags.slice(0, 4).map((tag) => (
                <Badge key={`${profile.id}-${tag}`} variant="outline" className="h-6 border-slate-200 text-slate-600">
                  {tag}
                </Badge>
              ))}
              {profile.recentNovelTitle ? (
                <Badge variant="secondary" className="h-6 bg-amber-50 text-amber-800">
                  最近绑定：{profile.recentNovelTitle}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 xl:max-w-[340px] xl:justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                onEditProfile(profile.id);
              }}
            >
              <PencilLine className="size-3.5" />
              编辑设定
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                onOpenWorkbench(profile.id);
              }}
            >
              <FlaskConical className="size-3.5" />
              应用与测试
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={(event) => {
                event.stopPropagation();
                onUseProfileForClean(profile.id);
              }}
            >
              <Sparkles className="size-3.5" />
              去 AI 味
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={deletePending}
              onClick={(event) => {
                event.stopPropagation();
                onDeleteProfile(profile.id);
              }}
            >
              {deletePending ? "删除中..." : "删除"}
            </Button>
          </div>
        </div>

        {isSelected ? (
          <div className="mt-4 space-y-4 border-t border-slate-200/80 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm text-slate-100">
              <div className="flex min-w-0 items-center gap-2">
                <WandSparkles className="size-4 shrink-0 text-amber-300" />
                <span>已选中这套写法。先试写确认读感，再决定是否绑定到作品。</span>
              </div>
              <Button
                type="button"
                size="sm"
                className="shrink-0 bg-white text-slate-950 hover:bg-slate-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenWorkbench(profile.id);
                }}
              >
                试写看看
              </Button>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_280px]">
              <DetailPanel
                title="读感与定位"
                description="这一列帮助你快速判断这套写法想写成什么感觉，适合先拿来做哪类项目。"
              >
                <div className="rounded-xl border bg-slate-50/80 p-4 text-sm leading-7 text-slate-700">
                  {profile.description}
                </div>
                {profile.detailLines.length > 0 ? (
                  <div className="grid gap-2">
                    {profile.detailLines.map((line) => (
                      <div key={`${profile.id}-${line}`} className="rounded-xl border bg-white px-3 py-3 text-sm leading-6 text-slate-700">
                        {line}
                      </div>
                    ))}
                  </div>
                ) : null}
                {profile.sourceContentPreview ? (
                  <div className="rounded-xl border bg-slate-950 px-4 py-4 text-sm leading-7 text-slate-100">
                    <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">原文样本片段</div>
                    <div>{profile.sourceContentPreview}</div>
                  </div>
                ) : null}
              </DetailPanel>

              <div className="space-y-4">
                <DetailPanel
                  title="规则摘要"
                  description="这里把这套写法真正控制读感的四层规则读出来，方便你在列表里先看懂。"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <SummaryCard title="剧情推进" summary={profile.narrativeSummary} />
                    <SummaryCard title="人物表达" summary={profile.characterSummary} />
                    <SummaryCard title="语言质感" summary={profile.languageSummary} />
                    <SummaryCard title="节奏控制" summary={profile.rhythmSummary} />
                  </div>
                </DetailPanel>

                <DetailPanel
                  title="反 AI 约束"
                  description="这部分决定系统在检测和修正文稿时会优先盯住哪些风险。"
                >
                  {profile.antiAiFocus.length > 0 || profile.antiAiRuleNames.length > 0 || profile.extractionAntiAiRecommendationCount > 0 ? (
                    <div className="space-y-3">
                      {profile.antiAiFocus.length > 0 ? (
                        <div className="grid gap-2">
                          {profile.antiAiFocus.map((line) => (
                            <div key={`${profile.id}-${line}`} className="rounded-xl border bg-amber-50/80 px-3 py-3 text-sm leading-6 text-amber-900">
                              {line}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {profile.antiAiRuleNames.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {profile.antiAiRuleNames.map((ruleName) => (
                            <Badge key={`${profile.id}-${ruleName}`} variant="secondary" className="bg-slate-100 text-slate-700">
                              {ruleName}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      {profile.extractionAntiAiRecommendationCount > 0 ? (
                        <div className="rounded-xl border bg-slate-50/80 px-3 py-3 text-sm leading-6 text-slate-600">
                          这套写法在提取阶段额外建议了 {profile.extractionAntiAiRecommendationCount} 条反 AI 规则，适合后续继续精配。
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">
                      这套写法还没有绑定明确的反 AI 约束，所以“去 AI 味”时可读性会偏弱。
                    </div>
                  )}
                </DetailPanel>
              </div>

              <div className="space-y-4">
                <DetailPanel
                  title="资产概览"
                  description="这一列主要帮你判断这套写法现在成熟到什么程度。"
                >
                  <div className="space-y-2">
                    <DetailStatRow label="来源" value={profile.sourceTypeLabel} />
                    <DetailStatRow label="最近更新" value={profile.updatedAtLabel} />
                    <DetailStatRow label="启用特征" value={`${profile.extractedFeatureCount} 项`} />
                    <DetailStatRow label="高风险指纹" value={`${profile.highRiskFeatureCount} 项`} />
                    <DetailStatRow
                      label="当前预设"
                      value={profile.selectedPresetLabel || "未锁定"}
                    />
                    <DetailStatRow
                      label="可选预设"
                      value={profile.presetLabels.length > 0 ? profile.presetLabels.join(" / ") : "暂无"}
                    />
                    <DetailStatRow label="已绑定目标" value={`${profile.bindingCount} 个`} />
                    <DetailStatRow
                      label="最近小说"
                      value={profile.recentNovelTitle || "还没有绑定到小说"}
                    />
                    <DetailStatRow
                      label="适用题材"
                      value={profile.applicableGenres.length > 0 ? profile.applicableGenres.join(" / ") : "未填写"}
                    />
                  </div>
                </DetailPanel>

                <DetailPanel
                  title="下一步"
                  description="按这个顺序操作，就能把读感带进正在写的故事。"
                >
                  <div className="space-y-3 text-sm leading-6 text-slate-700">
                    <div className="flex gap-2"><span className="font-semibold text-slate-950">1.</span><span>先试写一段，确认推进、对白和语气。</span></div>
                    <div className="flex gap-2"><span className="font-semibold text-slate-950">2.</span><span>满意后绑定到作品或章节，让生成自动带上它。</span></div>
                    <div className="flex gap-2"><span className="font-semibold text-slate-950">3.</span><span>需要修正文稿时，再进入去 AI 味单独处理。</span></div>
                  </div>
                </DetailPanel>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <CardContent className="space-y-6 p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                <BookOpenText className="mr-1 size-3.5" /> 我的写法资产
              </Badge>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                  给故事挑一套能被读出来的写法。
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-600">
                  从读感、节奏和适用题材开始挑选。写法的规则、试写和正文修订会在需要时自然展开，不必一次看完所有设置。
                </p>
              </div>
            </div>

            <Button type="button" onClick={onOpenCreate}>
              新建一套写法
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <WorkflowCue icon={<BookOpenText className="size-4" />} title="挑选读感" description="从已有写法中选择最接近这本书气质的一套。" />
            <WorkflowCue icon={<FlaskConical className="size-4" />} title="先试一段" description="用同一个主题对照推进、对白和语言质感。" />
            <WorkflowCue icon={<WandSparkles className="size-4" />} title="带入创作" description="确认后回到小说基础信息设置书级默认写法。" />
          </div>

          <div className="rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-sm leading-7 text-slate-700">
            书级默认写法请从小说基础信息进入，由小说来选择要使用的写法资产，再带入后续导演和正文流程。
          </div>

          {profileItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-6">
              <div className="text-lg font-semibold text-slate-950">当前还没有写法资产</div>
              <div className="mt-2 text-sm leading-7 text-slate-600">
                先创建第一套写法，后面再回来慢慢补规则、做试写和绑定目标。
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={onOpenCreate}>
                  去创建第一套写法
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {customProfiles.length > 0 ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">你自己创建的写法</div>
                      <div className="text-xs leading-6 text-slate-500">
                        这些是你沉淀下来的可复用资产，应该优先在这里挑。
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                      {customProfiles.length} 套
                    </Badge>
                  </div>
                  <div className="grid gap-3">
                    {customProfiles.map(renderProfileCard)}
                  </div>
                </section>
              ) : null}

              {starterProfiles.length > 0 ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">可直接改的起步写法</div>
                      <div className="text-xs leading-6 text-slate-500">
                        这些预置资产适合先借一套骨架，再按当前项目改成自己的写法。
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                      {starterProfiles.length} 套
                    </Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {starterProfiles.map(renderProfileCard)}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
