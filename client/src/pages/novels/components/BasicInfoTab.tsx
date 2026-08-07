import type { BasicTabProps } from "./NovelEditView.types";
import NovelBasicInfoForm from "./NovelBasicInfoForm";
import NovelStyleRecommendationCard from "./NovelStyleRecommendationCard";
import { BookFramingQuickFillButton } from "./basicInfoForm/BookFramingQuickFillButton";
import NovelCreateTitleQuickFill from "./titleWorkshop/NovelCreateTitleQuickFill";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import { NovelCoverCard } from "./cover/NovelCoverCard";
import { DetailDisclosure, SectionBlock } from "./workspaceShell";

export default function BasicInfoTab(props: BasicTabProps) {
  return (
    <div className="space-y-5">
      <DirectorTakeoverEntryPanel
        title="Let AI take over from current project"
        description="If the basic information is complete, you can automatically take over directly from the selected step, and choose to continue the existing progress or rerun the current step."
        entry={props.directorTakeoverEntry}
      />
      <SectionBlock
        title="book level positioning"
        description="First confirm who the book is for, what attracts readers, and what must be fulfilled in the early stages, and then let the subsequent world, characters, and chapters revolve around the same set of promises."
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
          submitLabel="Save basic information"
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
        title="Writing suggestions"
        description="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
        meta="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
      >
        <NovelStyleRecommendationCard novelId={props.novelId} />
      </DetailDisclosure>
    </div>
  );
}
