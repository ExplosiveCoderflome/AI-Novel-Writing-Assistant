import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "../../db/prisma";
import { resolveGeneratedImagesRoot } from "../../runtime/appPaths";
import { parseImageAssetMetadata, removeStoredImageAssetFile } from "./imageAssetStorage";

export interface NovelImageFile {
  id: string;
  taskId: string;
  sceneType: string;
  novelId: string | null;
  baseCharacterId: string | null;
  bookAnalysisCharacterId: string | null;
  url: string;
  metadata: string | null;
}

const segment = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "asset";

export async function removeOwnedNovelImageFiles(images: NovelImageFile[]): Promise<void> {
  for (const image of images) {
    const metadata = parseImageAssetMetadata(image.metadata);
    const directory = image.sceneType === "novel_cover" ? "novel-covers" : image.sceneType === "character" ? "characters" : "book-analysis-characters";
    const owner = image.baseCharacterId ?? image.novelId ?? image.bookAnalysisCharacterId ?? image.taskId;
    const prefix = `${directory}/${segment(owner)}/${segment(image.taskId)}/`;
    const key = metadata.storageKey;
    const localPath = metadata.localPath ?? (path.isAbsolute(image.url) ? image.url : null);
    const root = path.resolve(resolveGeneratedImagesRoot());
    const relative = key ?? (localPath ? path.relative(root, path.resolve(localPath)).split(path.sep).join("/") : "");
    // Only a generated file in this asset's exact owner/task directory is eligible.
    if (!relative.startsWith(prefix) || relative.slice(prefix.length).includes("/") || relative.includes("..")) continue;
    const shared = await prisma.imageAsset.findFirst({ where: { OR: [
      { url: image.url },
      ...(localPath ? [{ metadata: { contains: JSON.stringify(localPath).slice(1, -1) } }] : []),
      ...(key ? [{ metadata: { contains: JSON.stringify(key).slice(1, -1) } }] : []),
    ] }, select: { id: true } });
    if (shared) continue;
    if (localPath && !key) {
      try {
        const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(localPath)]);
        const realRelative = path.relative(realRoot, realFile).split(path.sep).join("/");
        if (realRelative !== relative) continue; // Includes symlink escapes and alternate owners.
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
    }
    await removeStoredImageAssetFile({ url: image.url, metadata: image.metadata });
  }
}
