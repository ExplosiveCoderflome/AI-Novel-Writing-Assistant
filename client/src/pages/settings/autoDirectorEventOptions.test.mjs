import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_DIRECTOR_EVENT_OPTIONS,
  buildAutoDirectorChannelDraft,
  summarizeSelectedAutoDirectorEvents,
} from "./autoDirectorEventOptions.ts";

test("auto director event options expose Chinese labels and preserve event codes in drafts", () => {
  assert.equal(AUTO_DIRECTOR_EVENT_OPTIONS[0]?.code, "auto_director.approval_required");
  assert.equal(AUTO_DIRECTOR_EVENT_OPTIONS[0]?.label, "自动继续待处理");

  const draft = buildAutoDirectorChannelDraft({
    baseUrl: "https://book.example.com",
    dingtalk: {
      webhookUrl: "https://relay.example.test/dingtalk",
      callbackToken: "ding-token",
      operatorMapJson: "{\"ding_user_1\":\"user_1\"}",
      eventTypes: ["auto_director.approval_required", "auto_director.exception"],
    },
    wecom: {
      webhookUrl: "https://relay.example.test/wecom",
      callbackToken: "wecom-token",
      operatorMapJson: "{\"wecom_user_1\":\"user_1\"}",
      eventTypes: ["auto_director.completed"],
    },
  });

  assert.deepEqual(draft.dingtalk.eventTypes, [
    "auto_director.approval_required",
    "auto_director.exception",
  ]);
  assert.deepEqual(draft.wecom.eventTypes, ["auto_director.completed"]);
});

test("auto director event summary renders Chinese labels instead of raw codes", () => {
  assert.equal(summarizeSelectedAutoDirectorEvents([]), "未订阅事件");
  assert.equal(
    summarizeSelectedAutoDirectorEvents(["auto_director.approval_required"]),
    "自动继续待处理",
  );
  assert.equal(
    summarizeSelectedAutoDirectorEvents([
      "auto_director.approval_required",
      "auto_director.exception",
      "auto_director.completed",
    ]),
    "自动继续待处理、运行异常 等 3 项",
  );
});
