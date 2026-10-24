const { runDesktopPublish } = require("./publish-desktop-target.cjs");

try {
  runDesktopPublish({
    label: "publish:desktop:release",
    scriptName: "publish-desktop-release",
    channel: "release",
    argv: process.argv.slice(2),
  });
} catch (error) {
  console.error("[publish:desktop:release] failed.", error);
  process.exit(1);
}
