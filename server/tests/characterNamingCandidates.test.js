const test = require("node:test");
const assert = require("node:assert/strict");

const { characterNamingCandidatesPrompt } = require("../dist/prompting/prompts/character/naming/characterNaming.prompts.js");
const { characterNamingRequestSchema } = require("../dist/prompting/prompts/character/naming/characterNaming.promptSchemas.js");

const asset = characterNamingCandidatesPrompt;

// 合成案例：1980 年代川东小镇出生的长子，固定姓、字辈与禁用字均由用户明确给出。
function request(overrides = {}) {
  return characterNamingRequestSchema.parse({
    character: {
      currentName: "冉三娃",
      role: "主角的大哥，留在小镇照顾父母，与出走上海的弟弟形成对照",
      gender: "男",
      ageOrBirthEra: "1982 年出生",
      hometown: "川东小镇",
      familyBackground: "父亲是镇供销社职工，按族谱字辈取名",
      description: "沉默寡言，修了二十年自行车",
    },
    constraints: {
      fixedSurname: "冉",
      generationChar: { char: "建", position: 1 },
      forbiddenNames: ["冉建国"],
      forbiddenChars: ["龙"],
      preference: "plain",
    },
    namingBackground: { era: "1980 年代至 2020 年", region: "川东与上海", languageCulture: "汉语西南官话" },
    existingCastNames: ["冉建平", "周秀英"],
    candidateCount: 4,
    ...overrides,
  });
}

function candidate(givenName, extra = {}) {
  return {
    name: `冉${givenName}`,
    surname: "冉",
    givenName,
    register: "common",
    appellations: ["大娃"],
    rationale: {
      era: "八十年代初镇上常见的取名方式",
      region: "川东小镇",
      languageCulture: "汉语，族谱字辈",
      ageAndFamily: "长子，父亲按字辈取名",
      storyRole: "朴素的名字贴合留守的大哥",
    },
    readingRisks: [],
    distinction: "与弟弟冉建平读音和字形区分明显",
    ...extra,
  };
}

function output(candidates, keepCurrentName = { recommended: false, reason: "现名未满足正式字辈约束，昵称可另行保留" }) {
  return asset.outputSchema.parse({ keepCurrentName, candidates });
}

function postValidate(raw, input = request()) {
  return asset.postValidate(raw, input, { blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 });
}

test("naming asset declares a bounded structured contract", () => {
  assert.equal(asset.id, "character.naming.candidates");
  assert.equal(asset.version, "v1");
  assert.equal(asset.mode, "structured");
  assert.equal(asset.repairPolicy.maxAttempts, 1);
  assert.equal(asset.semanticRetryPolicy.maxAttempts, 1);
  const two = { keepCurrentName: { recommended: false, reason: "无" }, candidates: [candidate("建军"), candidate("建华")] };
  const seven = { ...two, candidates: ["建军", "建华", "建明", "建川", "建林", "建勇", "建忠"].map((name) => candidate(name)) };
  assert.equal(asset.outputSchema.safeParse(two).success, false);
  assert.equal(asset.outputSchema.safeParse(seven).success, false);
  assert.equal(asset.outputSchema.safeParse({ ...two, candidates: [...two.candidates, { name: "冉建明" }] }).success, false);
});

test("request schema bounds count and validates the user's explicit constraints", () => {
  assert.equal(characterNamingRequestSchema.safeParse({ character: { role: "配角" }, candidateCount: 7 }).success, false);
  assert.equal(characterNamingRequestSchema.safeParse({ character: { role: "配角" }, candidateCount: 2 }).success, false);
  assert.equal(characterNamingRequestSchema.safeParse({
    character: { role: "配角" },
    constraints: { generationChar: { char: "建国", position: 1 } },
  }).success, false);
  const minimal = characterNamingRequestSchema.parse({ character: { role: "配角" } });
  assert.equal(minimal.candidateCount, 4);
  assert.equal(minimal.constraints.preference, "balanced");
});

test("valid candidates pass and extra candidates are trimmed to the requested count", () => {
  const raw = output(["建军", "建华", "建明", "建川", "建林"].map((name) => candidate(name)));
  const result = postValidate(raw);
  assert.deepEqual(result.candidates.map((item) => item.name), ["冉建军", "冉建华", "冉建明", "冉建川"]);
  assert.equal(result.keepCurrentName.recommended, false);
});

