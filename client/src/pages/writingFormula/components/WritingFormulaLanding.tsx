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
  const selectedProfile = profileItems.find((item) => item.id === selectedProfileId) ?? profileItems[0] ?? null;

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

        </div>

      </div>
    );
  };

  const renderSelectedProfile = () => {
    if (!selectedProfile) {
      return null;
    }

    return (
      <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(255,255,255,0.96)_46%,rgba(240,249,255,0.82))] p-5 md:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-slate-950 text-white">正在查看</Badge>
              <Badge variant="outline" className="border-slate-200 bg-white/70 text-slate-600">{selectedProfile.originLabel}</Badge>
              {selectedProfile.category ? <Badge variant="outline" className="border-slate-200 bg-white/70 text-slate-600">{selectedProfile.category}</Badge> : null}
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{selectedProfile.name}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{selectedProfile.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button type="button" onClick={() => onOpenWorkbench(selectedProfile.id)}><FlaskConical className="size-4" />先试一段</Button>
            <Button type="button" variant="outline" onClick={() => onEditProfile(selectedProfile.id)}><PencilLine className="size-4" />调整写法</Button>
            <Button type="button" variant="secondary" onClick={() => onUseProfileForClean(selectedProfile.id)}><Sparkles className="size-4" />去 AI 味</Button>
            <Button type="button" size="sm" variant="ghost" disabled={deletePending} onClick={() => onDeleteProfile(selectedProfile.id)}>{deletePending ? "删除中..." : "删除"}</Button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard title="剧情推进" summary={selectedProfile.narrativeSummary} />
              <SummaryCard title="人物表达" summary={selectedProfile.characterSummary} />
              <SummaryCard title="语言质感" summary={selectedProfile.languageSummary} />
              <SummaryCard title="节奏控制" summary={selectedProfile.rhythmSummary} />
            </div>
            {selectedProfile.sourceContentPreview ? (
              <div className="rounded-2xl bg-slate-950 px-4 py-4 text-sm leading-7 text-slate-100">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400"><BookOpenText className="size-3.5" /> 原文读感样本</div>
                {selectedProfile.sourceContentPreview}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/75 p-4">
            <div className="text-sm font-semibold text-slate-950">适合怎么使用</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(selectedProfile.applicableGenres.length > 0 ? selectedProfile.applicableGenres : selectedProfile.tags).slice(0, 6).map((item) => (
                <Badge key={`${selectedProfile.id}-use-${item}`} variant="outline" className="border-slate-200 bg-white text-slate-700">{item}</Badge>
              ))}
            </div>
            <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
              <DetailStatRow label="已绑定" value={`${selectedProfile.bindingCount} 个目标`} />
              <DetailStatRow label="可用特征" value={`${selectedProfile.extractedFeatureCount} 项`} />
              <DetailStatRow label="最近更新" value={selectedProfile.updatedAtLabel} />
              {selectedProfile.recentNovelTitle ? <DetailStatRow label="最近用于" value={selectedProfile.recentNovelTitle} /> : null}
            </div>
            {selectedProfile.antiAiRuleNames.length > 0 ? (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="text-xs font-medium text-slate-500">已关联的反 AI 规则</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedProfile.antiAiRuleNames.slice(0, 3).map((rule) => <Badge key={`${selectedProfile.id}-${rule}`} variant="secondary" className="bg-amber-50 text-amber-900">{rule}</Badge>)}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
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
            <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)] xl:items-start">
              <aside className="space-y-6 rounded-3xl border border-slate-200 bg-slate-50/50 p-3 md:p-4">
                <div className="px-1 text-xs leading-5 text-slate-500">选择一套写法，右侧会立即显示完整读感与可执行操作。</div>
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
                  <div className="grid gap-2">
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
                  <div className="grid gap-2">
                    {starterProfiles.map(renderProfileCard)}
                  </div>
                  </section>
                ) : null}
              </aside>

              <div className="xl:sticky xl:top-4">{renderSelectedProfile()}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
