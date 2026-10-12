const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../../desktop/src/runtime/server.ts"), "utf8");
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;

function launchEnvironment(mode, environment) {
  let launched;
  const launch = (_entry, _args, options) => {
    launched = options.env;
    return {on() {}, stdout: null, stderr: null, exitCode: null, killed: false};
  };
  const sandbox = {
    exports: {},
    process: {...process, env: {...environment}},
    require(name) {
      if (name === "electron") return {utilityProcess: {fork: launch}};
      if (name === "node:child_process") return {spawn: launch};
      if (name === "./logging") return {appendDesktopLog() {}, logDesktopError() {}};
      if (name === "./paths") return {
        resolveDesktopAppDataDir: () => "isolated-desktop-data",
        resolveDesktopResourcesDir: () => "isolated-desktop-resources",
        resolvePackagedServerEntry: () => "server-entry.js",
        resolveWorkspaceRoot: () => "isolated-workspace",
      };
      return require(name);
    },
  };
  vm.runInNewContext(`${compiled}\nstart${mode}ManagedServer(3210);`, sandbox);
  return launched;
}

for (const mode of ["Workspace", "Packaged"]) {
  test(`${mode} desktop enables director V2 without changing the database boundary`, () => {
    const env = launchEnvironment(mode, {});
    assert.equal(env.DIRECTOR_NEXT_ENABLED, "true");
    assert.equal(env.AI_NOVEL_RUNTIME, "desktop");
    assert.equal(env.AI_NOVEL_APP_DATA_DIR, "isolated-desktop-data");
    assert.equal(env.HOST, "127.0.0.1");
    assert.equal(env.ALLOW_LAN, "false");
  });

  test(`${mode} desktop preserves an explicit V2 rollout choice`, () => {
    for (const flag of ["false", "0", "true", "1"]) {
      assert.equal(launchEnvironment(mode, {DIRECTOR_NEXT_ENABLED: flag}).DIRECTOR_NEXT_ENABLED, flag);
    }
  });
}
