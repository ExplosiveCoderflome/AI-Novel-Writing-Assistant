import { parseCommercialTagsJson } from "@ai-novel/shared/types/novelFraming";

interface BookFramingSource {
  targetAudience?: string | null;
  bookSellingPoint?: string | null;
  competingFeel?: string | null;
  first30ChapterPromise?: string | null;
  commercialTags?: string[] | null;
  commercialTagsJson?: string | null;
}

export function resolveCommercialTags(source: BookFramingSource): string[] {
  if (Array.isArray(source.commercialTags)) {
    return source.commercialTags.filter((item) => typeof item === "string" && item.trim().length > 0);
  }
  return parseCommercialTagsJson(source.commercialTagsJson);
}

export function buildBookFramingSummary(source: BookFramingSource): string {
  const commercialTags = resolveCommercialTags(source);
  return [
    source.targetAudience?.trim() ? `目标读者：${source.targetAudience.trim()}` : "",
    commercialTags.length > 0 ? `核心商业标签：${commercialTags.join("、")}` : "",
    source.bookSellingPoint?.trim() ? `本书核心卖点：${source.bookSellingPoint.trim()}` : "",
    source.competingFeel?.trim() ? `竞品感 / 熟悉阅读感：${source.competingFeel.trim()}` : "",
    source.first30ChapterPromise?.trim() ? `前 30 章承诺：${source.first30ChapterPromise.trim()}` : "",
  ].filter(Boolean).join("\n");
}
