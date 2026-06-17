/**
 * 短剧内容源端口（re-export + drama 专用别名）
 *
 * drama 内部代码继续从此路径 import，外部不感知迁移。
 * 新模块（comic）请直接 import services/adaptation/source/SourceContentPort。
 */
export type { SourceContentPort } from "../../adaptation/source/SourceContentPort";
export {
  SourceContentRegistry,
  adaptationSourceRegistry as sourceContentRegistry,
} from "../../adaptation/source/SourceContentPort";
