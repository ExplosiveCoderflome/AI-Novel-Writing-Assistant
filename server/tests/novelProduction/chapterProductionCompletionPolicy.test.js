const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const {
  isCurrentChapterProductionCompleted,
} = require("../../dist/services/novel/production/completion/ChapterProductionCompletionPolicy.js");

function contentHash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 24);
}

test("legacy terminal chapter without a current artifact boundary stays selectable for recovery", () => {
  const legacyChapter = {
    content: "保留的旧正文",
    generationState: "approved",
    chapterStatus: "completed",
    riskFlags: null,
    artifactSyncCheckpoints: [],
  };
  assert.equal(isCurrentChapterProductionCompleted(legacyChapter), false);
});

test("only a matching current-version boundary makes a terminal chapter skippable", () => {
  const content = "保留的当前正文";
  const terminalChapter = {
    content,
    generationState: "approved",
    chapterStatus: "completed",
    riskFlags: null,
    artifactSyncCheckpoints: [{
      contentHash: contentHash(content),
      metadataJson: JSON.stringify({ outcome: "completed" }),
    }],
  };
  assert.equal(isCurrentChapterProductionCompleted(terminalChapter), true);
  assert.equal(isCurrentChapterProductionCompleted({
    ...terminalChapter,
    artifactSyncCheckpoints: [{
      contentHash: contentHash("旧正文"),
      metadataJson: JSON.stringify({ outcome: "completed" }),
    }],
  }), false);
});
