const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hashSlotDefault,
  resolvePromptOverlays,
} = require("../dist/prompting/slots/slotResolution.js");

const endingHookSlot = {
  key: "endingHook",
  label: "章末钩子",
  kind: "replace",
  default: "官方章末钩子规则",
  maxLength: 200,
};

test("novel official_default masks a broken global override", () => {
  const defaultHash = hashSlotDefault(endingHookSlot.default);
  const overlays = resolvePromptOverlays({
    slotDefs: [endingHookSlot],
    globalOverrides: {
      endingHook: {
        mode: "custom",
        value: "被改坏的全局章末钩子",
        baseHash: defaultHash,
      },
    },
    novelOverrides: {
      endingHook: {
        mode: "official_default",
        value: endingHookSlot.default,
        baseHash: defaultHash,
      },
    },
  });

  assert.equal(overlays.inlineSlots.text("endingHook"), endingHookSlot.default);
  assert.deepEqual(overlays.drift, []);
});

test("removing the novel official_default marker inherits the global override again", () => {
  const defaultHash = hashSlotDefault(endingHookSlot.default);
  const overlays = resolvePromptOverlays({
    slotDefs: [endingHookSlot],
    globalOverrides: {
      endingHook: {
        mode: "custom",
        value: "全局章末钩子覆盖",
        baseHash: defaultHash,
      },
    },
    novelOverrides: {},
  });

  assert.equal(overlays.inlineSlots.text("endingHook"), "全局章末钩子覆盖");
});

test("official_default reports drift when the official default hash changes", () => {
  const overlays = resolvePromptOverlays({
    slotDefs: [
      {
        ...endingHookSlot,
        default: "官方章末钩子新规则",
      },
    ],
    globalOverrides: {},
    novelOverrides: {
      endingHook: {
        mode: "official_default",
        value: endingHookSlot.default,
        baseHash: hashSlotDefault(endingHookSlot.default),
      },
    },
  });

  assert.equal(overlays.inlineSlots.text("endingHook"), "官方章末钩子新规则");
  assert.deepEqual(overlays.drift, ["endingHook"]);
});
