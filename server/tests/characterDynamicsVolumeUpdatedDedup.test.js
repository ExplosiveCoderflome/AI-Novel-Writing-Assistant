const test = require("node:test");
const assert = require("node:assert/strict");

const { EventBus } = require("../dist/events/EventBus.js");
const { registerNovelEventHandlers } = require("../dist/events/handlers/registerNovelEventHandlers.js");
const dynamicsModule = require("../dist/services/novel/dynamics/CharacterDynamicsService.js");

test("volume:updated events coalesce rebuilds while one rebuild is already running", async () => {
  const originalRebuildDynamics = dynamicsModule.CharacterDynamicsService.prototype.rebuildDynamics;
  const eventBus = new EventBus();
  const rebuildCalls = [];
  let releaseFirstRun;
  let firstRunStarted = false;

  dynamicsModule.CharacterDynamicsService.prototype.rebuildDynamics = async function rebuildDynamics(novelId, options) {
    rebuildCalls.push({ novelId, options });
    if (!firstRunStarted) {
      firstRunStarted = true;
      await new Promise((resolve) => {
        releaseFirstRun = resolve;
      });
    }
  };

  registerNovelEventHandlers(eventBus);

  try {
    const firstEmit = eventBus.emit({
      type: "volume:updated",
      payload: { novelId: "novel-1" },
    });

    await new Promise((resolve) => setImmediate(resolve));

    const secondEmit = eventBus.emit({
      type: "volume:updated",
      payload: { novelId: "novel-1" },
    });
    const thirdEmit = eventBus.emit({
      type: "volume:updated",
      payload: { novelId: "novel-1" },
    });

    releaseFirstRun();
    await Promise.all([firstEmit, secondEmit, thirdEmit]);

    assert.deepEqual(rebuildCalls, [
      {
        novelId: "novel-1",
        options: { sourceType: "volume_projection" },
      },
      {
        novelId: "novel-1",
        options: { sourceType: "volume_projection" },
      },
    ]);
  } finally {
    dynamicsModule.CharacterDynamicsService.prototype.rebuildDynamics = originalRebuildDynamics;
  }
});
