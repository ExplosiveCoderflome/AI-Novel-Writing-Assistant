const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const builderRequire = createRequire(require.resolve("electron-builder/package.json", { paths: [path.resolve(__dirname, "..")] }));
const { validateConfiguration } = builderRequire("app-builder-lib/out/util/config/config");
const { Arch } = builderRequire("builder-util");
const asar = builderRequire("@electron/asar");
const verifyNative = require("../scripts/packaging/verify-native-runtime.cjs");
const { normalizeBuildEnvironment } = require("../scripts/run-electron-builder.cjs");
const { stagedRebuildOptions } = require("../scripts/packaging/rebuild-native.cjs");

test("builder schema accepts DMG/AppImage and preserves Windows targets", async () => {
  const config = require("../electron-builder.config.cjs");
  await validateConfiguration(config, { debug: () => {} });
  assert.deepEqual(config.win.target.map(target => target.target), ["nsis", "portable"]);
  assert.deepEqual(config.mac.target, [{ target: "dmg", arch: ["x64", "arm64"] }]);
  assert.equal(config.mac.identity, null);
  assert.deepEqual(config.linux.target, [{ target: "AppImage", arch: ["x64"] }]);
  assert.equal(config.npmRebuild, false);
  assert.match(config.beforePack, /rebuild-native/);
  for (const extension of ["ico", "icns", "png"]) assert.ok(fs.statSync(path.join(__dirname, `../builder/app-icon.${extension}`)).size > 0);
  assert.throws(() => normalizeBuildEnvironment({ AI_NOVEL_RELEASE_CHANNEL: "release" }, ["--win"]), /signing/);
  assert.equal(normalizeBuildEnvironment({ AI_NOVEL_RELEASE_CHANNEL: "release" }, ["--mac"]).AI_NOVEL_RELEASE_CHANNEL, "release");
  assert.equal(normalizeBuildEnvironment({ AI_NOVEL_RELEASE_CHANNEL: "release" }, ["--linux"]).AI_NOVEL_RELEASE_CHANNEL, "release");
});

function binary(platform, arch) {
  const bytes = Buffer.alloc(256);
  if (platform === "darwin") { bytes.writeUInt32LE(0xfeedfacf); bytes.writeUInt32LE(arch === "x64" ? 0x01000007 : 0x0100000c, 4); }
  if (platform === "linux") { bytes.set([0x7f, 0x45, 0x4c, 0x46]); bytes.writeUInt16LE(arch === "x64" ? 62 : 183, 18); }
  if (platform === "win32") { bytes.write("MZ"); bytes.writeUInt32LE(64, 0x3c); bytes.writeUInt16LE(arch === "x64" ? 0x8664 : 0xaa64, 68); }
  return bytes;
}

test("packaging hook rejects wrong SQLite architecture and a non-SQLite Prisma client on every platform", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anw-native-contract-"));
  for (const [platform, arch] of [["win32", "x64"], ["darwin", "x64"], ["darwin", "arm64"], ["linux", "x64"]]) {
    const appOutDir = path.join(root, `${platform}-${arch}`);
    const resources = platform === "darwin" ? path.join(appOutDir, "Fixture.app/Contents/Resources") : path.join(appOutDir, "resources");
    const nativeDir = path.join(resources, "app.asar.unpacked/node_modules/better-sqlite3/build/Release");
    fs.mkdirSync(nativeDir, { recursive: true });
    const nativePath = path.join(nativeDir, "better_sqlite3.node");
    fs.writeFileSync(nativePath, binary(platform, arch));
    const input = path.join(root, `source-${platform}-${arch}`);
    const client = path.join(input, "node_modules/@prisma/client/generated-client");
    fs.mkdirSync(client, { recursive: true });
    fs.writeFileSync(path.join(client, "default.js"), "module.exports = {};");
    fs.writeFileSync(path.join(client, "schema.prisma"), 'datasource db { provider = "sqlite" }');
    const archive = path.join(resources, "app.asar");
    await asar.createPackage(input, archive);
    const context = { appOutDir, electronPlatformName: platform, arch: Arch[arch], packager: { appInfo: { productFilename: "Fixture" } } };
    await verifyNative(context);
    fs.writeFileSync(nativePath, binary(platform, arch === "x64" ? "arm64" : "x64"));
    await assert.rejects(verifyNative(context), /does not match target/);
    fs.writeFileSync(nativePath, binary(platform, arch));
    fs.writeFileSync(path.join(client, "schema.prisma"), 'datasource db { provider = "postgresql" }');
    // A separate archive path avoids asar's process cache of archive headers.
    asar.uncache(archive);
    await asar.createPackage(input, archive);
    asar.uncache(archive);
    await assert.rejects(verifyNative(context), /generated for SQLite/);
  }
});

test("Mac updater is disabled without touching the update service", async () => {
  const snapshots = [];
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../dist/runtime/updater.js"), "utf8"), {
    exports, process: { platform: "darwin", env: {} },
    require: name => {
      if (name === "electron-updater") return { autoUpdater: new Proxy({}, { get: () => { throw new Error("Mac must not access updater"); } }) };
      if (name === "./state") return { createUpdaterSnapshot: input => input, desktopUpdaterStore: { setSnapshot: input => snapshots.push(input) } };
      if (name === "./logging") return {};
      return require(name);
    },
  });
  const controller = exports.initializeDesktopUpdater({ isPackaged: true, isPortable: false, currentVersion: "0.7.1", updateChannel: "release" });
  await controller.checkForUpdates();
  controller.scheduleInitialCheck();
  controller.quitAndInstall();
  assert.equal(snapshots[0].status, "disabled");
  assert.match(snapshots[0].message, /Mac/);
});

test("window icons follow the runtime platform", () => {
  for (const [platform, extension] of [["win32", "ico"], ["darwin", "icns"], ["linux", "png"]]) {
    const exports = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../dist/runtime/paths.js"), "utf8"), {
      exports, require, __dirname: path.resolve(__dirname, "../dist/runtime"),
      process: { platform, env: {}, resourcesPath: path.join(os.tmpdir(), "anw-icon-resources") },
    });
    assert.ok(exports.resolveDesktopWindowIcon().endsWith(`app-icon.${extension}`));
  }
});

test("native rebuild stays inside the staged app for both target architectures", () => {
  for (const arch of ["x64", "arm64"]) {
    const options = stagedRebuildOptions({appDir: "/stage/app", electronVersion: "35.7.5", platform: {nodeName: "darwin"}, arch});
    assert.equal(options.projectRootPath, "/stage/app");
    assert.equal(options.buildPath, "/stage/app");
    assert.equal(options.arch, arch);
    assert.equal(options.electronVersion, "35.7.5");
  }
});
