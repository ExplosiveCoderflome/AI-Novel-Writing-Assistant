import {
  DIRECTOR_RISK_NOTICE_THRESHOLD_MAX,
  DIRECTOR_RISK_NOTICE_THRESHOLD_MIN,
  DIRECTOR_RISK_PAUSE_THRESHOLD_MAX,
  DIRECTOR_RISK_PAUSE_THRESHOLD_MIN,
  type DirectorRiskPolicy,
} from "@ai-novel/shared/types/directorRisk";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { assertDirectorRiskPolicy } from "../../../settings/DirectorRiskPolicySettingsService";

interface NovelRiskPolicyStore {
  findUnique(args: {
    where: { id: string };
    select: { id: true; directorRiskNoticeThreshold: true; directorRiskPauseThreshold: true };
  }): Promise<{
    id: string;
    directorRiskNoticeThreshold: number | null;
    directorRiskPauseThreshold: number | null;
  } | null>;
  update(args: {
    where: { id: string };
    data: { directorRiskNoticeThreshold: number | null; directorRiskPauseThreshold: number | null };
    select: { id: true; directorRiskNoticeThreshold: true; directorRiskPauseThreshold: true };
  }): Promise<{
    id: string;
    directorRiskNoticeThreshold: number | null;
    directorRiskPauseThreshold: number | null;
  }>;
}

export interface DirectorRiskPolicyOverrideServiceDeps {
  novelStore?: NovelRiskPolicyStore;
}

function toPolicy(row: {
  directorRiskNoticeThreshold: number | null;
  directorRiskPauseThreshold: number | null;
}): DirectorRiskPolicy | null {
  if (row.directorRiskNoticeThreshold === null && row.directorRiskPauseThreshold === null) {
    return null;
  }
  if (row.directorRiskNoticeThreshold === null || row.directorRiskPauseThreshold === null) {
    return null;
  }
  try {
    // A saved per-book override may still contain the former 9–10 pause
    // setting. It remains a valid override, with only the score scale
    // normalized in memory.
    const noticeThreshold = Math.min(
      DIRECTOR_RISK_NOTICE_THRESHOLD_MAX,
      Math.max(DIRECTOR_RISK_NOTICE_THRESHOLD_MIN, row.directorRiskNoticeThreshold),
    );
    return assertDirectorRiskPolicy({
      noticeThreshold,
      pauseThreshold: Math.max(
        DIRECTOR_RISK_PAUSE_THRESHOLD_MIN,
        Math.min(
          DIRECTOR_RISK_PAUSE_THRESHOLD_MAX,
          Math.max(noticeThreshold + 1, row.directorRiskPauseThreshold),
        ),
      ),
    });
  } catch {
    return null;
  }
}

export class DirectorRiskPolicyOverrideService {
  constructor(private readonly deps: DirectorRiskPolicyOverrideServiceDeps = {}) {}

  async getOverride(novelId: string): Promise<DirectorRiskPolicy | null> {
    const novel = await this.getStore().findUnique({
      where: { id: novelId },
      select: {
        id: true,
        directorRiskNoticeThreshold: true,
        directorRiskPauseThreshold: true,
      },
    });
    if (!novel) {
      throw new AppError("小说不存在。", 404);
    }
    return toPolicy(novel);
  }

  async saveOverride(novelId: string, override: DirectorRiskPolicy | null): Promise<DirectorRiskPolicy | null> {
    const next = override === null ? null : assertDirectorRiskPolicy(override);
    const store = this.getStore();
    const existing = await store.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        directorRiskNoticeThreshold: true,
        directorRiskPauseThreshold: true,
      },
    });
    if (!existing) {
      throw new AppError("小说不存在。", 404);
    }
    const updated = await store.update({
      where: { id: novelId },
      data: {
        directorRiskNoticeThreshold: next?.noticeThreshold ?? null,
        directorRiskPauseThreshold: next?.pauseThreshold ?? null,
      },
      select: {
        id: true,
        directorRiskNoticeThreshold: true,
        directorRiskPauseThreshold: true,
      },
    });
    return toPolicy(updated);
  }

  private getStore(): NovelRiskPolicyStore {
    return (this.deps.novelStore ?? prisma.novel) as unknown as NovelRiskPolicyStore;
  }
}

export const directorRiskPolicyOverrideService = new DirectorRiskPolicyOverrideService();
