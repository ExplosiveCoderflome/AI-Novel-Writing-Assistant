import type { DirectorVersion } from "@ai-novel/shared/types/director/version";

export function getDirectionGenerationDisabledReasons(input: {
  idea: string;
  directorVersion: DirectorVersion;
  availableVersions: readonly DirectorVersion[];
  versionsLoading: boolean;
  versionsError: boolean;
  isGenerating: boolean;
  requireCreativeCarryoverAdopted: boolean;
  creativeCarryoverAdopted: boolean;
}): string[] {
  const reasons: string[] = [];
  if (!input.idea.trim()) {
    reasons.push("请返回第 1 步填写单书构想。");
  }
  if (input.versionsLoading) {
    reasons.push("正在读取可用导演版本，请稍候。");
  } else if (input.versionsError) {
    reasons.push("可用导演版本读取失败，请重试。");
  } else if (!input.availableVersions.includes(input.directorVersion)) {
    reasons.push("所选导演版本不可用，请选择可用版本。");
  }
  if (input.isGenerating) {
    reasons.push("正在生成整书方向，请等待本次生成完成。");
  }
  if (input.requireCreativeCarryoverAdopted && !input.creativeCarryoverAdopted) {
    reasons.push("请打开创作方案并采用推荐方案。");
  }
  return reasons;
}
