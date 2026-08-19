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
    const row = await prisma.appSetting.findUnique({ where: { key: GLOBAL_POLICY_KEY } }).catch(() => null);
    const parsed = directorIssuePolicySchema.safeParse(parseJson(row?.value));
    return parsed.success ? parsed.data : { ...DEFAULT_DIRECTOR_ISSUE_POLICY, issueActions: {} };
  }

  async saveGlobalPolicy(input: DirectorIssuePolicy): Promise<DirectorIssuePolicy> {
    const policy = directorIssuePolicySchema.parse(input);
    await prisma.appSetting.upsert({
      where: { key: GLOBAL_POLICY_KEY },
      update: { value: JSON.stringify(policy) },
      create: { key: GLOBAL_POLICY_KEY, value: JSON.stringify(policy) },
    });
    return policy;
  }

  async getNovelPolicy(novelId: string): Promise<{
    effectivePolicy: DirectorIssuePolicy;
    override: DirectorIssuePolicyOverride | null;
    source: "global" | "novel";
  }> {
    const [globalPolicy, novel] = await Promise.all([
      this.getGlobalPolicy(),
      prisma.novel.findUnique({ where: { id: novelId }, select: { directorIssuePolicyOverridesJson: true } }),
    ]);
    if (!novel) throw new AppError("小说不存在。", 404);
    const parsed = directorIssuePolicyOverrideSchema.safeParse(parseJson(novel.directorIssuePolicyOverridesJson));
    const override = parsed.success ? compactOverride(globalPolicy, parsed.data) : null;
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
      data: { directorIssuePolicyOverridesJson: override ? JSON.stringify(override) : null },
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
