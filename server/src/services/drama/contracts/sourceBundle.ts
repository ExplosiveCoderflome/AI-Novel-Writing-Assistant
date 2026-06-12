/**
 * 短剧内容包契约（re-export from adaptation 共享层）
 *
 * drama 内部代码继续从此路径 import，外部不感知迁移。
 * 新模块（comic）请直接 import services/adaptation/contracts/sourceBundle。
 */
export type {
  SourceFactCategory,
  SourceRef,
  SourceBeat,
  SourceCharacter,
  SourceFact,
  SourceBundle,
} from "../../adaptation/contracts/sourceBundle";

/** drama 内部使用的内容源类型子集（不含 comic_import） */
export type DramaSourceType = "novel_import" | "original" | "text_import";
