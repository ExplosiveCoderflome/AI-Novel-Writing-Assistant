import { definePlan } from "../domain";

/** Only asset producers belong here; chapter audit and state sync remain inside the production pipeline. */
export const directorProductionPlan = definePlan({
  version: "director-next-production-v1",
  externalArtifacts: ["novel_seed", "chapter_draft"],
  steps: [
    { id: "story_macro", label: "生成故事宏观规划", requires: ["novel_seed"], produces: "story_macro", needs: ["structured_output"], gateable: false, overwrites: ["story_macro"] },
    { id: "book_contract", label: "生成书级创作约定", requires: ["novel_seed", "story_macro"], produces: "book_contract", needs: ["structured_output"], gateable: false, overwrites: ["book_contract"] },
    { id: "world_setup", label: "准备本书世界", requires: ["novel_seed", "story_macro", "book_contract"], produces: "world_skeleton", needs: ["structured_output"], gateable: false, overwrites: ["world_skeleton"] },
    { id: "character_setup", label: "准备角色阵容与角色资产", requires: ["story_macro", "book_contract", "world_skeleton"], produces: "character_cast", needs: ["structured_output"], gateable: true, overwrites: ["character_cast"] },
    { id: "volume_strategy", label: "生成分卷策略与推进路线", requires: ["story_macro", "book_contract", "character_cast"], produces: "volume_strategy", needs: ["structured_output"], gateable: true, overwrites: ["volume_strategy"] },
    { id: "volume_beat_sheet", label: "生成目标卷节奏板", requires: ["volume_strategy", "character_cast"], produces: "volume_beat_sheet", needs: ["structured_output"], gateable: false, overwrites: ["chapter_task_sheet"] },
    { id: "volume_chapter_list", label: "生成卷拆章列表", requires: ["volume_strategy", "character_cast", "volume_beat_sheet"], produces: "volume_chapter_list", needs: ["structured_output"], gateable: false, overwrites: ["chapter_task_sheet"] },
    { id: "chapter_detail_bundle", label: "细化章节任务单与执行资源", requires: ["volume_chapter_list"], produces: "chapter_task_sheet", needs: ["structured_output"], gateable: true, overwrites: ["chapter_task_sheet"] },
    { id: "execution_contract_sync", label: "同步章节执行合同", requires: ["chapter_task_sheet"], produces: "chapter_execution_contract", needs: [], gateable: true, overwrites: [] },
    { id: "chapter_batch", label: "执行章节生成批次", requires: ["chapter_execution_contract"], produces: "chapter_batch_closed", needs: [], gateable: true, overwrites: ["chapter_draft"] },
  ],
});
