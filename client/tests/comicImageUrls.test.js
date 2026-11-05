import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { assetUrl } from "../src/lib/constants.ts";

function loadComicUrls(apiBaseUrl) {
  const source = fs.readFileSync(new URL("../src/api/comic.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const exports = {};
  new Function("require", "exports", outputText)(name => {
    if (name === "@/lib/constants") return { assetUrl: path => assetUrl(path, apiBaseUrl) };
    if (name === "./client") return { apiClient: {} };
    throw new Error(`Unexpected comic dependency: ${name}`);
  }, exports);
  return exports;
}

test("every comic image builder respects the desktop API origin and web proxy", () => {
  const paths = {
    characterSheetImageUrl: "/character-images/id/sheet",
    characterExpressionImageUrl: "/character-images/id/expressions",
    characterFaceImageUrl: "/character-images/id/face",
    panelImageUrl: "/panel-images/id/panel",
    panelLetteredImageUrl: "/panel-images/id/lettered",
    characterAssetImageUrl: "/character-assets/id/image",
    comicSceneImageUrl: "/scenes/id/image",
  };
  for (const [base, origin] of [["http://127.0.0.1:43123/api", "http://127.0.0.1:43123"], ["/api", ""]]) {
    const builders = loadComicUrls(base);
    for (const [name, path] of Object.entries(paths)) assert.equal(builders[name]("id"), `${origin}/api/comic${path}`, name);
  }
});
