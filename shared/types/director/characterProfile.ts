import { z } from "zod";
import { fieldSuggestionSchemas } from "./review/fieldSuggestions.js";

export const characterProfileFields = [
  "name", "role", "storyFunction", "personality", "background", "outerGoal", "innerNeed",
  "fear", "secret", "moralLine", "appearance", "voiceTexture",
] as const;

export const characterProfileLabels = {
  name: "姓名", role: "角色身份", storyFunction: "故事作用", personality: "性格设定",
  background: "人物经历", outerGoal: "想达成的目标", innerNeed: "内心真正需要什么",
  fear: "恐惧", secret: "隐藏秘密", moralLine: "不能越过的底线", appearance: "外貌", voiceTexture: "说话方式",
} as const;

export type CharacterProfileField = typeof characterProfileFields[number];
export const characterProfileDraftSchema = z.record(z.enum(characterProfileFields), z.string());
export type CharacterProfileDraft = z.infer<typeof characterProfileDraftSchema>;
export const { reply: characterProfileReply, changes: characterProfileSuggestions } = fieldSuggestionSchemas(characterProfileFields);

export function characterProfileValueIssue(field: CharacterProfileField, value: string) {
  if (field === "name" && (!value || value.length > 80 || /[\r\n]/.test(value))) return "姓名须为 1–80 字的单行文字。";
  if (field === "role" && !value) return "请填写角色身份。";
  if (value.length > 12000) return "每项角色资料最多 12000 字。";
}

export const characterProfileSaveSchema = z.object({
  changes: z.array(z.object({
    field: z.enum(characterProfileFields), before: z.string(), after: z.string().trim(),
  }).strict()).min(1).max(characterProfileFields.length),
}).strict().superRefine(({changes}, ctx) => {
  const seen = new Set<CharacterProfileField>();
  for (const [index, {field, before, after}] of changes.entries()) {
    const message = characterProfileValueIssue(field, after)
      ?? (seen.has(field) || before.trim() === after ? "请为每个字段提交一次实际修改。" : undefined);
    if (message) ctx.addIssue({code: "custom", path: ["changes", index, "after"], message});
    seen.add(field);
  }
});

export type CharacterProfileSave = z.infer<typeof characterProfileSaveSchema>;
export interface CharacterProfileWorkspace {
  fields: CharacterProfileDraft;
  editBlockedReason: string | null;
  renameBlockedReason: string | null;
}
