import {
  DEFAULT_DIRECTOR_ISSUE_POLICY,
  DIRECTOR_ISSUE_CODES,
  directorIssuePolicyOverrideSchema,
  directorIssuePolicySchema,
  mergeDirectorIssuePolicy,
  type DirectorIssueCode,
  type DirectorIssuePolicy,
  type DirectorIssuePolicyOverride,
} from "@ai-novel/shared/types/directorIssue";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";

const GLOBAL_POLICY_KEY = "autoDirector.issuePolicy.v1";
const LEGACY_NOTICE_THRESHOLD_KEY = "autoDirector.riskPolicy.noticeThreshold";
const LEGACY_PAUSE_THRESHOLD_KEY = "autoDirector.riskPolicy.pauseThreshold";

function parseJson(value: string | null | undefined): unknown {
  if (!value?.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function compactOverride(
  globalPolicy: DirectorIssuePolicy,
  input: DirectorIssuePolicyOverride | null,
): DirectorIssuePolicyOverride | null {
  if (!input) return null;
  const issueActions = Object.fromEntries(
    DIRECTOR_ISSUE_CODES.flatMap((code) => {
      const action = input.issueActions?.[code];
      return action && action !== globalPolicy.issueActions[code] ? [[code, action]] : [];
    }),
  ) as Partial<Record<DirectorIssueCode, DirectorIssuePolicy["issueActions"][DirectorIssueCode]>>;
  const compacted: DirectorIssuePolicyOverride = {
    ...(input.noticeThreshold !== undefined && input.noticeThreshold !== globalPolicy.noticeThreshold
      ? { noticeThreshold: input.noticeThreshold }
      : {}),
    ...(input.pauseThreshold !== undefined && input.pauseThreshold !== globalPolicy.pauseThreshold
      ? { pauseThreshold: input.pauseThreshold }
      : {}),
    ...(Object.keys(issueActions).length > 0 ? { issueActions } : {}),
  };
  return Object.keys(compacted).length > 0 ? compacted : null;
}

export class DirectorIssuePolicyService {
  async getGlobalPolicy(): Promise<DirectorIssuePolicy> {
    const [row, legacyRows] = await Promise.all([
      prisma.appSetting.findUnique({ where: { key: GLOBAL_POLICY_KEY } }).catch(() => null),
      prisma.appSetting.findMany({
        where: { key: { in: [LEGACY_NOTICE_THRESHOLD_KEY, LEGACY_PAUSE_THRESHOLD_KEY] } },
      }).catch(() => []),
    ]);
    const parsed = directorIssuePolicySchema.safeParse(parseJson(row?.value));
    if (parsed.success) return parsed.data;
    const legacy = new Map(legacyRows.map((item) => [item.key, item.value]));
    const legacyPolicy = directorIssuePolicySchema.safeParse({
      noticeThreshold: Number(legacy.get(LEGACY_NOTICE_THRESHOLD_KEY)),
      pauseThreshold: Number(legacy.get(LEGACY_PAUSE_THRESHOLD_KEY)),
      issueActions: {},
    });
    return legacyPolicy.success
      ? legacyPolicy.data
      : { ...DEFAULT_DIRECTOR_ISSUE_POLICY, issueActions: {} };
  }

  async saveGlobalPolicy(input: DirectorIssuePolicy): Promise<DirectorIssuePolicy> {
    const policy = directorIssuePolicySchema.parse(input);
    await prisma.$transaction([
      prisma.appSetting.upsert({
        where: { key: GLOBAL_POLICY_KEY },
        update: { value: JSON.stringify(policy) },
        create: { key: GLOBAL_POLICY_KEY, value: JSON.stringify(policy) },
      }),
      prisma.appSetting.upsert({
        where: { key: LEGACY_NOTICE_THRESHOLD_KEY },
        update: { value: String(policy.noticeThreshold) },
        create: { key: LEGACY_NOTICE_THRESHOLD_KEY, value: String(policy.noticeThreshold) },
      }),
      prisma.appSetting.upsert({
        where: { key: LEGACY_PAUSE_THRESHOLD_KEY },
        update: { value: String(policy.pauseThreshold) },
        create: { key: LEGACY_PAUSE_THRESHOLD_KEY, value: String(policy.pauseThreshold) },
      }),
    ]);
    return policy;
  }

  async getNovelPolicy(novelId: string): Promise<{
    effectivePolicy: DirectorIssuePolicy;
    override: DirectorIssuePolicyOverride | null;
    source: "global" | "novel";
  }> {
    const [globalPolicy, novel] = await Promise.all([
      this.getGlobalPolicy(),
      prisma.novel.findUnique({
        where: { id: novelId },
        select: {
          directorIssuePolicyOverridesJson: true,
          directorRiskNoticeThreshold: true,
          directorRiskPauseThreshold: true,
        },
      }),
    ]);
    if (!novel) throw new AppError("小说不存在。", 404);
    const parsed = directorIssuePolicyOverrideSchema.safeParse(parseJson(novel.directorIssuePolicyOverridesJson));
    const legacyOverride = directorIssuePolicyOverrideSchema.safeParse({
      ...(novel.directorRiskNoticeThreshold === null ? {} : { noticeThreshold: novel.directorRiskNoticeThreshold }),
      ...(novel.directorRiskPauseThreshold === null ? {} : { pauseThreshold: novel.directorRiskPauseThreshold }),
    });
    const override = parsed.success
      ? compactOverride(globalPolicy, parsed.data)
      : legacyOverride.success ? compactOverride(globalPolicy, legacyOverride.data) : null;
    return {
      effectivePolicy: mergeDirectorIssuePolicy(globalPolicy, override),
      override,
      source: override ? "novel" : "global",
    };
  }

  async saveNovelOverride(novelId: string, input: DirectorIssuePolicyOverride | null) {
    const globalPolicy = await this.getGlobalPolicy();
    const parsed = input ? directorIssuePolicyOverrideSchema.parse(input) : null;
    const override = compactOverride(globalPolicy, parsed);
    const updated = await prisma.novel.updateMany({
      where: { id: novelId },
      data: {
        directorIssuePolicyOverridesJson: override ? JSON.stringify(override) : null,
        directorRiskNoticeThreshold: override?.noticeThreshold ?? null,
        directorRiskPauseThreshold: override?.pauseThreshold ?? null,
      },
    });
    if (updated.count === 0) throw new AppError("小说不存在。", 404);
    return {
      effectivePolicy: mergeDirectorIssuePolicy(globalPolicy, override),
      override,
      source: override ? "novel" as const : "global" as const,
    };
  }
}

export const directorIssuePolicyService = new DirectorIssuePolicyService();
