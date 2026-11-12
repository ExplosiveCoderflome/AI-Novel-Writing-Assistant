import { APP_VERSION } from "@/lib/constants";

export interface DesktopReleaseNotes {
  version: string;
  title: string;
  summary: string;
  items: string[];
}

export const CURRENT_DESKTOP_RELEASE_NOTES: DesktopReleaseNotes = {
  version: APP_VERSION,
  title: "本次更新介绍",
  summary: "这次更新把按大纲开书合入正式版，并修好短卷章纲配额与节奏板落库。",
  items: [
    "新增独立大纲工作台，可按已采用的大纲确认开书并逐章交接。",
    "文档站保留「落笔成书」开场动画与更新后的安装说明。",
    "已确定章数的短卷不再被抬到 12 章，节奏板可按实际覆盖落库。",
    "原稿修订入口默认关闭，未绑定大纲的全自动写作路径保持不变。",
  ],
};
