const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { prisma } = require("../dist/db/prisma.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("Sandbox API - custom property schema creation and listing", async () => {
  // 1. Back up original prisma methods
  const original = {
    worldFindFirst: prisma.world.findFirst,
    schemaFindMany: prisma.worldCustomPropertySchema.findMany,
    schemaUpsert: prisma.worldCustomPropertySchema.upsert
  };

  // Mock Prisma methods
  prisma.world.findFirst = async () => ({
    id: "mock-world-id",
    name: "Sandbox Integration Test World",
    status: "draft"
  });

  let mockSchemas = [];

  prisma.worldCustomPropertySchema.findMany = async ({ where }) => {
    return mockSchemas.filter(s => s.worldId === where.worldId);
  };

  prisma.worldCustomPropertySchema.upsert = async ({ where, create, update }) => {
    const existingIndex = mockSchemas.findIndex(
      s => s.worldId === where.worldId_targetType_propertyName.worldId &&
           s.targetType === where.worldId_targetType_propertyName.targetType &&
           s.propertyName === where.worldId_targetType_propertyName.propertyName
    );

    const record = {
      id: "schema-mock-id",
      worldId: where.worldId_targetType_propertyName.worldId,
      targetType: where.worldId_targetType_propertyName.targetType,
      propertyName: where.worldId_targetType_propertyName.propertyName,
      propertyLabel: create.propertyLabel,
      dataType: create.dataType,
      typeMetadata: create.typeMetadata || null,
      description: create.description || null,
      defaultValue: create.defaultValue || null,
      aiGuidance: create.aiGuidance || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (existingIndex > -1) {
      mockSchemas[existingIndex] = record;
    } else {
      mockSchemas.push(record);
    }
    return record;
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const worldId = "mock-world-id";

    // 2. Test POST /api/worlds/:worldId/sandbox/schema
    const postRes = await fetch(`http://127.0.0.1:${port}/api/worlds/${worldId}/sandbox/schema`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        targetType: "character",
        propertyName: "sanity",
        propertyLabel: "理智值",
        dataType: "number",
        typeMetadata: '{"min": 0, "max": 100}',
        description: "心智防御防线，受打击降低，低至30时产生幻觉",
        defaultValue: "100",
        aiGuidance: "描写林黛玉的心智恍惚和自言自语细节"
      })
    });

    assert.equal(postRes.status, 200);
    const postPayload = await postRes.json();
    assert.equal(postPayload.success, true);
    assert.equal(postPayload.data.propertyName, "sanity");
    assert.equal(postPayload.data.propertyLabel, "理智值");
    assert.equal(postPayload.data.dataType, "number");

    // 3. Test GET /api/worlds/:worldId/sandbox/schema
    const getRes = await fetch(`http://127.0.0.1:${port}/api/worlds/${worldId}/sandbox/schema`);
    assert.equal(getRes.status, 200);
    const getPayload = await getRes.json();
    assert.equal(getPayload.success, true);
    assert.ok(Array.isArray(getPayload.data));
    
    // Find the sanity schema in the returned list
    const sanitySchema = getPayload.data.find(s => s.propertyName === "sanity");
    assert.ok(sanitySchema, "Sanity custom property schema should be found in GET response");
    assert.equal(sanitySchema.propertyLabel, "理智值");

  } finally {
    // Restore original prisma methods
    prisma.world.findFirst = original.worldFindFirst;
    prisma.worldCustomPropertySchema.findMany = original.schemaFindMany;
    prisma.worldCustomPropertySchema.upsert = original.schemaUpsert;

    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
