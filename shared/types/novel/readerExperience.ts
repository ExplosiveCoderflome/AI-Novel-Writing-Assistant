import { z } from "zod";

export const readerRewardLevelSchema = z.enum(["setup", "partial", "major"]);

export const readerExperienceContractSchema = z.object({
  readerQuestion: z.string().trim().default(""),
  promisedReward: z.string().trim().default(""),
  rewardLevel: readerRewardLevelSchema.default("setup"),
  protagonistWant: z.string().trim().default(""),
  primaryResistance: z.string().trim().default(""),
  keyTurn: z.string().trim().default(""),
  emotionalShift: z.string().trim().default(""),
  informationReveal: z.string().trim().default(""),
  netChange: z.string().trim().default(""),
  inheritedHookResponsibilities: z.array(z.string().trim().min(1)).default([]),
  endingHook: z.string().trim().default(""),
});

export const generatedReaderExperienceContractSchema = readerExperienceContractSchema.extend({
  readerQuestion: z.string().trim().min(1),
  promisedReward: z.string().trim().min(1),
  rewardLevel: readerRewardLevelSchema,
  protagonistWant: z.string().trim().min(1),
  primaryResistance: z.string().trim().min(1),
  keyTurn: z.string().trim().min(1),
  emotionalShift: z.string().trim().min(1),
  informationReveal: z.string().trim().min(1),
  netChange: z.string().trim().min(1),
  inheritedHookResponsibilities: z.array(z.string().trim().min(1)).max(4),
  endingHook: z.string().trim().min(1),
});

export type ReaderRewardLevel = z.infer<typeof readerRewardLevelSchema>;
export type ReaderExperienceContract = z.infer<typeof readerExperienceContractSchema>;

export const EMPTY_READER_EXPERIENCE_CONTRACT: ReaderExperienceContract = {
  readerQuestion: "",
  promisedReward: "",
  rewardLevel: "setup",
  protagonistWant: "",
  primaryResistance: "",
  keyTurn: "",
  emotionalShift: "",
  informationReveal: "",
  netChange: "",
  inheritedHookResponsibilities: [],
  endingHook: "",
};

export function normalizeReaderExperienceContract(value: unknown): ReaderExperienceContract {
  const parsed = readerExperienceContractSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...EMPTY_READER_EXPERIENCE_CONTRACT };
}

export function hasReaderExperienceContractValue(
  value: ReaderExperienceContract | null | undefined,
): boolean {
  if (!value) return false;
  return Boolean(
    value.readerQuestion
    || value.promisedReward
    || value.protagonistWant
    || value.primaryResistance
    || value.keyTurn
    || value.emotionalShift
    || value.informationReveal
    || value.netChange
    || value.inheritedHookResponsibilities.length > 0
    || value.endingHook,
  );
}
