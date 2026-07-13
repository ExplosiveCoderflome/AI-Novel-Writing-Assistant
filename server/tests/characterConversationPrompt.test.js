const test = require("node:test");
const assert = require("node:assert/strict");

const {
  characterConversationTurnPrompt,
  buildCharacterConversationContextBlocks,
} = require("../dist/prompting/prompts/character/characterConversation.prompts.js");
const {
  characterConversationTurnResponseSchema,
} = require("../dist/prompting/prompts/character/characterConversation.promptSchemas.js");

function render(policy) {
  return characterConversationTurnPrompt.render({ interactionPolicy: policy }, {
    blocks: buildCharacterConversationContextBlocks({
      subject: "角色：顾闻（拆书角色档案）",
      boundaries: "只允许使用截至第 12 章的原文证据。",
      authorMessage: "你为什么不信任陆沉？",
      evidence: "第 8 章｜顾闻拒绝交出账册。",
    }),
    selectedBlockIds: ["character_subject", "character_boundaries", "character_author_message"],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });
}

test("read-only character conversation rejects influence drafts", () => {
  const parsed = characterConversationTurnResponseSchema.parse({
    characterReply: "我只能说，这件事还不足以让我交出底牌。",
    evidence: [],
    uncertainty: null,
    influenceDraft: null,
  });
  assert.equal(parsed.influenceDraft, null);

  const systemText = String(render("read_only")[0].content);
  assert.match(systemText, /只读访谈/);
  assert.match(systemText, /influenceDraft 必须为 null/);
});

test("evidence interview prompt prohibits post-anchor knowledge", () => {
  const systemText = String(render("evidence_interview")[0].content);
  assert.match(systemText, /不得使用章节锚点之后的内容/);
  assert.match(systemText, /缺乏依据时必须在 uncertainty 说明无法确认/);
});

test("novel conversation can retain one evidenced soft influence", () => {
  const parsed = characterConversationTurnResponseSchema.parse({
    characterReply: "我会先试他一次，但不会把账册交出去。",
    evidence: [{
      label: "第 8 章的账册拒绝",
      detail: "顾闻拒绝交出账册。",
      sourceType: "chapter",
      sourceRef: "chapter-8",
      chapterOrder: 8,
    }],
    uncertainty: null,
    influenceDraft: {
      summary: "顾闻更倾向先以小事验证对方。",
      behaviorGuidance: "先提出可撤回的小交换，再决定是否合作。",
      emotionalGuidance: "保持戒备。",
      relationTension: "信任仍需被证明。",
      evidence: ["他拒绝交出账册，只接受可验证的试探。"],
      confidence: 0.8,
    },
  });
  assert.equal(parsed.influenceDraft.behaviorGuidance, "先提出可撤回的小交换，再决定是否合作。");
  assert.match(String(render("novel_influence")[0].content), /待作者确认的非正史软引导/);
});
