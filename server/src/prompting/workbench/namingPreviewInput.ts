import { characterNamingRequestSchema } from "@ai-novel/shared/types/characterNaming";

/** Workbench-only fictional data; never used by the production naming service. */
export function buildNamingPreviewInput() {
  return characterNamingRequestSchema.parse({
    character: { role: "合成港口故事中守着修伞铺的姐姐", ageOrBirthEra: "十九世纪末出生", familyBackground: "合成的普通手艺人家庭" },
    namingBackground: { era: "十九世纪末", region: "合成华语港口", languageCulture: "汉语" },
    constraints: { preference: "plain" }, candidateCount: 4,
  });
}
