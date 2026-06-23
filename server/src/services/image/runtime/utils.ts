/**
 * 图像生成 runtime 工具函数（单一来源）
 *
 * 替代散落在 4 个 comic service + 2 个 drama service 中的同名重复实现。
 */
import fs from "fs/promises";
import path from "path";

/** 安全 JSON 解析（解析失败返回 fallback） */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 把图片 URL（data: 或 http(s):）保存到本地磁盘 */
export async function saveImageToDisk(imageUrl: string, destPath: string): Promise<void> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  if (imageUrl.startsWith("data:")) {
    const [, b64 = ""] = imageUrl.split(",", 2);
    await fs.writeFile(destPath, Buffer.from(b64, "base64"));
  } else {
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`图片下载失败 (${resp.status}): ${imageUrl}`);
    await fs.writeFile(destPath, Buffer.from(await resp.arrayBuffer()));
  }
}

/** 根据 URL 推断扩展名（png/jpg/webp）；无法识别时默认 png */
export function inferExtension(imageUrl: string): string {
  if (imageUrl.startsWith("data:image/jpeg")) return "jpg";
  if (imageUrl.startsWith("data:image/webp")) return "webp";
  try {
    const ext = path.extname(new URL(imageUrl).pathname).replace(".", "").toLowerCase();
    return ext || "png";
  } catch {
    return "png";
  }
}

/** 标准化错误信息为字符串 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
