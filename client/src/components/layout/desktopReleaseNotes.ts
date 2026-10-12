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
  summary: "这次更新让创作工作台更容易保持清晰、稳定和贴合个人使用习惯。",
  items: [
    "创作中枢聚焦状态查询、问题诊断、执行记录和正式入口导航。",
    "新增浅色、深色、跟随系统以及墨砚、暖纸、夜航主题风格。",
    "首页和小说预览会跟随主题切换，视觉资源库支持按图片比例展示的瀑布流。",
  ],
};
