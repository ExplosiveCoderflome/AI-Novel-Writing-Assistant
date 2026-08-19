import i18next from "i18next";
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
    <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
      <div className="space-y-1">
        <div className="text-xs font-semibold tracking-[0.12em] text-slate-500">{props.title}</div>
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
    <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(255,255,255,0.92))] p-3.5">
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
      ? "border-sky-300 bg-sky-50/55 shadow-[0_6px_18px_rgba(14,165,233,0.07)]"
      : "border-slate-400 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))] shadow-[0_6px_18px_rgba(15,23,42,0.045)]";
    const idleStyle = profile.isStarter
      ? "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/30"
      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70";
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
        className={`rounded-3xl border px-5 py-4 text-left transition duration-200 ${isSelected ? selectedStyle : idleStyle}`}
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
            <div className="max-w-3xl text-sm leading-6 text-slate-600">
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

          <div className="flex flex-wrap gap-2 xl:justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                onEditProfile(profile.id);
              }}
            >{i18next.t("writingFormula.writingFormulaLanding.gmr1uf")}</Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                onOpenWorkbench(profile.id);
              }}
            >{i18next.t("writingFormula.writingFormulaLanding.tr3x0k")}</Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={(event) => {
                event.stopPropagation();
                onUseProfileForClean(profile.id);
              }}
            >{i18next.t("dict.gen_b589a6aa")}</Button>
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
          <div className="mt-5 space-y-4 rounded-2xl border border-slate-200/70 bg-slate-50/55 p-4 md:p-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_280px]">
              <DetailPanel
                title={i18next.t("dict.gen_c9d154f7")}
                description={i18next.t("dict.gen_6a72ae84")}
              >
                <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm leading-7 text-slate-700">
                  {profile.description}
                </div>
                {profile.detailLines.length > 0 ? (
                  <div className="grid gap-2">
                    {profile.detailLines.map((line) => (
                      <div key={`${profile.id}-${line}`} className="rounded-xl border border-slate-200/80 bg-white/75 px-3 py-3 text-sm leading-6 text-slate-700">
                        {line}
                      </div>
                    ))}
                  </div>
                ) : null}
                {profile.sourceContentPreview ? (
                  <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,rgba(241,245,249,0.9),rgba(255,255,255,0.98))] px-4 py-4 text-sm leading-7 text-slate-700">
                    <div className="mb-2 text-xs font-semibold tracking-[0.12em] text-slate-500">{i18next.t("dict.gen_6388f0b7")}</div>
                    <div>{profile.sourceContentPreview}</div>
                  </div>
                ) : null}
              </DetailPanel>

              <div className="space-y-4">
                <DetailPanel
                  title={i18next.t("dict.gen_353310ad")}
                  description={i18next.t("dict.gen_f36606c3")}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <SummaryCard title={i18next.t("dict.gen_95553c6d")} summary={profile.narrativeSummary} />
                    <SummaryCard title={i18next.t("dict.characterExpression")} summary={profile.characterSummary} />
                    <SummaryCard title={i18next.t("dict.gen_98416f13")} summary={profile.languageSummary} />
                    <SummaryCard title={i18next.t("dict.gen_b01be94f")} summary={profile.rhythmSummary} />
                  </div>
                </DetailPanel>

                <DetailPanel
                  title={i18next.t("dict.gen_fbe42516")}
                  description={i18next.t("dict.gen_f4c90180")}
                >
                  {profile.antiAiFocus.length > 0 || profile.antiAiRuleNames.length > 0 || profile.extractionAntiAiRecommendationCount > 0 ? (
                    <div className="space-y-3">
                      {profile.antiAiFocus.length > 0 ? (
                        <div className="grid gap-2">
                          {profile.antiAiFocus.map((line) => (
                            <div key={`${profile.id}-${line}`} className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-3 text-sm leading-6 text-amber-900">
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
                    <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">{i18next.t("writingFormula.writingFormulaLanding.shc9mc")}</div>
                  )}
                </DetailPanel>
              </div>

              <div className="space-y-4">
                <DetailPanel
                  title={i18next.t("dict.gen_089761a5")}
                  description={i18next.t("dict.gen_da7bd02d")}
                >
                  <div className="space-y-2">
                    <DetailStatRow label={i18next.t("dict.gen_26ca20b1")} value={profile.sourceTypeLabel} />
                    <DetailStatRow label={i18next.t("dict.gen_06dc9b38")} value={profile.updatedAtLabel} />
                    <DetailStatRow label={i18next.t("dict.gen_a02411b4")} value={i18next.t("novels.novelExistingProjectTakeoverViewModel.izenbd", { val1: profile.extractedFeatureCount })} />
                    <DetailStatRow label={i18next.t("dict.gen_3ea1f5f1")} value={i18next.t("novels.novelExistingProjectTakeoverViewModel.izenbd", { val1: profile.highRiskFeatureCount })} />
                    <DetailStatRow
                      label={i18next.t("dict.gen_f2069f25")}
                      value={profile.selectedPresetLabel || "未锁定"}
                    />
                    <DetailStatRow
                      label={i18next.t("dict.gen_711cbc03")}
                      value={profile.presetLabels.length > 0 ? profile.presetLabels.join(" / ") : "暂无"}
                    />
                    <DetailStatRow label={i18next.t("dict.gen_34700230")} value={i18next.t("novels.novelWorldUsageCard.ize8my", { val1: profile.bindingCount })} />
                    <DetailStatRow
                      label={i18next.t("dict.gen_365ed2d7")}
                      value={profile.recentNovelTitle || "还没有绑定到小说"}
                    />
                    <DetailStatRow
                      label={i18next.t("dict.gen_2fdc5592")}
                      value={profile.applicableGenres.length > 0 ? profile.applicableGenres.join(" / ") : "未填写"}
                    />
                  </div>
                </DetailPanel>

                <DetailPanel
                  title={i18next.t("dict.nextStep")}
                  description={i18next.t("dict.buttonFunctionality")}
                >
                  <div className="space-y-2 text-sm leading-6 text-slate-700">
                    <div>{i18next.t("dict.gen_8c45fe26")}</div>
                    <div>{i18next.t("dict.gen_8999142e")}</div>
                    <div>{i18next.t("dict.gen_f240c133")}</div>
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
      <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_14px_42px_rgba(15,23,42,0.045)]">
        <CardContent className="space-y-6 p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{i18next.t("writingFormula.writingFormulaLanding.1buogi")}</Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{i18next.t("writingFormula.writingFormulaLanding.7abhjq")}</h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-600">{i18next.t("writingFormula.writingFormulaLanding.4tr2z4")}</p>
              </div>
            </div>

            <Button type="button" onClick={onOpenCreate}>{i18next.t("writingFormula.writingFormulaBookStyleFlow.7hr003")}</Button>
          </div>

          <div className="rounded-2xl border border-sky-100 bg-sky-50/55 px-4 py-3 text-sm leading-7 text-slate-700">{i18next.t("writingFormula.writingFormulaLanding.bqupu8")}</div>

          {profileItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-6">
              <div className="text-lg font-semibold text-slate-950">{i18next.t("dict.gen_efab47b0")}</div>
              <div className="mt-2 text-sm leading-7 text-slate-600">{i18next.t("writingFormula.writingFormulaLanding.s6hecf")}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={onOpenCreate}>{i18next.t("writingFormula.writingFormulaLanding.ep1fz9")}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {customProfiles.length > 0 ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{i18next.t("dict.yourselfCreatedWritingStyle")}</div>
                      <div className="text-xs leading-6 text-slate-500">{i18next.t("writingFormula.writingFormulaLanding.5dmwgk")}</div>
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
                      <div className="text-sm font-semibold text-slate-950">{i18next.t("dict.gen_f6e53247")}</div>
                      <div className="text-xs leading-6 text-slate-500">{i18next.t("writingFormula.writingFormulaLanding.vf4lzu")}</div>
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
