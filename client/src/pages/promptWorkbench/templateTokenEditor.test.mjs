import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTemplateToEditorValue,
  serializeEditorValueToTemplate,
} from "./templateTokenEditor.ts";

const referenceCatalog = {
  promptId: "novel.chapter.writer",
  items: [
    {
      token: "{{context.book_contract}}",
      key: "book_contract",
      label: "全书合约",
      group: "required_context",
      required: true,
      hasPreviewBlock: true,
    },
    {
      token: "{{input.chapterTitle}}",
      key: "chapterTitle",
      label: "章节标题",
      group: "input",
    },
    {
      token: "{{slot.writer.tonePreference}}",
      key: "writer.tonePreference",
      label: "语气与节奏",
      group: "slot",
    },
  ],
  missingRequiredGroups: [],
};

test("parses context token as semantic tag and keeps original token when serialized", () => {
  const value = parseTemplateToEditorValue("请参考 {{context.book_contract}}", referenceCatalog);
  const token = value[0].children[1];

  assert.equal(token.type, "prompt-token");
  assert.equal(token.kind, "context");
  assert.equal(token.key, "book_contract");
  assert.equal(token.label, "全书合约");
  assert.equal(token.required, true);
  assert.equal(serializeEditorValueToTemplate(value), "请参考 {{context.book_contract}}");
});

test("uses local context labels when reference catalog returns raw keys", () => {
  const backendStyleCatalog = {
    ...referenceCatalog,
    items: [
      {
        token: "{{context.book_contract}}",
        key: "book_contract",
        label: "book_contract",
        group: "required_context",
        required: true,
        hasPreviewBlock: true,
      },
    ],
  };
  const value = parseTemplateToEditorValue("上下文：{{context.book_contract}}", backendStyleCatalog);
  const token = value[0].children[1];

  assert.equal(token.type, "prompt-token");
  assert.equal(token.kind, "context");
  assert.equal(token.label, "全书合约");
  assert.equal(serializeEditorValueToTemplate(value), "上下文：{{context.book_contract}}");
});

test("round trips mixed text, multiple token kinds and line breaks", () => {
  const source = [
    "标题：{{input.chapterTitle}}",
    "语气：{{slot.writer.tonePreference}}",
    "约束：{{context.book_contract}}",
  ].join("\n");
  const value = parseTemplateToEditorValue(source, referenceCatalog);

  assert.equal(value.length, 3);
  assert.equal(value[0].children[1].label, "章节标题");
  assert.equal(value[1].children[1].label, "语气与节奏");
  assert.equal(serializeEditorValueToTemplate(value), source);
});

test("preserves unknown token as an error tag", () => {
  const source = "未知 {{mystery.bad_key}} 仍可保存";
  const value = parseTemplateToEditorValue(source, referenceCatalog);
  const token = value[0].children[1];

  assert.equal(token.type, "prompt-token");
  assert.equal(token.kind, "unknown");
  assert.equal(token.unknown, true);
  assert.equal(token.token, "{{mystery.bad_key}}");
  assert.equal(serializeEditorValueToTemplate(value), source);
});

test("marks unregistered context references as error tags after catalog is loaded", () => {
  const source = "错误上下文 {{context.not_registered}}";
  const value = parseTemplateToEditorValue(source, referenceCatalog);
  const token = value[0].children[1];

  assert.equal(token.type, "prompt-token");
  assert.equal(token.kind, "context");
  assert.equal(token.unknown, true);
  assert.equal(token.token, "{{context.not_registered}}");
  assert.equal(serializeEditorValueToTemplate(value), source);
});
