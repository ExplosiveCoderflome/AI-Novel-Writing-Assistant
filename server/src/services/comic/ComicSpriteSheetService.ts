/**
 * ComicSpriteSheetService
 * 在格子图生图前，把角色三视图 + 服装资产 + 道具资产横向拼合成一张雪碧图，
 * 作为单一参考图传给图像模型，保证角色外形一致性。
 *
 * 布局（从左到右）：
 *   [三视图] | [服装（costume）] | [武器/道具/其他资产...]
 *
 * 每列等高（TARGET_HEIGHT），宽度按原图比例缩放。
 * 每列底部附 SVG 标签（角色名或资产名）。
 * 输出：临时 PNG 文件，使用后由调用方负责清理。
 */
import fs from "fs/promises";
import os from "os";
import path from "path";

import sharp from "sharp";

import { resolveGeneratedImagesRoot } from "../../runtime/appPaths";
import { resolveAssetFile } from "./ComicCharacterAssetService";
import type { CharacterAssetType } from "./ComicCharacterAssetService";

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_HEIGHT = 512;
const LABEL_HEIGHT = 28;
const LABEL_FONT_SIZE = 14;
const TOTAL_HEIGHT = TARGET_HEIGHT + LABEL_HEIGHT;
const MAX_ASSET_COLS = 5; // 最多额外资产列，避免图片过宽

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpriteSheetInput {
  characterId: string;
  characterName: string;
  /** 已解析的三视图磁盘路径，可以为空（无三视图时跳过） */
  sheetFilePath?: string;
  /** 服装资产（最多取第一个已完成的） */
  costumeAssets: Array<{ id: string; name: string }>;
  /** 其他资产（按传入顺序，最多 MAX_ASSET_COLS - 1 个） */
  propAssets: Array<{ id: string; name: string; assetType: CharacterAssetType }>;
}

export interface SpriteSheetResult {
  /** 临时 PNG 文件路径，调用方用完后调用 cleanup() */
  filePath: string;
  cleanup: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 把一段文字截断到最大长度（避免标签溢出） */
function truncLabel(text: string, maxLen = 12): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/** 生成底部标签 SVG Buffer */
function buildLabelBuffer(label: string, width: number): Buffer {
  const escaped = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL_HEIGHT}">
  <rect width="${width}" height="${LABEL_HEIGHT}" fill="#1a1a2e" opacity="0.85"/>
  <text x="${width / 2}" y="${LABEL_HEIGHT / 2 + LABEL_FONT_SIZE / 2 - 2}"
    font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="#ffffff"
    text-anchor="middle" dominant-baseline="auto">${escaped}</text>
</svg>`;
  return Buffer.from(svg);
}

/** 将图片缩放到目标高度，返回 sharp 实例和宽度 */
async function resizeToHeight(filePath: string, height: number): Promise<{ buf: Buffer; width: number }> {
  const meta = await sharp(filePath).metadata();
  const originalWidth = meta.width || 1;
  const originalHeight = meta.height || 1;
  const width = Math.round(height * (originalWidth / originalHeight)) || 1;
  const buf = await sharp(filePath)
    .resize({ width, height })
    .png()
    .toBuffer();
  return { buf, width };
}

/** 拼合单列（图片 + 标签）成 TARGET_HEIGHT + LABEL_HEIGHT 高的 Buffer */
async function buildColumn(filePath: string, label: string): Promise<{ buf: Buffer; width: number }> {
  const { buf: imgBuf, width } = await resizeToHeight(filePath, TARGET_HEIGHT);
  const labelBuf = buildLabelBuffer(truncLabel(label), width);

  // 合并图片 + 标签（竖排）
  const combined = await sharp({
    create: { width, height: TOTAL_HEIGHT, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([
      { input: imgBuf, top: 0, left: 0 },
      { input: labelBuf, top: TARGET_HEIGHT, left: 0 },
    ])
    .png()
    .toBuffer();

  return { buf: combined, width };
}

/** 当没有任何图片可用时生成占位列 */
function buildPlaceholderColumn(label: string, width = 256): { buf: Buffer; width: number } {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${TOTAL_HEIGHT}">
  <rect width="${width}" height="${TOTAL_HEIGHT}" fill="#f0f0f0"/>
  <text x="${width / 2}" y="${TARGET_HEIGHT / 2}"
    font-family="sans-serif" font-size="13" fill="#999999"
    text-anchor="middle" dominant-baseline="middle">无参考图</text>
  ${buildLabelBuffer(label, width).toString("utf-8").replace(/<svg[^>]*>|<\/svg>/g, "")}
</svg>`;
  return { buf: Buffer.from(svg), width };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ComicSpriteSheetService {
  /**
   * 根据输入构建雪碧图：三视图列 + 服装列 + 道具列...
   * 若所有列都没有可用图片则返回 null（调用方直接用原三视图或不用参考图）。
   */
  async buildSpriteSheet(input: SpriteSheetInput): Promise<SpriteSheetResult | null> {
    const columns: Array<{ buf: Buffer; width: number }> = [];

    // 列 1：三视图
    if (input.sheetFilePath) {
      try {
        const col = await buildColumn(input.sheetFilePath, `${truncLabel(input.characterName, 8)}·三视图`);
        columns.push(col);
      } catch (err) {
        console.warn(`[sprite] 三视图加载失败：${err instanceof Error ? err.message : err}`);
      }
    }

    // 列 2：服装（costume）—— 只取第一个有图的资产
    for (const asset of input.costumeAssets.slice(0, 3)) {
      const resolved = await resolveAssetFile(asset.id);
      if (!resolved) continue;
      try {
        const col = await buildColumn(resolved.filePath, `服装·${asset.name}`);
        columns.push(col);
        break;
      } catch { /* 跳过损坏图 */ }
    }

    // 列 3+：其他道具/武器等（上限 MAX_ASSET_COLS 总列数）
    const remaining = MAX_ASSET_COLS - columns.length;
    for (const asset of input.propAssets.slice(0, remaining)) {
      const resolved = await resolveAssetFile(asset.id);
      if (!resolved) continue;
      try {
        const col = await buildColumn(resolved.filePath, asset.name);
        columns.push(col);
      } catch { /* 跳过 */ }
    }

    // 没有任何可用图片
    if (columns.length === 0) return null;

    // 横向拼合
    const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);
    const compositeInputs: Array<sharp.OverlayOptions> = [];
    let xOffset = 0;
    for (const col of columns) {
      compositeInputs.push({ input: col.buf, top: 0, left: xOffset });
      xOffset += col.width;
    }

    const finalBuf = await sharp({
      create: { width: totalWidth, height: TOTAL_HEIGHT, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .composite(compositeInputs)
      .png()
      .toBuffer();

    // 写到临时文件
    const tmpFile = path.join(os.tmpdir(), `comic-sprite-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    await fs.writeFile(tmpFile, finalBuf);

    return {
      filePath: tmpFile,
      cleanup: async () => {
        try { await fs.unlink(tmpFile); } catch { /* 忽略 */ }
      },
    };
  }
}

export const comicSpriteSheetService = new ComicSpriteSheetService();
