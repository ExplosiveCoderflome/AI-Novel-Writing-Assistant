/**
 * 防腐层（Anti-Corruption Layer）端口
 *
 * 短剧模块只认这个接口，不认任何内容源的内部结构。每种内容源
 * 实现一个 adapter，统一产出 SourceBundle。
 *
 * 可拆分保证：将来把 drama 模块整体迁出时，只需替换 adapter 实现
 * （或丢弃 novel_import adapter），核心引擎零改动。
 */
import type { DramaSourceType, SourceBundle, SourceRef } from "../contracts/sourceBundle";

export interface SourceContentPort {
  readonly sourceType: DramaSourceType;
  /** 把一个内容源引用解析为标准化内容包 */
  loadBundle(ref: SourceRef): Promise<SourceBundle>;
}

/**
 * Adapter 注册表：按 sourceType 路由到对应实现。
 * drama 模块的其余部分只通过此注册表获取内容，不直接依赖任何 adapter。
 */
export class SourceContentRegistry {
  private readonly adapters = new Map<DramaSourceType, SourceContentPort>();

  register(adapter: SourceContentPort): void {
    this.adapters.set(adapter.sourceType, adapter);
  }

  resolve(type: DramaSourceType): SourceContentPort {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`未注册的短剧内容源类型：${type}`);
    }
    return adapter;
  }

  has(type: DramaSourceType): boolean {
    return this.adapters.has(type);
  }
}

export const sourceContentRegistry = new SourceContentRegistry();
