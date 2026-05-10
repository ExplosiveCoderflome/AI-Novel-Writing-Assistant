const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  findMatchingGeneratedPrismaDir,
} = require("../scripts/stage-desktop-prisma.cjs");

test("findMatchingGeneratedPrismaDir selects the generated runtime that matches the staged prisma client version", () => {
  const matchedDir = findMatchingGeneratedPrismaDir({
    stagedPrismaClientVersions: ["7.8.0"],
    workspaceGeneratedCandidates: [
      {
        version: "7.4.2",
        generatedDir: "D:/workspace/node_modules/.pnpm/@prisma+client@7.4.2/node_modules/.prisma",
      },
      {
        version: "7.8.0",
        generatedDir: "D:/workspace/node_modules/.pnpm/@prisma+client@7.8.0/node_modules/.prisma",
      },
    ],
  });

  assert.equal(
    matchedDir,
    "D:/workspace/node_modules/.pnpm/@prisma+client@7.8.0/node_modules/.prisma",
  );
});

test("findMatchingGeneratedPrismaDir throws when no generated runtime matches the staged prisma client version", () => {
  assert.throws(
    () =>
      findMatchingGeneratedPrismaDir({
        stagedPrismaClientVersions: ["7.8.0"],
        workspaceGeneratedCandidates: [
          {
            version: "7.4.2",
            generatedDir: "D:/workspace/node_modules/.pnpm/@prisma+client@7.4.2/node_modules/.prisma",
          },
        ],
      }),
    /No generated Prisma runtime matched staged @prisma\/client versions: 7\.8\.0/,
  );
});

test("server package pins prisma runtime production dependencies to avoid deploy-time version drift", () => {
  const serverPackageJson = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "..", "server", "package.json"),
      "utf8",
    ),
  );

  assert.equal(serverPackageJson.dependencies["@prisma/client"], "7.4.2");
  assert.equal(serverPackageJson.dependencies["@prisma/adapter-better-sqlite3"], "7.4.2");
});
