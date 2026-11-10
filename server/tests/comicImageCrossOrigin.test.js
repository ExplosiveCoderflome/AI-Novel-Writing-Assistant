const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../dist/app.js");
const { comicCharacterImageService } = require("../dist/services/comic/ComicCharacterImageService.js");
const { comicPanelImageService } = require("../dist/services/comic/ComicPanelImageService.js");
const { comicBubbleLayoutService } = require("../dist/services/comic/ComicBubbleLayoutService.js");
const { comicCharacterAssetService } = require("../dist/services/comic/ComicCharacterAssetService.js");
const { comicSceneService } = require("../dist/services/comic/ComicSceneService.js");
const { comicExportService } = require("../dist/services/comic/ComicExportService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

test("comic image responses allow desktop file origins without changing API CORP", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "comic-corp-"));
  const filePath = path.join(directory, "image.png");
  const buffer = Buffer.from("png-test");
  fs.writeFileSync(filePath, buffer);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const originals = new Map([
    [comicCharacterImageService, new Map()],
    [comicPanelImageService, new Map()],
    [comicBubbleLayoutService, new Map()],
    [comicCharacterAssetService, new Map()],
    [comicSceneService, new Map()],
    [comicExportService, new Map()],
  ]);
  const replace = (service, method, implementation) => {
    originals.get(service).set(method, service[method]);
    service[method] = implementation;
  };
  t.after(() => {
    for (const [service, methods] of originals) {
      for (const [method, implementation] of methods) service[method] = implementation;
    }
  });

  const resolvedFile = { filePath, mimeType: "image/png" };
  for (const method of ["resolveSheetFile", "resolveExpressionFile", "resolveFaceRegionFile", "resolveArchivedSheetFile"]) {
    replace(comicCharacterImageService, method, async () => resolvedFile);
  }
  replace(comicPanelImageService, "getPanelImageFile", async () => ({ buffer, ext: "png" }));
  replace(comicBubbleLayoutService, "getLetteredImageFile", async () => buffer);
  replace(comicCharacterAssetService, "serveAssetImage", async () => resolvedFile);
  replace(comicSceneService, "serveSceneImage", async () => resolvedFile);
  replace(comicExportService, "getArtifactFile", async () => ({ buffer, ext: "png" }));

  const server = http.createServer(createApp());
  const port = await listen(server);
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const imagePaths = [
    "/api/comic/character-images/character-1/sheet",
    "/api/comic/character-images/character-1/expressions",
    "/api/comic/character-images/character-1/face",
    "/api/comic/character-images/character-1/sheet/v2",
    "/api/comic/panel-images/panel-1/panel",
    "/api/comic/panel-images/panel-1/lettered",
    "/api/comic/character-assets/asset-1/image",
    "/api/comic/scenes/scene-1/image",
    "/api/comic/export-jobs/job-1/artifacts/page.png",
  ];
  for (const imagePath of imagePaths) {
    const response = await fetch(`http://127.0.0.1:${port}${imagePath}`, { headers: { Origin: "null" } });
    assert.equal(response.status, 200, imagePath);
    assert.equal(response.headers.get("cross-origin-resource-policy"), "cross-origin", imagePath);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), buffer, imagePath);
  }

  const apiResponse = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Origin: "null" } });
  assert.equal(apiResponse.headers.get("cross-origin-resource-policy"), "same-origin");
});
