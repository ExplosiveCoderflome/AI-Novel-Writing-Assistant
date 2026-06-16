import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { dramaTextImportSourcePrompt } from "../../../prompting/prompts/drama/drama.prompts";
import type { SourceContentPort } from "./SourceContentPort";
import type { SourceBundle, SourceRef } from "../contracts/sourceBundle";

export class TextImportSourceAdapter implements SourceContentPort {
  readonly sourceType = "text_import" as const;

  async loadBundle(ref: SourceRef): Promise<SourceBundle> {
    const rawText = ref.rawText?.trim();
    if (!rawText) {
      throw new Error("text_import 内容源缺少导入文本。");
    }
    const result = await runStructuredPrompt({
      asset: dramaTextImportSourcePrompt,
      promptInput: {
        title: ref.ref || "文本导入短剧项目",
        rawText,
        targetEpisodes: 80,
      },
      options: { temperature: 0.4 },
    });
    return { ...result.output, rawText };
  }
}

export const textImportSourceAdapter = new TextImportSourceAdapter();
