import { z } from "zod";
import {
  VOLUME_BEAT_OPTIONAL_SLOT_KEYS, VOLUME_BEAT_REQUIRED_SLOT_KEYS, VOLUME_BEAT_SLOT_DEFINITIONS,
  getVolumeBeatRoleLabel, isVolumeBeatSlotKey, listMissingRequiredVolumeBeatKeys,
} from "./volumeBeatSlots.js";
import { inferRequiredChapterCountFromBeatSheet } from "./volumeBeatCoverage.js";

export const volumeBeatSlotKeySchema = z.enum([
  ...VOLUME_BEAT_REQUIRED_SLOT_KEYS,
  ...VOLUME_BEAT_OPTIONAL_SLOT_KEYS,
]);

export const volumeBeatSchema = z.object({
  key: volumeBeatSlotKeySchema,
  label: z.string().trim().min(1),
  title: z.string().trim().min(1).max(16).nullable().optional(),
  summary: z.string().trim().min(1).max(240),
  chapterSpanHint: z.string().trim().min(1).max(32),
  mustDeliver: z.array(z.string().trim().min(1).max(160)).min(1).max(6),
});

export function validateVolumeBeatSlots(value: {beats: z.infer<typeof volumeBeatSchema>[]}, ctx: z.RefinementCtx, targetChapterCount?: number) {
  const keys = value.beats.map((beat) => beat.key);
  // The registry schema has no input context; postValidate supplies the adopted target.
  const chapterCount = targetChapterCount ?? inferRequiredChapterCountFromBeatSheet(value);
  const missingRequired = chapterCount > 0 && chapterCount <= 8
    ? ["open_hook", "climax", "end_hook"].filter(key => !keys.includes(key as typeof keys[number]))
    : value.beats.length <= 5
    ? ["open_hook", "first_escalation", "midpoint_turn", "climax", "end_hook"].filter(key => !keys.includes(key as typeof keys[number]))
    : listMissingRequiredVolumeBeatKeys(keys);
  if (missingRequired.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["beats"],
      message: `节奏板缺少必需职能：${missingRequired.map((key) => getVolumeBeatRoleLabel(key)).join("、")}。`,
    });
  }

  const seen = new Set<string>();
  value.beats.forEach((beat, index) => {
    if (seen.has(beat.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["beats", index, "key"],
        message: `节奏职能 key 重复：${beat.key}。`,
      });
    }
    seen.add(beat.key);

    const expectedLabel = getVolumeBeatRoleLabel(beat.key);
    if (beat.label !== expectedLabel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["beats", index, "label"],
        message: `beats[${index}].label 必须是稳定职能名「${expectedLabel}」。`,
      });
    }

    if (!isVolumeBeatSlotKey(beat.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["beats", index, "key"],
        message: `beats[${index}].key 必须是受支持的节奏职能 key。`,
      });
    }
  });

  const orderByKey = new Map(VOLUME_BEAT_SLOT_DEFINITIONS.map((slot) => [slot.key, slot.order]));
  for (let index = 1; index < value.beats.length; index += 1) {
    const previousOrder = orderByKey.get(value.beats[index - 1].key) ?? 0;
    const currentOrder = orderByKey.get(value.beats[index].key) ?? 0;
    if (currentOrder < previousOrder) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["beats", index, "key"],
        message: "节奏职能顺序必须按开卷到卷尾推进，不能前后颠倒。",
      });
      break;
    }
  }
}

export const volumeBeatsSchema = z.array(volumeBeatSchema).min(1).max(8)
  .superRefine((beats, ctx) => validateVolumeBeatSlots({beats}, ctx));
