import i18next from "i18next";
import { useTranslation } from "react-i18next";
import type { BasicTabProps } from "./NovelEditView.types";
import NovelBasicInfoForm from "./NovelBasicInfoForm";
import NovelStyleRecommendationCard from "./NovelStyleRecommendationCard";
import { BookFramingQuickFillButton } from "./basicInfoForm/BookFramingQuickFillButton";
import NovelCreateTitleQuickFill from "./titleWorkshop/NovelCreateTitleQuickFill";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import { NovelCoverCard } from "./cover/NovelCoverCard";
import { DetailDisclosure, SectionBlock } from "./workspaceShell";

export default function BasicInfoTab(props: BasicTabProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <DirectorTakeoverEntryPanel
        title={i18next.t("gen.pages.novels.components.BasicInfoTab.gen_1c2bfa8e", "让 AI 从当前项目继续接管")}
        description={i18next.t("gen.pages.novels.components.BasicInfoTab.gen_48ee08a7", "如果基础信息较完整，可以直接从选定步骤开始自动接管，并选择继续已有进度或重跑当前步。")}
        entry={props.directorTakeoverEntry}
      />
      <SectionBlock
        title={i18next.t("gen.pages.novels.components.BasicInfoTab.gen_b5f2826d", "书级定位")}
        description={i18next.t("gen.pages.novels.components.BasicInfoTab.gen_970e009e", "先确认这本书面向谁、靠什么吸引读者、前期必须兑现什么，再让后续世界、角色和章节围绕同一组承诺展开。")}
      >
        <NovelBasicInfoForm
          basicForm={props.basicForm}
          genreOptions={props.genreOptions}
          storyModeOptions={props.storyModeOptions}
          worldOptions={props.worldOptions}
          sourceNovelOptions={props.sourceNovelOptions}
          sourceKnowledgeOptions={props.sourceKnowledgeOptions}
          sourceNovelBookAnalysisOptions={props.sourceNovelBookAnalysisOptions}
          isLoadingSourceNovelBookAnalyses={props.isLoadingSourceNovelBookAnalyses}
          availableBookAnalysisSections={props.availableBookAnalysisSections}
          onFormChange={props.onFormChange}
          onSubmit={props.onSave}
          isSubmitting={props.isSaving}
          submitLabel={i18next.t("gen.pages.novels.components.BasicInfoTab.gen_2afe9d6f", "保存基本信息")}
          titleQuickFill={(
            <NovelCreateTitleQuickFill
              basicForm={props.basicForm}
              onApplyTitle={(title) => props.onFormChange({ title })}
            />
          )}
          framingQuickFill={(
            <BookFramingQuickFillButton
              basicForm={props.basicForm}
              genreOptions={props.genreOptions}
              onApplySuggestion={props.onFormChange}
            />
          )}
          coverSection={(
            <NovelCoverCard
              novelId={props.novelId}
              basicForm={props.basicForm}
              genreOptions={props.genreOptions}
              storyModeOptions={props.storyModeOptions}
              worldOptions={props.worldOptions}
              worldSliceView={props.worldSliceView}
            />
          )}
          projectQuickStart={props.projectQuickStart}
        />
      </SectionBlock>

      <DetailDisclosure
        title={i18next.t("gen.pages.novels.components.BasicInfoTab.gen_b59a7318", "写法建议")}
        description={i18next.t("gen.pages.novels.components.BasicInfoTab.gen_734fe645", "确认本书的叙述口味、表达密度和风格参考，帮助后续章节保持统一。")}
        meta={i18next.t("gen.pages.novels.components.BasicInfoTab.gen_d1de791d", "写法参考")}
      >
        <NovelStyleRecommendationCard novelId={props.novelId} />
      </DetailDisclosure>
    </div>
  );
}
