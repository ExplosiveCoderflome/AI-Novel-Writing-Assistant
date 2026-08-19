const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "better-sqlite3") {
    const MockDb = function () {
      this.pragma = () => "wal";
      this.defaultSafeIntegers = () => {};
      this.prepare = () => {
        const stmt = {
          run: () => ({ changes: 1, lastInsertRowid: 1 }),
          all: () => [],
          get: () => {
            const mockObj = {
              id: "mock-id",
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
            return new Proxy(mockObj, {
              get: (target, prop) => {
                if (prop in target) return target[prop];
                if (typeof prop === "string" && (prop.endsWith("Id") || prop === "id")) {
                  return "mock-id";
                }
                return null;
              }
            });
          },
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
