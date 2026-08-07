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
  const coreTheme = findByKeywords(lines, ["core themes", "theme"]);
  const mainGoal = findByKeywords(lines, ["main objective", "Target", "core mission"]);
  const earlyPhase = findByKeywords(lines, ["Early stage", "Beginning", "first stage"]) || fallbackPhases.early;
  const middlePhase = findByKeywords(lines, ["Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", "second stage", "turning point"]) || fallbackPhases.middle;
  const latePhase = findByKeywords(lines, ["later stage", "The third stage", "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."]) || fallbackPhases.late;
  const growthCurve = findByKeywords(lines, ["growing up", "growth path", "growth arc"]);
  const emotionTrend = findByKeywords(lines, ["emotion", "mood", "emotional line"]);
  const coreConflicts = findByKeywords(lines, ["conflict", "contradiction", "confrontation"]);
  const endingDirection = findByKeywords(lines, ["ending", "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", "ending"]);
  const forbiddenItems = findByKeywords(lines, ["prohibit", "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", "Taboo"]);

  return {
    coreTheme: coreTheme || "Not labeled",
    mainGoal: mainGoal || "Not labeled",
    earlyPhase: earlyPhase || "Not labeled",
    middlePhase: middlePhase || "Not labeled",
    latePhase: latePhase || "Not labeled",
    growthCurve: growthCurve || "Not labeled",
    emotionTrend: emotionTrend || "Not labeled",
    coreConflicts: coreConflicts || "Not labeled",
    endingDirection: endingDirection || "Not labeled",
    forbiddenItems: forbiddenItems || "Not labeled",
  };
}
