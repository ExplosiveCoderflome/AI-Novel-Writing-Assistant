const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const builderRequire = createRequire(require.resolve("electron-builder/package.json", { paths: [path.resolve(__dirname, "../..")] }));
const { Arch } = builderRequire("builder-util");
const asar = builderRequire("@electron/asar");
const elfMagic = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

function binaryArchitecture(bytes) {
  if (bytes.subarray(0, 2).toString() === "MZ") {
    const machine = bytes.readUInt16LE(bytes.readUInt32LE(0x3c) + 4);
    if (machine === 0x8664) return "x64";
    if (machine === 0xaa64) return "arm64";
  } else if (bytes.readUInt32LE(0) === 0xfeedfacf) {
    if (bytes.readUInt32LE(4) === 0x01000007) return "x64";
    if (bytes.readUInt32LE(4) === 0x0100000c) return "arm64";
  } else if (bytes.subarray(0, 4).equals(elfMagic)) {
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

function verifyUnpackedElf(unpacked, entry, name, expected) {
  const filename = path.join(unpacked, entry);
  if (!fs.statSync(filename, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Packaged ${name} must be present on disk in app.asar.unpacked: ${filename}`);
  }
  const bytes = fs.readFileSync(filename);
  if (!bytes.subarray(0, 4).equals(elfMagic)) throw new Error(`Packaged ${name} is not an ELF binary: ${filename}`);
  const actual = binaryArchitecture(bytes);
  if (actual !== expected) throw new Error(`${name} architecture ${actual} does not match target ${expected}: ${filename}`);
}

function verifyLinuxSharpRuntime(unpacked, entries, expected) {
  const sharpPackage = `sharp-linux-${expected}`;
  // Sharp ships the prebuilt addon with its version in the filename
  // (sharp-linux-x64-0.35.1.node); match both the versioned and the bare name.
  const modulePattern = new RegExp(`/@img/${sharpPackage}/lib/${sharpPackage}(?:-\\d+\\.\\d+\\.\\d+)?\\.node$`);
  const modules = entries.filter(entry => modulePattern.test(entry));
  if (!modules.length) throw new Error(`Packaged Linux Sharp module @img/${sharpPackage} is missing`);
  for (const module of modules) {
    verifyUnpackedElf(unpacked, module, "Sharp", expected);
    // Sharp's RPATH is relative to the addon, including in nested node_modules trees.
    const libDir = path.posix.join(path.posix.dirname(module), "../..", `sharp-libvips-linux-${expected}`, "lib");
    const libraries = entries.filter(entry => entry.startsWith(`${libDir}/`) && /^libvips-cpp\.so(?:\.\d+)+$/.test(entry.slice(libDir.length + 1)));
    if (!libraries.length) throw new Error(`Packaged Sharp libvips shared library is missing from ${libDir}`);
    for (const library of libraries) verifyUnpackedElf(unpacked, library, "Sharp libvips", expected);
  }
}

async function verifyNativeRuntime(context) {
  const resources = context.electronPlatformName === "darwin"
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  const expected = Arch[context.arch];
  const unpacked = path.join(resources, "app.asar.unpacked");
  const binaries = findSqliteBinaries(unpacked);
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
  const isLinux = context.electronPlatformName === "linux";
  if (isLinux) verifyLinuxSharpRuntime(unpacked, entries, expected);
  console.log(`[desktop-native] verified SQLite ${expected} and Prisma runtime${isLinux ? ", plus Linux Sharp and libvips" : ""}`);
}

module.exports = verifyNativeRuntime;
module.exports.binaryArchitecture = binaryArchitecture;
