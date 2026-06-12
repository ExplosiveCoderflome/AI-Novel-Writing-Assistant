/**
 * 改编模块通用内容包契约（SourceBundle）
 *
 * drama 与 comic 的共享基础契约：任何内容源（小说导入/独立原创/文本导入/漫画导入）
 * 都必须先产出 SourceBundle，改编产线引擎只面向 SourceBundle，与具体来源彻底解耦。
 *
 * 低耦合要点：本文件不 import 任何 novel/drama/comic 领域类型。
 */

/** 内容源类型（drama + comic 共用） */
export type AdaptationSourceType = "novel_import" | "original" | "text_import" | "comic_import";

/** 事实分类 */
export type SourceFactCategory = "completed" | "revealed" | "state_changed";

/** 内容源引用 */
export interface SourceRef {
  type: AdaptationSourceType;
  /** 软引用：novel_import 时为 novelId；其余可空 */
  ref?: string;
  /** original：一句话灵感 / 题材输入 */
  inspiration?: string;
  /** text_import / comic_import：原始文本 */
  rawText?: string;
}

/** 情节节拍（来源无关） */
export interface SourceBeat {
  order: number;
  summary: string;
  /** 可选：源章节区间（novel_import 时回填，用于改编映射） */
  sourceChapterStart?: number;
  sourceChapterEnd?: number;
}

/** 角色（来源无关） */
export interface SourceCharacter {
  name: string;
  persona?: string;
  relations?: string;
  /** 视觉提示（外形/气质），后续可升级为视觉锚点 */
  visualHint?: string;
  /** 软引用：源角色标识（novel_import 时为 characterId） */
  sourceCharacterRef?: string;
}

/** 硬事实（一致性约束） */
export interface SourceFact {
  text: string;
  category: SourceFactCategory;
}

/** 标准化内容包 */
export interface SourceBundle {
  synopsis: string;
  beats: SourceBeat[];
  characters: SourceCharacter[];
  worldNotes?: string;
  hardFacts?: SourceFact[];
  /** 原始文本（text_import 保留） */
  rawText?: string;
}
