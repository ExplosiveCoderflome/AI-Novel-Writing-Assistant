const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");

// Mock Express request, response and next
function mockExpress() {
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  const next = (err) => {
    if (err) throw err;
  };
  return { res, next };
}

test("Sandbox Tick Route - Success compute and fallback handling", async () => {
  // Mock dependencies
  const original = {
    worldFindUnique: prisma.world.findUnique,
    characterFindMany: prisma.character.findMany,
    snapshotCreate: prisma.sandboxSnapshot.create,
    chronologyCreate: prisma.sandboxChronology.create,
    propertySchemasFindMany: prisma.worldCustomPropertySchema.findMany,
    conflictSchemasFindMany: prisma.worldCustomConflictSchema.findMany,
    locationUpsert: prisma.location.upsert
  };

  prisma.world.findUnique = async () => ({
    id: "world-123",
    structureJson: JSON.stringify({
      locations: [
        { id: "loc_1", name: "大观园", elevation: 50 },
        { id: "loc_2", name: "贾母房", elevation: 45 }
      ]
    })
  });

  prisma.character.findMany = async () => [
    { id: "char_1", name: "林黛玉", currentLocation: "loc_1" }
  ];

  prisma.worldCustomPropertySchema.findMany = async () => [];
  prisma.worldCustomConflictSchema.findMany = async () => [];
  prisma.location.upsert = async ({ where, create }) => ({ id: where.id, ...create });

  let snapshotCreated = false;
  prisma.sandboxSnapshot.create = async ({ data }) => {
    snapshotCreated = true;
    return { id: "snap-123", ...data };
  };

  let chronologyCreated = false;
  prisma.sandboxChronology.create = async ({ data }) => {
    chronologyCreated = true;
    return { id: "chron-123", ...data };
  };

  const { registerSandboxRoutes } = require("../dist/modules/setup/world/http/sandboxRoutes.js");
  const express = require("express");
  const router = express.Router();
  registerSandboxRoutes(router);

  // Find tick route
  const tickRoute = router.stack.find(
    (layer) => layer.route && layer.route.path === "/:worldId/sandbox/tick"
  );

  assert.ok(tickRoute, "Tick route should be registered");

  const handler = tickRoute.route.stack[tickRoute.route.stack.length - 1].handle;
  const { res, next } = mockExpress();

  const req = {
    params: { worldId: "world-123" },
    body: {
      novelId: "novel-123",
      branchId: "branch-123",
      tickIndex: 0
    }
  };

  try {
    await handler(req, res, next);
    
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.success);
    assert.ok(res.body.data.locations.length > 0);
    assert.ok(res.body.data.characters.length > 0);
    assert.ok(snapshotCreated, "SandboxSnapshot should be created in DB");
    assert.ok(chronologyCreated, "SandboxChronology should be created in DB");
  } finally {
    // Restore mocks
    prisma.world.findUnique = original.worldFindUnique;
    prisma.character.findMany = original.characterFindMany;
    prisma.sandboxSnapshot.create = original.snapshotCreate;
    prisma.sandboxChronology.create = original.chronologyCreate;
    prisma.worldCustomPropertySchema.findMany = original.propertySchemasFindMany;
    prisma.worldCustomConflictSchema.findMany = original.conflictSchemasFindMany;
    prisma.location.upsert = original.locationUpsert;
  }
});
