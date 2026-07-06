const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildProseQualityAuditReport,
  detectProseQuality,
} = require("../dist/services/novel/runtime/proseQuality/ProseQualityDetector.js");

function codes(report) {
  return report.findings.map((finding) => finding.code);
}

function severitiesByCode(report, code) {
  return report.findings
    .filter((finding) => finding.code === code)
    .map((finding) => finding.severity);
}

test("detectProseQuality detects deterministic prose degradation signals", () => {
  const longParagraph = `${"潮声压在城墙外，灯火一层层熄灭，守夜人握紧刀柄。".repeat(12)}。`;
  const report = detectProseQuality([
    "他不是害怕，而是终于明白自己已经没有退路。",
    "门后传来声音——很轻，却像刀锋一样贴着耳骨……",
    "他停下。他抬头。他看门。他推开。他进去。他沉默。",
    longParagraph,
    "同一句话在墙上反复浮现。",
    "同一句话在墙上反复浮现。",
    "作为AI语言模型，我无法继续生成这一章。",
    "（此处省略）",
    "本章的任务单要求章尾钩子更强。",
    "更远处的灯火仍在晃动，像一条没有收束的路",
  ].join("\n"));

  assert.ok(report.hasBlockingFindings);
  assert.deepEqual(new Set(codes(report)), new Set([
    "prose_negative_flip",
    "prose_dash_or_ellipsis",
    "prose_period_stutter",
    "prose_long_paragraph",
    "prose_verbatim_repeat",
    "prose_truncation",
    "prose_ai_self_reference",
    "prose_placeholder_leak",
    "prose_engineering_term_leak",
  ]));
  assert.ok(severitiesByCode(report, "prose_long_paragraph").includes("medium"));
  assert.ok(severitiesByCode(report, "prose_ai_self_reference").includes("critical"));
});

test("detectProseQuality keeps common false positives out of blocking findings", () => {
  const report = detectProseQuality([
    "他终于明白，这不是黑就是白的问题，而是每个人都要付出代价。",
    "「作为AI，我会保护你。」银色傀儡抬起头，眼底亮起蓝光。",
    "> 不是冷漠，而是克制。",
    "她在纸上写下完整答案，然后把灯熄灭。",
  ].join("\n"));

  assert.equal(codes(report).includes("prose_negative_flip"), false);
  assert.equal(codes(report).includes("prose_ai_self_reference"), false);
  assert.equal(report.hasBlockingFindings, false);
});

test("buildProseQualityAuditReport maps findings into mode_fit runtime audit issues", () => {
  const report = detectProseQuality("作为AI语言模型，我无法继续生成这一章。后来他只能望着未完成的门");
  const auditReport = buildProseQualityAuditReport({
    novelId: "novel-1",
    chapterId: "chapter-1",
    report,
    now: new Date("2026-07-06T00:00:00.000Z"),
  });

  assert.ok(auditReport);
  assert.equal(auditReport.auditType, "mode_fit");
  assert.equal(auditReport.issues.length >= 1, true);
  assert.equal(auditReport.issues[0].status, "open");
  assert.equal(auditReport.issues[0].auditType, "mode_fit");
  assert.match(auditReport.issues[0].code, /^prose_/);
  assert.equal(auditReport.createdAt, "2026-07-06T00:00:00.000Z");
});
