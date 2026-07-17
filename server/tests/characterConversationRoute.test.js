const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseCharacterConversationSubjectQuery,
} = require("../dist/modules/characterConversation/http/characterConversationRoutes.js");

test("character conversation routes coerce a chapter anchor before calling the service", () => {
  const subject = parseCharacterConversationSubjectQuery({
    kind: "book_analysis_character",
    id: "character-1",
    scopeKind: "book_analysis",
    scopeId: "analysis-1",
    chapterAnchor: "45",
  });

  assert.equal(subject.chapterAnchor, 45);
  assert.equal(typeof subject.chapterAnchor, "number");
});
