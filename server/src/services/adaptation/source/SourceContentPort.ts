/**
 * 改编内容源端口（Anti-Corruption Layer）
 *
 * drama 与 comic 共用此接口。每种内容源实现一个 adapter，
 * 统一产出 SourceBundle；上层改编引擎只面向此接口。
 *
 * loadChapterText：可选扩展——按章节区间取原文正文，
 * 供 comic 分格脚本生成时提取对白（novel_import 实现；其余源返回切片或空字符串）。
 */
import type { AdaptationSourceType, SourceBundle, SourceRef } from "../contracts/sourceBundle";

export interface SourceContentPort {
  readonly sourceType: AdaptationSourceType;
  loadBundle(ref: SourceRef): Promise<SourceBundle>;
  /** 按章节区间取原文正文（comic 分格对白的原文依据） */
  loadChapterText?(ref: SourceRef, start: number, end: number): Promise<string>;
}

export class SourceContentRegistry {
  private readonly adapters = new Map<AdaptationSourceType, SourceContentPort>();

  register(adapter: SourceContentPort): void {
    this.adapters.set(adapter.sourceType, adapter);
  }

  resolve(type: AdaptationSourceType): SourceContentPort {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`未注册的改编内容源类型：${type}`);
    }
    return adapter;
  }

  has(type: AdaptationSourceType): boolean {
    return this.adapters.has(type);
  }
}

export const adaptationSourceRegistry = new SourceContentRegistry();
