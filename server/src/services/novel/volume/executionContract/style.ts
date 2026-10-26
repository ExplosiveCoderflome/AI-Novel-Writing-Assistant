import { buildWriterStyleContractText } from "../../../styleEngine/styleContractText";
import type { ChapterExecutionContractServiceDeps } from "./types";
export async function resolveStyleContract(deps: ChapterExecutionContractServiceDeps, novelId: string, chapterId: string, taskStyleProfileId?: string): Promise<string | null> {
    const resolvedStyleContext = await deps.styleBindingService.resolveForGeneration({
      novelId,
      chapterId,
      taskStyleProfileId,
    }).catch(() => null);
    return buildWriterStyleContractText(resolvedStyleContext?.compiledBlocks?.contract ?? null) || null;
}
