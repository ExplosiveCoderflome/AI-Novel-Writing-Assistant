const test = require("node:test");
const assert = require("node:assert/strict");
const { argusRuntimeProjectionService } = require("../../dist/services/novel/director/projections/argusRuntimeProjection.js");

test("GA-Argus ArgusRuntimeProjection Unit Tests", async (t) => {
  await t.test("returns null when no active contract exists for novel", async () => {
    const projection = await argusRuntimeProjectionService.getProjection("non-existent-novel-999");
    assert.equal(projection, null);
  });
});
