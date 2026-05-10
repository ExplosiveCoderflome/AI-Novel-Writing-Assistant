const fs = require("node:fs");
const path = require("node:path");

function assertExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Expected ${description} at ${targetPath}, but it was not found.`);
  }
}

function readJson(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function readPrismaClientVersion(packageDir) {
  const packageJsonPath = path.join(packageDir, "package.json");
  const packageJson = readJson(packageJsonPath);
  return String(packageJson.version || "").trim();
}

function listWorkspaceGeneratedPrismaCandidates(repoRoot) {
  const pnpmVirtualStoreDir = path.join(repoRoot, "node_modules", ".pnpm");
  assertExists(pnpmVirtualStoreDir, "workspace virtual store");

  return fs
    .readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"))
    .map((entry) => {
      const packageDir = path.join(pnpmVirtualStoreDir, entry.name, "node_modules", "@prisma", "client");
      const generatedDir = path.join(pnpmVirtualStoreDir, entry.name, "node_modules", ".prisma");
      return {
        version: fs.existsSync(packageDir) ? readPrismaClientVersion(packageDir) : "",
        generatedDir,
      };
    })
    .filter((candidate) => candidate.version && fs.existsSync(path.join(candidate.generatedDir, "client", "default.js")));
}

function listStagedPrismaClientPackages(stagedNodeModulesDir) {
  const pnpmVirtualStoreDir = path.join(stagedNodeModulesDir, ".pnpm");
  assertExists(pnpmVirtualStoreDir, "staged virtual store");

  const prismaClientStoreEntries = fs
    .readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"));

  if (prismaClientStoreEntries.length === 0) {
    throw new Error("Expected at least one staged @prisma/client package in the virtual store.");
  }

  return prismaClientStoreEntries.map((entry) => {
    const packageDir = path.join(pnpmVirtualStoreDir, entry.name, "node_modules", "@prisma", "client");
    return {
      storeEntryName: entry.name,
      packageDir,
      version: readPrismaClientVersion(packageDir),
    };
  });
}

function findMatchingGeneratedPrismaDir({ stagedPrismaClientVersions, workspaceGeneratedCandidates }) {
  for (const stagedVersion of stagedPrismaClientVersions) {
    const matchedCandidate = workspaceGeneratedCandidates.find((candidate) => candidate.version === stagedVersion);
    if (matchedCandidate) {
      return matchedCandidate.generatedDir;
    }
  }

  throw new Error(
    `No generated Prisma runtime matched staged @prisma/client versions: ${stagedPrismaClientVersions.join(", ")}`,
  );
}

module.exports = {
  assertExists,
  findMatchingGeneratedPrismaDir,
  listStagedPrismaClientPackages,
  listWorkspaceGeneratedPrismaCandidates,
};
