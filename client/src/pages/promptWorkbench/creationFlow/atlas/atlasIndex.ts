import type { PromptCatalogItem } from "@/api/promptWorkbench";
import { atlasScopes } from "./atlasTopics";

export type CatalogVersion = Pick<PromptCatalogItem, "id" | "key" | "version" | "outputType" | "shortDescription">;
export interface AtlasPrompt {
  id: string; title: string; scope: string; topic: string; topicTitle: string; versions: CatalogVersion[];
}

export function indexAtlasPrompts(catalog: CatalogVersion[]) {
  const versions = new Map<string, CatalogVersion[]>();
  for (const item of catalog) {
    const siblings = versions.get(item.id);
    if (siblings) siblings.push(item);
    else versions.set(item.id, [item]);
  }
  const prompts: AtlasPrompt[] = [];
  for (const scope of atlasScopes) {
    for (const topic of scope.topics) {
      for (const [id, title] of topic.prompts) {
        const entries = versions.get(id);
        if (entries?.length) prompts.push({ id, title, scope: scope.id, topic: topic.id, topicTitle: topic.title,
          versions: entries.sort((a, b) => b.version.localeCompare(a.version, "en", { numeric: true })) });
      }
    }
  }
  return prompts;
}
