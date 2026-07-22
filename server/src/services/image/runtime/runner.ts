/**
 * 图像生成 runner：执行"业务表 JSON 状态机 + 落盘"的唯一流程入口。
 *
 * 由 Adapter 适配各业务表的字段读写；本文件不感知具体业务模型。
 *
 * 流程：
 *   provider 解析/校验 → model 解析 → loadState → 归档历史/递增 version
 *   → save generating → generateImagesByProvider → 落盘 → cleanupOtherExts
 *   → save done（写 url/prompt/provider/generatedAt/history/referenceImages 等）
 *   catch → save error
 *
 * Adapter 的 buildExtraDoneState 用于业务定制（如 Drama 兼容字段、表情稿嵌套位置）。
 */
import path from "path";

import { AppError } from "../../../middleware/errorHandler";
import {
  generateImagesByProvider,
  isImageProviderSupported,
  resolveImageModel,
} from "../provider";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

import {
  DEFAULT_RUNTIME_PROVIDER,
  DEFAULT_RUNTIME_SIZE,
  type GeneratedImageHistoryItem,
  type GeneratedImageState,
  type ImageTargetAdapter,
  type RunImageGenerationOptions,
} from "./types";
import { describeError, inferExtension, saveImageToDisk } from "./utils";

const DEFAULT_HISTORY_MAX = 5;

/** 默认归档当前 done 状态为历史条目 */
function defaultArchive<TState extends GeneratedImageState>(current: TState): GeneratedImageHistoryItem | null {
  if (current.status !== "done") return null;
  return {
    version: current.version ?? 1,
    url: current.url,
    prompt: current.prompt,
    provider: current.provider,
    generatedAt: current.generatedAt,
  };
}

/** 计算下一版本号 */
function readVersion(state: GeneratedImageState): number {
  const v = Number(state.version);
  if (Number.isFinite(v) && v > 0) return Math.round(v);
  return state.status === "done" ? 1 : 0;
}

export async function runImageGeneration<TState extends GeneratedImageState>(
  adapter: ImageTargetAdapter<TState>,
  opts: RunImageGenerationOptions,
): Promise<TState> {
  // 1. provider 解析 + 校验
  const provider = (opts.provider as LLMProvider | undefined) ?? DEFAULT_RUNTIME_PROVIDER;
  if (!isImageProviderSupported(provider)) {
    throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);
  }

  // 2. model 解析
  const model = await resolveImageModel(provider);

  // 3. loadState + 归档/版本号
  const existing = await adapter.loadState();
  const versioning = adapter.versioning ?? { enabled: false };
  const archiver = versioning.archiveCurrent ?? defaultArchive;
  const archived = versioning.enabled ? await archiver(existing) : null;
  const prevHistory: GeneratedImageHistoryItem[] = Array.isArray(existing.history) ? existing.history : [];
  const nextHistory = (archived ? [...prevHistory, archived] : prevHistory).slice(-(versioning.maxHistory ?? DEFAULT_HISTORY_MAX));
  const nextVersion = existing.status === "done"
    ? readVersion(existing) + 1
    : Math.max(1, readVersion(existing) || 1);

  // 4. 标 generating
  const generatingState = {
    ...existing,
    status: "generating",
    provider,
    version: nextVersion,
    history: nextHistory,
    // 清掉上一轮 error 信息，避免误展示
    error: undefined,
  } as TState;
  await adapter.saveState(generatingState);

  // 5. 调 provider + 落盘
  try {
    const result = await generateImagesByProvider({
      sceneType: opts.sceneType ?? "chapter_illustration",
      provider,
      model,
      prompt: opts.prompt,
      ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
      size: opts.size ?? DEFAULT_RUNTIME_SIZE,
      count: opts.count ?? 1,
      ...(opts.refImagePaths && opts.refImagePaths.length > 0 ? { refImagePaths: opts.refImagePaths } : {}),
      ...(opts.refImages && opts.refImages.length > 0 ? { refImages: opts.refImages } : {}),
    });

    const imageUrl = result.images?.[0]?.url;
    if (!imageUrl) throw new Error("图片生成结果为空");

    const ext = inferExtension(imageUrl);
    const destPath = adapter.diskPath(ext);
    await saveImageToDisk(imageUrl, destPath);
    if (adapter.cleanupOtherExts) await adapter.cleanupOtherExts(ext);

    console.log(`[image.runtime] done kind=${adapter.kind} provider=${provider} model=${model} -> ${path.basename(destPath)}`);

    // 6. 写 done
    const doneBase: GeneratedImageState = {
      status: "done",
      version: nextVersion,
      url: adapter.publicUrl(),
      prompt: opts.prompt,
      provider,
      generatedAt: new Date().toISOString(),
      history: nextHistory,
      ...(opts.referenceImages && opts.referenceImages.length > 0 ? { referenceImages: opts.referenceImages } : {}),
    };
    const extraDone = adapter.buildExtraDoneState ? adapter.buildExtraDoneState(doneBase) : ({} as Partial<TState>);
    const doneState = { ...existing, ...doneBase, ...extraDone, error: undefined } as TState;
    await adapter.saveState(doneState);
    return doneState;
  } catch (err) {
    const errMsg = describeError(err);
    console.error(`[image.runtime] error kind=${adapter.kind} provider=${provider}:`, errMsg);
    const errorState = {
      ...existing,
      status: "error",
      provider,
      version: nextVersion,
      error: errMsg,
      history: nextHistory,
    } as TState;
    await adapter.saveState(errorState);
    throw err;
  }
}
