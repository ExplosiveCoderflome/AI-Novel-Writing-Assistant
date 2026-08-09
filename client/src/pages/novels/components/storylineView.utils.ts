import i18next from "i18next";
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
  const coreTheme = findByKeywords(lines, [i18next.t("gen.pages.novels.components.storylineView.utils.gen_44026cfc"), i18next.t("gen.pages.novels.components.storylineView.utils.theme")]);
  const mainGoal = findByKeywords(lines, [i18next.t("gen.pages.novels.components.storylineView.utils.mainGoal"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_73e82552"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_32ba3141")]);
  const earlyPhase = findByKeywords(lines, [i18next.t("gen.pages.novels.components.storylineView.utils.gen_11f61dbf"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_34fe9f5c"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_3eb25280")]) || fallbackPhases.early;
  const middlePhase = findByKeywords(lines, [i18next.t("gen.pages.novels.components.storylineView.utils.midterm"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_c3b62511"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_96213d99")]) || fallbackPhases.middle;
  const latePhase = findByKeywords(lines, [i18next.t("gen.pages.novels.components.storylineView.utils.gen_085cf986"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_385fc63a"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_5c2ed3e4"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_4e4d55f3")]) || fallbackPhases.late;
  const growthCurve = findByKeywords(lines, [i18next.t("gen.pages.novels.components.storylineView.utils.gen_73256308"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_eb4c8f80"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_42dc9d56")]);
  const emotionTrend = findByKeywords(lines, [i18next.t("gen.pages.novels.components.storylineView.utils.gen_2b1c1688"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_54177da2"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_d56d71b4")]);
  const coreConflicts = findByKeywords(lines, [i18next.t("gen.pages.novels.components.storylineView.utils.gen_93190be9"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_56456bdc"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_8aac06ed")]);
  const endingDirection = findByKeywords(lines, [i18next.t("gen.pages.novels.components.storylineView.utils.gen_af402019"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_970939a5"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_bf3971dc")]);
  const forbiddenItems = findByKeywords(lines, [i18next.t("gen.pages.novels.components.storylineView.utils.gen_ff1fda9e"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_83f4e917"), i18next.t("gen.pages.novels.components.storylineView.utils.gen_d30b9087")]);

  return {
    coreTheme: coreTheme || i18next.t("gen.pages.novels.components.storylineView.utils.gen_cb456b11"),
    mainGoal: mainGoal || i18next.t("gen.pages.novels.components.storylineView.utils.gen_cb456b11"),
    earlyPhase: earlyPhase || i18next.t("gen.pages.novels.components.storylineView.utils.gen_cb456b11"),
    middlePhase: middlePhase || i18next.t("gen.pages.novels.components.storylineView.utils.gen_cb456b11"),
    latePhase: latePhase || i18next.t("gen.pages.novels.components.storylineView.utils.gen_cb456b11"),
    growthCurve: growthCurve || i18next.t("gen.pages.novels.components.storylineView.utils.gen_cb456b11"),
    emotionTrend: emotionTrend || i18next.t("gen.pages.novels.components.storylineView.utils.gen_cb456b11"),
    coreConflicts: coreConflicts || i18next.t("gen.pages.novels.components.storylineView.utils.gen_cb456b11"),
    endingDirection: endingDirection || i18next.t("gen.pages.novels.components.storylineView.utils.gen_cb456b11"),
    forbiddenItems: forbiddenItems || i18next.t("gen.pages.novels.components.storylineView.utils.gen_cb456b11"),
  };
}
