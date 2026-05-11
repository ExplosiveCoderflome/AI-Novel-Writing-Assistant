const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isVagueVisibleProfileText,
  pickApplicableVisibleProfileFields,
} = require("../dist/services/novel/characterProfile/CharacterVisibleProfileService");
const {
  buildCharactersContextText,
} = require("../dist/services/novel/runtime/runtimeContextBlocks");
const {
  characterVisibleProfileCompletionPrompt,
} = require("../dist/prompting/prompts/novel/characterVisibleProfile.prompts");

test("visible profile field selection preserves existing clear profile", () => {
  const result = pickApplicableVisibleProfileFields({
    existing: {
      appearance: "眉骨很高，左眼下有一颗淡痣，笑时总像先看穿对方。",
      physique: "",
    },
    suggested: {
      appearance: "长得很好看",
      physique: "肩背薄而挺，走路时习惯把重心压得很低。",
    },
  });

  assert.equal(result.fields.appearance, undefined);
  assert.equal(result.skippedFields.appearance, "已有明确资料");
  assert.equal(result.fields.physique, "肩背薄而挺，走路时习惯把重心压得很低。");
});

test("visible profile field selection can overwrite clear profile after explicit author guidance", () => {
  const result = pickApplicableVisibleProfileFields({
    existing: {
      physique: "身形纤细单薄，长期在医疗队工作让她动作克制。",
    },
    suggested: {
      physique: "体态丰满匀称，行动时仍保持医疗队训练出的克制和稳。",
    },
    overwriteExisting: true,
  });

  assert.equal(result.fields.physique, "体态丰满匀称，行动时仍保持医疗队训练出的克制和稳。");
  assert.equal(result.skippedFields.physique, undefined);
});

test("visible profile validator treats generic prose as vague", () => {
  assert.equal(isVagueVisibleProfileText("很好看"), true);
  assert.equal(isVagueVisibleProfileText("气质独特"), true);
  assert.equal(isVagueVisibleProfileText("嗓音低哑，句尾常轻轻压住，像把情绪先藏起来。"), false);
});

test("chapter character context includes compact visible profile summary", () => {
  const text = buildCharactersContextText([
    {
      name: "林照",
      role: "主角",
      personality: "谨慎但不退让",
      appearance: "眼尾狭长，额前总有被火燎卷的碎发",
      physique: "少年感偏瘦，肩背却很稳",
      signatureDetail: "思考时会用拇指摩挲旧铜戒",
      voiceTexture: "声音偏低，短句多，越危险越慢",
    },
  ]);

  assert.match(text, /外显/);
  assert.match(text, /样貌\/体态=/);
  assert.match(text, /标志=/);
  assert.match(text, /声音=/);
});

test("visible profile prompt carries author guidance into the request", () => {
  const messages = characterVisibleProfileCompletionPrompt.render({
    novelTitle: "测试小说",
    genreName: "都市",
    projectMode: "co_pilot",
    storyModeBlock: "",
    bookContractText: "",
    bibleText: "",
    storyMacroText: "",
    characterName: "陈夏",
    characterRole: "首席受益者",
    characterFunction: "核心成员",
    relationToProtagonist: "同伴",
    existingCharacterProfile: "谨慎、负责",
    existingVisibleProfile: "",
    relationText: "",
    userGuidance: "不要写成传统美人，要更有医疗队里的疲惫感。",
  });
  const rendered = messages.map((message) => String(message.content)).join("\n");

  assert.match(rendered, /作者补全倾向/);
  assert.match(rendered, /医疗队里的疲惫感/);
});
