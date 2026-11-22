const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const builderRequire = createRequire(require.resolve("electron-builder/package.json", { paths: [path.resolve(__dirname, "..")] }));
const { validateConfiguration } = builderRequire("app-builder-lib/out/util/config/config");
const { getFileMatchers } = builderRequire("app-builder-lib/out/fileMatcher");
const { AsarPackager } = builderRequire("app-builder-lib/out/asar/asarUtil");
const { Arch } = builderRequire("builder-util");
const asar = builderRequire("@electron/asar");
const config = require("../electron-builder.config.cjs");
const verifyNative = require("../scripts/packaging/verify-native-runtime.cjs");
const { normalizeBuildEnvironment } = require("../scripts/run-electron-builder.cjs");
const { stagedRebuildOptions } = require("../scripts/packaging/rebuild-native.cjs");

test("builder schema accepts DMG/AppImage and preserves Windows targets", async () => {
  await validateConfiguration(config, { debug: () => {} });
  assert.deepEqual(config.win.target.map(target => target.target), ["nsis", "portable"]);
  assert.deepEqual(config.mac.target, [{ target: "dmg", arch: ["x64", "arm64"] }]);
  assert.equal(config.mac.identity, null);
  assert.deepEqual(config.linux.target, [{ target: "AppImage", arch: ["x64"] }]);
  assert.equal(config.npmRebuild, false);
  assert.match(config.beforePack, /rebuild-native/);
  for (const extension of ["ico", "icns", "png"]) assert.ok(fs.statSync(path.join(__dirname, `../builder/app-icon.${extension}`)).size > 0);
  // Disk artifact basenames must stay hyphenated so they match latest*.yml / GitHub Release urls.
  for (const artifactName of [config.mac.artifactName, config.linux.artifactName, config.nsis.artifactName, config.portable.artifactName]) {
    assert.match(artifactName, /^Biz-Novel-Studio-\$\{version\}-/);
    assert.ok(!artifactName.includes(" "), `artifactName must not include spaces: ${artifactName}`);
    assert.ok(!artifactName.includes("${productName}"), "artifactName must not expand productName with spaces");
  }
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

const sqliteFile = "node_modules/better-sqlite3/build/Release/better_sqlite3.node";
const schemaFile = "node_modules/@prisma/client/generated-client/schema.prisma";
const sharpFile = "node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.1.node";
const libvipsFile = "node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.3";

function nativeFixture(t, platform, arch) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anw-native-contract-"));
  const appOutDir = path.join(root, "output");
  const resources = platform === "darwin" ? path.join(appOutDir, "Fixture.app/Contents/Resources") : path.join(appOutDir, "resources");
  const archive = path.join(resources, "app.asar");
  const input = path.join(root, "source");
  const unpackedPath = file => path.join(resources, "app.asar.unpacked", file);
  t.after(() => {
    asar.uncache(archive);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const fixture = {
    [sqliteFile]: binary(platform, arch),
    "node_modules/@prisma/client/generated-client/default.js": "module.exports = {};",
    [schemaFile]: 'datasource db { provider = "sqlite" }',
    ...(platform === "linux" ? { [sharpFile]: binary(platform, arch), [libvipsFile]: binary(platform, arch) } : {}),
  };
  const files = Object.entries(fixture).map(([relative, contents]) => {
    const file = path.join(input, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    return file;
  });
  const context = { appOutDir, electronPlatformName: platform, arch: Arch[arch], packager: { appInfo: { productFilename: "Fixture" } } };
  return {
    context, input, unpackedPath,
    async pack(customBuildOptions = config[{ win32: "win", darwin: "mac", linux: "linux" }[platform]]) {
      const destination = path.join(resources, "app");
      const [matcher] = getFileMatchers(config, "asarUnpack", destination, {
        macroExpander: value => value, customBuildOptions, globalOutDir: appOutDir, defaultSrc: input,
      });
      await new AsarPackager({ info: { getWorkspaceRoot: async () => root } }, {
        defaultDestination: destination,
        resourcePath: resources,
        // Exercise the explicit config without electron-builder's heuristic unpacking.
        options: { smartUnpack: false },
        unpackPattern: matcher.createFilter(),
      }).pack([{ src: input, destination, files, metadata: new Map(files.map(file => [file, fs.lstatSync(file)])) }]);
      asar.uncache(archive);
    },
  };
}

test("packaging hook rejects wrong SQLite architecture and a non-SQLite Prisma client on every platform", async t => {
  for (const [platform, arch] of [["win32", "x64"], ["darwin", "x64"], ["darwin", "arm64"], ["linux", "x64"]]) {
    const { context, input, pack, unpackedPath } = nativeFixture(t, platform, arch);
    await pack();
    await verifyNative(context);
    fs.writeFileSync(unpackedPath(sqliteFile), binary(platform, arch === "x64" ? "arm64" : "x64"));
    await assert.rejects(verifyNative(context), /does not match target/);
    fs.writeFileSync(path.join(input, schemaFile), 'datasource db { provider = "postgresql" }');
    await pack();
    await assert.rejects(verifyNative(context), /generated for SQLite/);
  }
});

test("Linux packaging unpacks Sharp's companion library and rejects the old ASAR-only layout", async t => {
  const { context, pack, unpackedPath } = nativeFixture(t, "linux", "x64");
  await pack({});
  assert.ok(fs.existsSync(unpackedPath(sharpFile)));
  assert.ok(!fs.existsSync(unpackedPath(libvipsFile)));
  await assert.rejects(verifyNative(context), /libvips.*app\.asar\.unpacked/);

  await pack();
  assert.ok(fs.existsSync(unpackedPath(libvipsFile)));
  await verifyNative(context);

  fs.writeFileSync(unpackedPath(libvipsFile), binary("linux", "arm64"));
  await assert.rejects(verifyNative(context), /libvips architecture arm64 does not match target x64/);
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
