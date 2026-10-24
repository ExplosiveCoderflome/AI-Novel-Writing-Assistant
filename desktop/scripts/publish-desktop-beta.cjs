const { runDesktopPublish } = require("./publish-desktop-target.cjs");

try {
  runDesktopPublish({
    label: "publish:desktop:beta",
    scriptName: "publish-desktop-beta",
    channel: "beta",
    winTargets: ["nsis"],
    argv: process.argv.slice(2),
  });
} catch (error) {
  console.error("[publish:desktop:beta] failed.", error);
  process.exit(1);
}