test("explicit user constraints are enforced deterministically", () => {
  const base = ["建华", "建明", "建川"].map((name) => candidate(name));
  const cases = [
    [[candidate("建军", { name: "王建军", surname: "王" }), ...base], /指定姓氏/],
    [[candidate("军建"), ...base], /字辈「建」/],
    [[candidate("建龙"), ...base], /禁用字「龙」/],
    [[candidate("建国"), ...base], /已有角色名或禁用名/],
    [[candidate("建平"), ...base], /已有角色名或禁用名/],
    [[candidate("建华"), ...base], /与前面的候选重复/],
    [[candidate("三娃", { name: "冉三娃" }), ...base], /与现名相同/],
    [[candidate("建军", { name: "冉建军\u0001" }), ...base], /控制字符/],
    [[candidate("建军", { name: "冉建峰" }), ...base], /不一致/],
  ];
  for (const [candidates, pattern] of cases) {
    assert.throws(() => postValidate(output(candidates)), pattern);
  }
  assert.throws(() => postValidate(output(base)), /需要 4 个候选/);
});

test("keeping the current name requires one and ornate-only candidate sets are rejected", () => {
  const plainSet = ["建军", "建华", "建明", "建川"].map((name) => candidate(name));
  const noCurrentName = request({ character: { role: "镇上的邮递员", ageOrBirthEra: "1960 年代出生" } });
  assert.throws(
    () => postValidate(output(plainSet, { recommended: true, reason: "保留" }), noCurrentName),
    /没有现名/,
  );
  assert.ok(postValidate(output(plainSet, { recommended: false, reason: "无现名" }), noCurrentName));

  const ornate = plainSet.map((item) => ({ ...item, register: "meaningful" }));
  assert.throws(() => postValidate(output(ornate)), /至少需要一个符合出身的朴素或常见名字/);
  const meaningfulAllowed = request({ constraints: { fixedSurname: "冉", generationChar: { char: "建", position: 1 }, preference: "meaningful" } });
  assert.equal(postValidate(output(ornate), meaningfulAllowed).candidates.length, 4);
});

test("names without a surname tradition validate without a fixed surname", () => {
  const input = request({
    character: { role: "支教点的藏族同事", ageOrBirthEra: "1995 年出生", hometown: "川西高原" },
    constraints: { preference: "balanced" },
    existingCastNames: [],
  });
  const raw = output(["扎西", "次仁", "多吉"].map((givenName) => candidate(givenName, { name: givenName, surname: "" })), { recommended: false, reason: "无现名" });
  assert.equal(postValidate(raw, { ...input, candidateCount: 3 }).candidates.length, 3);
});

test("render carries era, region, family and every explicit constraint", () => {
  const messages = asset.render(request(), { blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 });
  const system = String(messages[0].content);
  const human = String(messages[1].content);
  assert.match(system, /输出恰好 4 个候选/);
  assert.match(system, /不得让所有候选都华丽、生僻或寓意化/);
  assert.match(system, /禁止截取人物描述/);
  for (const expected of ["1982 年出生", "川东小镇", "族谱字辈", "固定姓氏：冉", "「建」，必须是名（不含姓）的第 1 个字", "冉建国", "禁用字：龙", "冉建平、周秀英", "1980 年代至 2020 年"]) {
    assert.ok(human.includes(expected), `missing ${expected}`);
  }
});

test("cross-cultural candidates allow spaces, multiword surnames, apostrophes and transcription separators", () => {
  const rows = [
    ["Ana María de la Cruz", "de la Cruz", "Ana María"],
    ["Jean-Luc O’Neill", "O’Neill", "Jean-Luc"],
    ["София Петрова", "Петрова", "София"],
    ["阿依古丽·买买提", "买买提", "阿依古丽"],
  ];
  const input = request({ character: { role: "合成港口的多语居民" }, constraints: {}, existingCastNames: [] });
  const candidates = rows.map(([name, surname, givenName]) => candidate(givenName, { name, surname }));
  assert.equal(postValidate(output(candidates, { recommended: false, reason: "无现名" }), input).candidates.length, 4);
  const duplicates = [candidate("José", { name: "José Ramos", surname: "Ramos" }), candidate("Jose\u0301", { name: "Jose\u0301 Ramos", surname: "Ramos" }), ...candidates.slice(0, 2)];
  assert.throws(() => postValidate(output(duplicates), input), /与前面的候选重复/);
});

test("keep-current recommendation respects explicit family constraints without inventing name parts", () => {
  const raw = ["建军", "建华", "建明", "建川"].map(name => candidate(name));
  assert.throws(() => postValidate(output(raw, { recommended: true, reason: "保留昵称", surname: "冉", givenName: "三娃" })), /字辈/);
  assert.ok(postValidate(output(raw, { recommended: true, reason: "贴合家庭", surname: "冉", givenName: "建安" }), request({ character: { role: "长子", currentName: "冉建安" } })));
});
