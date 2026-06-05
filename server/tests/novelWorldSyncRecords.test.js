const test = require("node:test");
const assert = require("node:assert/strict");

test("novelWorldSyncRecords module exports sync history loader", async () => {
  const mod = await import("../dist/services/novel/worldContext/novelWorldSyncRecords.js");
  assert.equal(typeof mod.listNovelWorldSyncRecords, "function");
  const records = await mod.listNovelWorldSyncRecords(null);
  assert.deepEqual(records, []);
});
