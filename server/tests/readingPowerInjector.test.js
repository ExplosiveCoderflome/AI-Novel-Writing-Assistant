const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildReadingPowerContextBlock,
  buildReadingPowerGuidanceText,
  buildReadingPowerTextSection,
  resolveReadingPowerProfile,
} = require("../dist/prompting/prompts/novel/readingPowerInjector.js");
const {
  directorCandidatePrompt,
} = require("../dist/prompting/prompts/novel/directorPlanning.prompts.js");
const {
  novelBiblePrompt,
} = require("../dist/prompting/prompts/novel/coreGeneration.prompts.js");
const {
  createContextBlock,
} = require("../dist/prompting/core/contextBudget.js");

test("resolveReadingPowerProfile resolves alias genre labels", () => {
  const profile = resolveReadingPowerProfile("都市异能");

  assert.ok(profile);
  assert.equal(profile.id, "urban-power");
});

test("buildReadingPowerGuidanceText returns empty string when no profile matches", () => {
  assert.equal(buildReadingPowerGuidanceText({ genreLabel: "完全未知题材" }), "");
});

test("buildReadingPowerGuidanceText renders genre guidance for known genres", () => {
  const text = buildReadingPowerGuidanceText({ genreLabel: "仙侠" });

  assert.match(text, /【题材追读力引导 — 仙侠】/);
  assert.match(text, /主要钩子：成长钩子、悬念钩子/);
  assert.match(text, /语调关键词：磅礴、大气、悠远、仙气、玄妙/);
});

test("buildReadingPowerContextBlock returns standardized genre_reading_power block", () => {
  const block = buildReadingPowerContextBlock({ genreLabel: "规则怪谈" });

  assert.ok(block);
  assert.equal(block.id, "genre_reading_power");
  assert.equal(block.group, "genre_reading_power");
  assert.equal(block.priority, 76);
  assert.match(block.content, /【题材追读力引导 — 规则怪谈】/);
});

test("buildReadingPowerTextSection wraps guidance with a custom section title", () => {
  const text = buildReadingPowerTextSection({
    genreLabel: "都市",
    title: "【类型追读力指导】",
  });

  assert.match(text, /^【类型追读力指导】\n/);
  assert.match(text, /【题材追读力引导 — 都市】/);
});

test("director candidate prompt renders reading power guidance through unified text section", () => {
  const messages = directorCandidatePrompt.render({
    idea: "一个在都市里逐步翻盘的异能故事",
    context: {
      genreId: "都市",
    },
    count: 2,
    batches: [],
    presets: [],
    feedback: "",
  }, {
    blocks: [
      createContextBlock({
        id: "idea_seed",
        group: "idea_seed",
        priority: 100,
        required: true,
        content: "都市异能翻盘故事",
      }),
    ],
    selectedBlockIds: ["idea_seed"],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });

  assert.equal(messages.length, 2);
  assert.match(String(messages[1].content), /【类型追读力指导】/);
  assert.match(String(messages[1].content), /【题材追读力引导 — 都市】/);
});

test("novel bible prompt renders reading power guidance through unified text helper", () => {
  const messages = novelBiblePrompt.render({
    title: "测试书",
    genreName: "仙侠",
    description: "一个从底层起步的修仙故事",
    charactersText: "主角：少年散修",
    worldContext: "弱肉强食的修真世界",
    referenceContext: "",
  });

  assert.equal(messages.length, 2);
  assert.match(String(messages[1].content), /【题材追读力引导 — 仙侠】/);
  assert.match(String(messages[1].content), /主要钩子：成长钩子、悬念钩子/);
});
