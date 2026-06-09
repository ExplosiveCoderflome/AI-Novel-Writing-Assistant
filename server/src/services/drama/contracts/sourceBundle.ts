/**
 * 短剧模块对外契约：标准化内容包（SourceBundle）
 *
 * 这是短剧创作核心与「内容源」之间的唯一数据契约。任何内容源
 * （小说导入 / 独立原创 / 文本转剧本）都必须先产出 SourceBundle，
 * 核心引擎只面向 SourceBundle，与具体来源彻底解耦。
 *
 * 低耦合要点：本文件不 import 任何 novel 领域类型，保持来源无关。
 */

/** 内容源类型 */
export type DramaSourceType = "novel_import" | "original" | "text_import";

/** 事实分类（与短剧事实账本一致） */
export type SourceFactCategory = "completed" | "revealed" | "state_changed";

/** 内容源引用：定位一个内容来源 */
export interface SourceRef {
  type: DramaSourceType;
  /** 软引用：novel_import 时为 novelId；其余可空 */
  ref?: string;
  /** original：一句话灵感 / 题材输入 */
  inspiration?: string;
  /** text_import：原始文本 */
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
