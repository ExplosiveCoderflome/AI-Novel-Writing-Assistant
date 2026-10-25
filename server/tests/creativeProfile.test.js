const test = require("node:test");
const assert = require("node:assert/strict");

const {
  creativeProfileInputSchema,
  creativeProfileSchema,
} = require("@ai-novel/shared/types/creativeProfile");
const {
  compileCreativeProfileGuidance,
  parseCreativeProfileInput,
  readStoredCreativeProfile,
  resolveCreativePlatformRole,
  resolveNamingBackground,
  serializeCreativeProfile,
} = require("../dist/modules/novel/creative-profile/index.js");

const STAGES = ["positioning", "planning", "drafting", "auditing", "repairing"];

const literaryProfile = {
  schemaVersion: 1,
  orientation: "modern_literary",
  strategy: {
    drive: "relationship",
    conflictScales: ["family", "inner"],
    arcShape: "recognition",
    allowedChapterEndings: ["resonance", "quiet_turn"],
  },
  namingBackground: { era: "1980 年代至 2020 年", region: "川东小镇与上海", languageCulture: "汉语西南官话与普通话" },
};

function stored(profile) { return { creativeProfileJson: JSON.stringify(profile) }; }

test("books without a creative profile keep legacy prompts untouched", () => {
  for (const fields of [null, undefined, {}, { creativeProfileJson: null }, { creativeProfileJson: "   " }]) {
    const read = readStoredCreativeProfile(fields);
    assert.equal(read.status, "unset");
    for (const stage of STAGES) {
      const guidance = compileCreativeProfileGuidance(read, stage);
      assert.equal(guidance.text, "");
      assert.equal(guidance.platformRole, "default");
      assert.equal(guidance.orientation, null);
    }
  }
});

test("broken stored profiles are reported and never treated as web serial", () => {
  const cases = [
    [{ creativeProfileJson: "{not json" }, "malformed_json"],
    [{ creativeProfileJson: "[]" }, "invalid_shape"],
    [stored({ ...literaryProfile, schemaVersion: 2 }, 2), "unsupported_version"],
    [stored({ ...literaryProfile, orientation: "light_novel" }), "invalid_shape"],
    [stored({ orientation: "modern_literary" }, null), "invalid_shape"],
  ];
  for (const [fields, code] of cases) {
    const read = readStoredCreativeProfile(fields);
    assert.equal(read.status, "invalid", JSON.stringify(fields));
    assert.equal(read.issue.code, code, JSON.stringify(fields));
    const guidance = compileCreativeProfileGuidance(read, "drafting");
    assert.equal(guidance.orientation, null);
    assert.equal(guidance.platformRole, "presentation_only");
    assert.notEqual(guidance.text, "");
    assert.match(guidance.text, /不要默认套用网文连载/);
    assert.equal(guidance.issue.code, code);
    assert.equal(resolveNamingBackground(read), null);
  }
});

test("serialization round-trips and refuses to persist invalid profiles", () => {
  const fields = serializeCreativeProfile(literaryProfile);
  assert.equal(JSON.parse(fields.creativeProfileJson).schemaVersion, 1);
  assert.deepEqual(Object.keys(fields), ["creativeProfileJson"]);
  const read = readStoredCreativeProfile(fields);
  assert.equal(read.status, "valid");
  assert.deepEqual(read.profile, literaryProfile);
  assert.deepEqual(serializeCreativeProfile(null), { creativeProfileJson: null });
  assert.throws(() => serializeCreativeProfile({ ...literaryProfile, orientation: "auto" }));
});

