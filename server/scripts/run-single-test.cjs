const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "better-sqlite3") {
    const MockDb = function () {
      this.pragma = () => "wal";
      this.defaultSafeIntegers = () => {};
      this.prepare = () => {
        const mockObj = {
          id: "mock-world-id",
          name: "Sandbox Test World",
          createdAt: new Date(),
          updatedAt: new Date(),
          bundleJson: "{}",
          visualAnchor: "{}",
          stylePreset: "{}",
          sheetData: "{}",
          dialogues: "[]",
          characterRefs: "[]",
          layoutData: "{}",
          imageData: "{}",
          letteredData: "{}",
          motionData: "{}"
        };

        const proxyObj = new Proxy(mockObj, {
          get: (target, prop) => {
            if (prop in target) return target[prop];
            if (typeof prop === "string" && (prop.endsWith("Id") || prop === "id")) {
              return "mock-id";
            }
            return null;
          }
        });

        const stmt = {
          run: () => ({ changes: 1, lastInsertRowid: 1 }),
          all: () => [proxyObj], // Returns array containing mock object for findFirst()
          get: () => proxyObj,
          bind: function () { return this; }
        };
        return stmt;
      };
      this.close = () => {};
    };
    return MockDb;
  }
  return originalRequire.apply(this, arguments);
};

const path = require("path");
const testFile = process.argv[2];
if (!testFile) {
  console.error("Please specify a test file");
  process.exit(1);
}
require(path.resolve(testFile));
