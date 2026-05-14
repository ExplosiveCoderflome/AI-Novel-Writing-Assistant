import { DIRECTOR_PLANNING_STEP_MODULES } from "./directorPlanningStepModules";
import {
  buildStructuredOutlineStepDescriptor,
  createStructuredOutlineFactModule,
} from "./directorStructuredOutlineStepFactory";
import { DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS } from "./directorWorkflowStepIds";

export const DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES = {
  beat_sheet: DIRECTOR_PLANNING_STEP_MODULES.structured_outline,
  chapter_list: createStructuredOutlineFactModule({
    step: "chapter_list",
    descriptor: buildStructuredOutlineStepDescriptor({
      id: DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_list,
      nodeKey: "volume_chapter_list_generate",
      label: "生成卷拆章列表",
      defaultWaitingState: {
        stage: "structured_outline",
        itemKey: "chapter_list",
        itemLabel: "等待卷拆章列表准备完成",
        progress: 0.8,
      },
    }),
  }),
  chapter_detail_bundle: createStructuredOutlineFactModule({
    step: "chapter_detail_bundle",
    descriptor: buildStructuredOutlineStepDescriptor({
      id: DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_detail_bundle,
      nodeKey: "volume_chapter_detail_bundle_generate",
      label: "细化章节任务单与执行资源",
      defaultWaitingState: {
        stage: "structured_outline",
        itemKey: "chapter_detail_bundle",
        itemLabel: "等待章节任务单与执行资源准备完成",
        progress: 0.88,
      },
    }),
  }),
} as const;
