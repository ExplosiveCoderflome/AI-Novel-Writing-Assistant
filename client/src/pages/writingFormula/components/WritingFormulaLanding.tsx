import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { KeyboardEvent, ReactNode } from "react";
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
        className={`rounded-2xl border px-4 py-4 text-left transition ${isSelected ? selectedStyle : idleStyle}`}
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
              {truncateText(profile.summaryLine, 120) || t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_c7933614")}
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

          <div className="flex flex-wrap gap-2 xl:justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                onEditProfile(profile.id);
              }}
            >
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
              {deletePending ? t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_09f2fb82") : t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_2f4aaddd")}
            </Button>
          </div>
        </div>

        {isSelected ? (
          <div className="mt-4 space-y-4 border-t border-slate-200/80 pt-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_280px]">
              <DetailPanel
                title={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_c9d154f7")}
                description={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_6a72ae84")}
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
                    <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_6388f0b7")}</div>
                    <div>{profile.sourceContentPreview}</div>
                  </div>
                ) : null}
              </DetailPanel>

              <div className="space-y-4">
                <DetailPanel
                  title={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_353310ad")}
                  description={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_f36606c3")}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <SummaryCard title={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_95553c6d")} summary={profile.narrativeSummary} />
                    <SummaryCard title={t("gen.pages.writingFormula.components.WritingFormulaLanding.characterExpression")} summary={profile.characterSummary} />
                    <SummaryCard title={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_98416f13")} summary={profile.languageSummary} />
                    <SummaryCard title={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_b01be94f")} summary={profile.rhythmSummary} />
                  </div>
                </DetailPanel>

                <DetailPanel
                  title={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_fbe42516")}
                  description={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_f4c90180")}
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
                  title={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_089761a5")}
                  description={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_da7bd02d")}
                >
                  <div className="space-y-2">
                    <DetailStatRow label={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_26ca20b1")} value={profile.sourceTypeLabel} />
                    <DetailStatRow label={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_06dc9b38")} value={profile.updatedAtLabel} />
                    <DetailStatRow label={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_a02411b4")} value={`${profile.extractedFeatureCount} 项`} />
                    <DetailStatRow label={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_3ea1f5f1")} value={`${profile.highRiskFeatureCount} 项`} />
                    <DetailStatRow
                      label={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_f2069f25")}
                      value={profile.selectedPresetLabel || t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_9f62b763")}
                    />
                    <DetailStatRow
                      label={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_711cbc03")}
                      value={profile.presetLabels.length > 0 ? profile.presetLabels.join(" / ") : t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_f61f4cf6")}
                    />
                    <DetailStatRow label={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_34700230")} value={`${profile.bindingCount} 个`} />
                    <DetailStatRow
                      label={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_365ed2d7")}
                      value={profile.recentNovelTitle || t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_ec9880c7")}
                    />
                    <DetailStatRow
                      label={t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_2fdc5592")}
                      value={profile.applicableGenres.length > 0 ? profile.applicableGenres.join(" / ") : t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_5c688139")}
                    />
                  </div>
                </DetailPanel>

                <DetailPanel
                  title={t("gen.pages.writingFormula.components.WritingFormulaLanding.nextStep")}
                  description={t("gen.pages.writingFormula.components.WritingFormulaLanding.buttonFunctionality")}
                >
                  <div className="space-y-2 text-sm leading-6 text-slate-700">
                    <div>{t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_8c45fe26")}</div>
                    <div>{t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_8999142e")}</div>
                    <div>{t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_f240c133")}</div>
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
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                我的写法资产
              </Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                  先选一套写法，再决定要编辑、应用还是去 AI 味。
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-600">
                  首页负责看清你已有的写法资产。展开后会直接展示这套写法的读感定位、规则摘要、反 AI 约束和当前成熟度。
                </p>
              </div>
            </div>

            <Button type="button" onClick={onOpenCreate}>
              新建一套写法
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,rgba(241,245,249,0.9),rgba(248,250,252,0.95))] px-4 py-3 text-sm leading-7 text-slate-700">
            书级默认写法请从小说基础信息进入，由小说来选择要使用的写法资产，再带入后续导演和正文流程。
          </div>

          {profileItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-6">
              <div className="text-lg font-semibold text-slate-950">{t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_efab47b0")}</div>
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
                      <div className="text-sm font-semibold text-slate-950">{t("gen.pages.writingFormula.components.WritingFormulaLanding.yourselfCreatedWritingStyle")}</div>
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
                      <div className="text-sm font-semibold text-slate-950">{t("gen.pages.writingFormula.components.WritingFormulaLanding.gen_f6e53247")}</div>
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
