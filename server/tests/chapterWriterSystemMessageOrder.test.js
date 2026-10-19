const test = require("node:test");
const assert = require("node:assert/strict");

const { chapterWriterPrompt} = require("../dist/prompting/prompts/novel/chapterWriter.prompts.js");

// #196: 严格 Jinja 聊天模板要求 system 消息必须在首位。
// 章节正文 prompt 之前有两个 SystemMessage（第二个在 index 2），
// 导致 llama.cpp / LM Studio 等模型的模板抛 "System message must be at the beginning" 500 错误。
// 回归要求：消息数组里有且仅有一个 SystemMessage，且必须在 index 0。

function renderMessages(mode) {
const context = {
blocks: [],
selectedBlockIds: [],
droppedBlockIds: [],
summarizedBlockIds: [],
estimatedInputTokens: 0,
slots: {
text: () => undefined,
choiceCopy: () => undefined,
enabled: () => false,
token: () => undefined,
},
};
const input = {
novelTitle: "测试小说",
chapterOrder: 1,
chapterTitle: "第一章",
mode,
targetWordCount: 3000,
};
return chapterWriterPrompt.render(input, context);
}

function assertSingleLeadingSystemMessage(messages, mode) {
const types = messages.map((m) => m._getType());
const systemIndexes = types
.map((t, i) => (t === "system"? i: -1))
.filter((i) => i >= 0);
assert.equal(
systemIndexes.length,
1,
`[${mode}] 期望恰好 1 个 system 消息，实际 ${systemIndexes.length} 个在位置 ${systemIndexes.join(",")}`,
);
assert.equal(
systemIndexes[0],
0,
`[${mode}] system 消息必须在首位，实际在位置 ${systemIndexes[0]}`,
);
}

test("chapter writer prompt: draft 模式 system 消息唯一且居首 (#196)", () => {
assertSingleLeadingSystemMessage(renderMessages("draft"), "draft");
});

test("chapter writer prompt: continue 模式 system 消息唯一且居首 (#196)", () => {
assertSingleLeadingSystemMessage(renderMessages("continue"), "continue");
});

test("chapter writer prompt: system 消息包含篇幅与模式约束 (#196)", () => {
const messages = renderMessages("draft");
const systemContent = messages[0].content;
assert.ok(
systemContent.includes("【篇幅与模式约束】"),
"合并后的 system 消息应包含篇幅与模式约束段落",
);
});