test("user input defaults the schema version and validates bounded strategy choices", () => {
  const parsed = parseCreativeProfileInput({ orientation: "literary_genre" });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.profile, { schemaVersion: 1, orientation: "literary_genre" });

  const rejected = [
    { orientation: "modern_literary", strategy: { conflictScales: ["family", "family"] } },
    { orientation: "modern_literary", strategy: { conflictScales: ["inner", "family", "society", "institution"] } },
    { orientation: "modern_literary", strategy: { allowedChapterEndings: [] } },
    { orientation: "modern_literary", strategy: { drive: "plot_twist" } },
    { orientation: "modern_literary", era: "现代" },
    { orientation: "modern_literary", namingBackground: { era: "" } },
    { orientation: "modern_literary", schemaVersion: 2 },
    {},
  ];
  for (const input of rejected) {
    assert.equal(parseCreativeProfileInput(input).success, false, JSON.stringify(input));
  }
  assert.equal(creativeProfileInputSchema.safeParse({ orientation: "web_serial" }).success, true);
  assert.equal(creativeProfileSchema.safeParse({ orientation: "web_serial" }).success, false);
});

test("literary orientation keeps platform as presentation only and drops mandatory hooks", () => {
  const read = readStoredCreativeProfile(stored(literaryProfile));
  assert.equal(resolveCreativePlatformRole(read), "presentation_only");

  const drafting = compileCreativeProfileGuidance(read, "drafting");
  assert.equal(drafting.status, "valid");
  assert.equal(drafting.orientation, "modern_literary");
  assert.match(drafting.text, /用户明确选择的创作取向.*> 本取向指导 > 题材与流派模式 > 平台写法/);
  assert.match(drafting.text, /不得因平台要求强制加入升级、爽点、打脸或每章悬念钩子/);
  assert.match(drafting.text, /叙事距离/);
  assert.match(drafting.text, /对白/);
  assert.match(drafting.text, /心理、环境与议论段落都可以写/);
  const endingLine = drafting.text.split("\n").find((line) => line.startsWith("- 章节收尾："));
  assert.ok(endingLine);
  assert.match(endingLine, /余韵、安静的转折/);
  for (const unselected of ["悬念钩子", "选择关口", "揭示"]) {
    assert.ok(!endingLine.includes(unselected), `${unselected} was not selected by the user`);
  }
  assert.doesNotMatch(drafting.text, /章末留下继续阅读的理由/);

  const auditing = compileCreativeProfileGuidance(read, "auditing");
  assert.match(auditing.text, /不因缺少升级、爽点或悬念钩子扣分/);
  assert.notEqual(auditing.text, drafting.text);
});

test("strategy guidance follows the selected values and stage scope", () => {
  const read = readStoredCreativeProfile(stored(literaryProfile));
  const planning = compileCreativeProfileGuidance(read, "planning").text;
  assert.match(planning, /推进驱动：关系推进/);
  assert.match(planning, /冲突层面：家庭、内心/);
  assert.match(planning, /人物弧线：看清但未必改变/);
  assert.match(planning, /允许的章节收尾方式：余韵、安静的转折/);
  assert.doesNotMatch(planning, /推进驱动：事件推进/);

  const repairing = compileCreativeProfileGuidance(read, "repairing").text;
  assert.match(repairing, /推进驱动：关系推进/);
  assert.match(repairing, /人物弧线/);

  const withoutStrategy = readStoredCreativeProfile(stored({ schemaVersion: 1, orientation: "literary_genre" }));
  const text = compileCreativeProfileGuidance(withoutStrategy, "planning").text;
  assert.doesNotMatch(text, /叙事策略（用户明确选择）/);
  assert.match(text, /线索/);
});

test("explicit web serial keeps the platform default role and carries user strategy", () => {
  const read = readStoredCreativeProfile(stored({
    schemaVersion: 1,
    orientation: "web_serial",
    strategy: { drive: "event", allowedChapterEndings: ["hook", "decision_point"] },
  }));
  assert.equal(resolveCreativePlatformRole(read), "default");
  const drafting = compileCreativeProfileGuidance(read, "drafting");
  assert.equal(drafting.platformRole, "default");
  assert.match(drafting.text, /按所选平台的定位、节奏与回报要求执行/);
  assert.match(drafting.text, /悬念钩子、选择关口/);
  assert.equal(resolveNamingBackground(read), null);
});

test("naming background is exposed only from a valid profile", () => {
  const read = readStoredCreativeProfile(stored(literaryProfile));
  assert.deepEqual(resolveNamingBackground(read), literaryProfile.namingBackground);
});
