const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const builderRequire = createRequire(require.resolve("electron-builder/package.json", { paths: [path.resolve(__dirname, "../..")] }));
const { Arch } = builderRequire("builder-util");
const asar = builderRequire("@electron/asar");

function binaryArchitecture(bytes) {
  if (bytes.subarray(0, 2).toString() === "MZ") {
    const machine = bytes.readUInt16LE(bytes.readUInt32LE(0x3c) + 4);
    if (machine === 0x8664) return "x64";
    if (machine === 0xaa64) return "arm64";
  } else if (bytes.readUInt32LE(0) === 0xfeedfacf) {
    if (bytes.readUInt32LE(4) === 0x01000007) return "x64";
    if (bytes.readUInt32LE(4) === 0x0100000c) return "arm64";
  } else if (bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    if (bytes.readUInt16LE(18) === 62) return "x64";
    if (bytes.readUInt16LE(18) === 183) return "arm64";
  }
  throw new Error("Unsupported native binary architecture");
}

function findSqliteBinaries(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? findSqliteBinaries(filename) : entry.name === "better_sqlite3.node" ? [filename] : [];
  });
}

async function verifyNativeRuntime(context) {
  const resources = context.electronPlatformName === "darwin"
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  const expected = Arch[context.arch];
  const binaries = findSqliteBinaries(path.join(resources, "app.asar.unpacked"));
  if (!binaries.length) throw new Error("Packaged SQLite native module is missing");
  for (const filename of binaries) {
    const actual = binaryArchitecture(fs.readFileSync(filename));
    if (actual !== expected) throw new Error(`SQLite architecture ${actual} does not match target ${expected}: ${filename}`);
  }
  const entries = asar.listPackage(path.join(resources, "app.asar")).map(entry => entry.replace(/\\/g, "/"));
  if (!entries.some(entry => /@prisma\/client\/generated-client\/default\.js$/.test(entry))) {
    throw new Error("Packaged generated Prisma client is missing");
  }
  const schemaEntry = entries.find(entry => /@prisma\/client\/generated-client\/schema\.prisma$/.test(entry));
  if (!schemaEntry || !/provider\s*=\s*"sqlite"/.test(asar.extractFile(path.join(resources, "app.asar"), schemaEntry.replace(/^\//, "").split("/").join(path.sep)).toString())) {
    throw new Error("Desktop Prisma client must be generated for SQLite");
  }
  console.log(`[desktop-native] verified SQLite ${expected} and Prisma runtime`);
}

module.exports = verifyNativeRuntime;
module.exports.binaryArchitecture = binaryArchitecture;
