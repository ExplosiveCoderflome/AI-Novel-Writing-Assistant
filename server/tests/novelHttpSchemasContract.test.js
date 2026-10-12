const assert = require("node:assert/strict");
const test = require("node:test");

const { volumeDocumentSchema } = require("../dist/modules/novel/http/novelHttpSchemas.js");

test("volume workspace schema keeps critique-only saves from clearing volumes", () => {
  const parsed = volumeDocumentSchema.parse({ critiqueReport: null });

  assert.equal(Object.hasOwn(parsed, "volumes"), false);
});
