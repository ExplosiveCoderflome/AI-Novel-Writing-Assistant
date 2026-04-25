const test = require("node:test");
const assert = require("node:assert/strict");

const { extractJsonObject } = require("../dist/agents/planner/utils.js");
const { extractJSONObject: extractBookAnalysisObject } = require("../dist/services/bookAnalysis/bookAnalysis.utils.js");
const { extractJsonObject: extractStyleEngineObject } = require("../dist/services/styleEngine/helpers.js");
const {
  extractJSONArray: extractNovelCoreArray,
  extractJSONObject: extractNovelCoreObject,
} = require("../dist/services/novel/novelCoreShared.js");
const { extractJsonArray } = require("../dist/services/novel/novelProductionHelpers.js");
const { parseStrictStructuredOutline } = require("../dist/services/novel/structuredOutline.js");
const { extractJsonPayload } = require("../dist/services/title/titleGeneration.shared.js");
const {
  extractJSONArray: extractWorldArray,
  extractJSONObject: extractWorldObject,
} = require("../dist/services/world/worldServiceShared.js");

test("parseStrictStructuredOutline prefers fenced array payload over bracketed prose before it", () => {
  const chapters = parseStrictStructuredOutline([
    "下面是[约定json]返回：",
    "```json",
    "[{\"chapter\":1,\"title\":\"第一章\",\"summary\":\"开场\",\"key_events\":[\"事件A\"],\"roles\":[\"主角\"]}]",
    "```",
  ].join("\n"));

  assert.deepEqual(chapters, [{
    chapter: 1,
    title: "第一章",
    summary: "开场",
    key_events: ["事件A"],
    roles: ["主角"],
  }]);
});

test("bookAnalysis extractJSONObject prefers fenced object payload over braced prose before it", () => {
  const payload = extractBookAnalysisObject([
    "下面是{约定json}返回：",
    "```json",
    "{\"summary\":\"可解析\"}",
    "```",
  ].join("\n"));

  assert.equal(payload, "{\"summary\":\"可解析\"}");
});

test("planner extractJsonObject prefers fenced object payload over braced prose before it", () => {
  const payload = extractJsonObject([
    "Planner {json contract}:",
    "```json",
    "{\"intent\":\"produce_novel\"}",
    "```",
  ].join("\n"));

  assert.equal(payload, "{\"intent\":\"produce_novel\"}");
});

test("novelProduction extractJsonArray prefers fenced array payload over bracketed prose before it", () => {
  const payload = extractJsonArray([
    "以下为[json]格式：",
    "```json",
    "[{\"chapter\":1}]",
    "```",
  ].join("\n"));

  assert.equal(payload, "[{\"chapter\":1}]");
});

test("worldServiceShared extractJSONObject prefers fenced object payload over braced prose before it", () => {
  const payload = extractWorldObject([
    "world {json contract}:",
    "```json",
    "{\"name\":\"九州\"}",
    "```",
  ].join("\n"));

  assert.equal(payload, "{\"name\":\"九州\"}");
});

test("worldServiceShared extractJSONArray prefers fenced array payload over bracketed prose before it", () => {
  const payload = extractWorldArray([
    "world [json contract]:",
    "```json",
    "[{\"name\":\"王朝\"}]",
    "```",
  ].join("\n"));

  assert.equal(payload, "[{\"name\":\"王朝\"}]");
});

test("novelCoreShared extractJSONObject prefers fenced object payload over braced prose before it", () => {
  const payload = extractNovelCoreObject([
    "核心输出 {json}:",
    "```json",
    "{\"score\":88}",
    "```",
  ].join("\n"));

  assert.equal(payload, "{\"score\":88}");
});

test("novelCoreShared extractJSONArray prefers fenced array payload over bracketed prose before it", () => {
  const payload = extractNovelCoreArray([
    "核心输出 [json]:",
    "```json",
    "[{\"issue\":\"冲突\"}]",
    "```",
  ].join("\n"));

  assert.equal(payload, "[{\"issue\":\"冲突\"}]");
});

test("styleEngine extractJsonObject prefers fenced object payload over braced prose before it", () => {
  const payload = extractStyleEngineObject([
    "风格规则 {json}:",
    "```json",
    "{\"tone\":\"冷峻\"}",
    "```",
  ].join("\n"));

  assert.deepEqual(payload, { tone: "冷峻" });
});

test("title extractJsonPayload prefers fenced array payload over bracketed prose before it", () => {
  const payload = extractJsonPayload([
    "返回[json]如下：",
    "```json",
    "[{\"title\":\"星火\"}]",
    "```",
  ].join("\n"));

  assert.equal(payload, "[{\"title\":\"星火\"}]");
});
