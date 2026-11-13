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
  summary: "这次更新修复了新书空白占位卷被误判为单卷规划的问题。",
  items: [
    "新书初始化时的空白占位卷不再被当作作者已确认的单卷规划。",
    "200 章目标可以正常建议并生成多卷结构，不会被固定为 1 卷。",
  ],
};
