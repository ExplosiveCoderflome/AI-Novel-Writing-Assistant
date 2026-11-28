import type { PromptCatalogItem } from "@/api/promptWorkbench";

export function buildOpeningDirectionPreview(prompt: Pick<PromptCatalogItem, "id" | "version">) {
  if (prompt.id !== "novel.director.direction_pair" && prompt.id !== "novel.director.candidates") {
    return undefined;
  }
  const idea = "边关小卒每天替将军写家书。山口即将封冻，城里还等着这批信。";
  const promptInput = { idea, context: {}, count: 2, batches: [], presets: [] };
  const directions = {
    A: { choice: "冒名领信，查清谁在给阵亡的士卒回信", engine: "小卒每借一个名字领信，就多一层暴露身份的风险，也多一条追查寄信人的线索。" },
    B: { choice: "带一群送信人赶在雪封前出关", engine: "小卒每护送一队信使抵达下一站，就要在剩余粮马与仍被困的村镇之间重新取舍。" },
  };
  return {
    promptInput: prompt.id === "novel.director.candidates" && prompt.version === "v3"
      ? { ...promptInput, directions }
      : promptInput,
    metadata: { extraContextBlocks: [{ id: "idea_seed", group: "idea_seed", priority: 100, required: true, content: idea }] },
  };
}
