export interface StorylineStructuredView {
  coreTheme: string;
  mainGoal: string;
  earlyPhase: string;
  middlePhase: string;
  latePhase: string;
  growthCurve: string;
  emotionTrend: string;
  coreConflicts: string;
  endingDirection: string;
  forbiddenItems: string;
}

function normalizeLines(draftText: string): string[] {
  return draftText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function stripLabel(line: string): string {
  return line.replace(/^[^:：]{1,16}[:：]\s*/, "").trim();
}

function findByKeywords(lines: string[], keywords: string[]): string {
  const matched = lines.find((line) => keywords.some((keyword) => line.includes(keyword)));
  if (!matched) {
    return "";
  }
  const stripped = stripLabel(matched);
  return stripped || matched;
}

function buildFallbackPhases(lines: string[]): { early: string; middle: string; late: string } {
  if (lines.length === 0) {
    return { early: "", middle: "", late: "" };
  }
  const blockSize = Math.max(1, Math.ceil(lines.length / 3));
  return {
    early: lines.slice(0, blockSize).join("；"),
    middle: lines.slice(blockSize, blockSize * 2).join("；"),
    late: lines.slice(blockSize * 2).join("；"),
  };
}

export function parseStorylineStructuredView(draftText: string): StorylineStructuredView {
  const lines = normalizeLines(draftText);
  const fallbackPhases = buildFallbackPhases(lines);
  const coreTheme = findByKeywords(lines, ["核心主题", "主题"]);
  const mainGoal = findByKeywords(lines, ["主线目标", "目标", "核心任务"]);
  const earlyPhase = findByKeywords(lines, ["前期", "开篇", "第一阶段"]) || fallbackPhases.early;
  const middlePhase = findByKeywords(lines, ["中期", "第二阶段", "转折"]) || fallbackPhases.middle;
  const latePhase = findByKeywords(lines, ["后期", "第三阶段", "收束", "结局阶段"]) || fallbackPhases.late;
  const growthCurve = findByKeywords(lines, ["成长", "成长路径", "成长弧"]);
  const emotionTrend = findByKeywords(lines, ["情感", "情绪", "情感线"]);
  const coreConflicts = findByKeywords(lines, ["冲突", "矛盾", "对抗"]);
  const endingDirection = findByKeywords(lines, ["结局", "终局", "收尾"]);
  const forbiddenItems = findByKeywords(lines, ["禁止", "避免", "禁忌"]);

  return {
    coreTheme: coreTheme || "未标注",
    mainGoal: mainGoal || "未标注",
    earlyPhase: earlyPhase || "未标注",
    middlePhase: middlePhase || "未标注",
    latePhase: latePhase || "未标注",
    growthCurve: growthCurve || "未标注",
    emotionTrend: emotionTrend || "未标注",
    coreConflicts: coreConflicts || "未标注",
    endingDirection: endingDirection || "未标注",
    forbiddenItems: forbiddenItems || "未标注",
  };
}
