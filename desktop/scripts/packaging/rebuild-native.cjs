const path = require("node:path");
const { createRequire } = require("node:module");
const desktopDir = path.resolve(__dirname, "../..");
const builderRequire = createRequire(require.resolve("electron-builder/package.json", { paths: [desktopDir] }));
const { Arch } = builderRequire("builder-util");

function stagedRebuildOptions(context) {
  return {
    buildPath: context.appDir,
    projectRootPath: context.appDir,
    electronVersion: context.electronVersion ?? require(require.resolve("electron/package.json", { paths: [desktopDir] })).version,
    platform: context.platform.nodeName,
    arch: context.arch,
    mode: "sequential",
    disablePreGypCopy: true,
  };
}

async function beforePack(context) {
  await builderRequire("@electron/rebuild").rebuild(stagedRebuildOptions({
    appDir: context.packager.info.appDir,
    electronVersion: context.packager.config.electronVersion,
    platform: { nodeName: context.electronPlatformName },
    arch: Arch[context.arch],
  }));
}

module.exports = beforePack;
module.exports.stagedRebuildOptions = stagedRebuildOptions;
